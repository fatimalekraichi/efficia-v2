import { buildScoreCatalog } from "./score-efficia/scoreCatalog.js";
import { SCORING_VERSION } from "./score-efficia/scoreConfig.js";
import {
  normalizeLocationCriterion,
  normalizeQuestionnaireConditions,
  QUESTIONNAIRE_VERSION,
  sanitizeConditionalCriteria,
} from "./score-efficia/questionnaireRules.js";
import { normalizeQuestionnaireAnswers } from "./auditQuestionnaireSnapshots.js";

const TRANSFER_TYPE = "free_to_manual_premium";
const EMPTY_CITY_VALUES = new Set(["", "non renseignée", "non renseignee", "inconnue", "unknown"]);

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function usableCity(value) {
  const city = cleanText(value, 120);
  return EMPTY_CITY_VALUES.has(city.toLocaleLowerCase("fr")) ? "" : city;
}

function firstCity(...values) {
  for (const value of values) {
    const city = usableCity(value);
    if (city) return city;
  }
  return "";
}

function sourceFields(answers) {
  return parseObject(answers?.fields);
}

export function resolvePremiumReferenceCity({ administratorCity = "", answers = {}, analysis = {} } = {}) {
  const fields = sourceFields(answers);
  const normalized = parseObject(analysis.normalized_json);
  const fiche = parseObject(analysis.fiche_json);
  return firstCity(
    administratorCity,
    normalized.city,
    normalized.borough,
    fiche.city,
    fiche.borough,
    fields["p-ville"],
    answers.city,
    answers.ville,
    analysis.ville,
  );
}

function premiumCriteriaFromFreeResponses(answers) {
  const sourceResponses = parseObject(answers.responses || answers.reponses);
  const categories = buildScoreCatalog().categories;
  return categories.flatMap((category) => category.criteria.map((criterion) => {
    const source = sourceResponses[criterion.key];
    if (source === undefined || source === null || criterion.key === "adresse") return null;
    const response = source && typeof source === "object" ? source : { points: source };
    let option = Number.isInteger(response.selectedOptionIndex)
      ? criterion.options.find((item) => item.index === response.selectedOptionIndex)
      : null;
    if (!option && response.points !== undefined && response.points !== null) {
      option = criterion.options.find((item) => Number(item.points) === Number(response.points));
    }
    if (!option) return null;
    const checklist = Array.isArray(response.checklist) ? response.checklist.map((item) => {
      if (Number.isInteger(Number(item)) && criterion.checklist[Number(item)] !== undefined) {
        return criterion.checklist[Number(item)];
      }
      return cleanText(item, 140);
    }).filter(Boolean) : [];
    return {
      key: criterion.key,
      category: category.label,
      question: criterion.question,
      value: option.value,
      label: option.label,
      checklist: [...new Set(checklist)],
      selectedOptionIndex: option.index,
      points: option.points,
      source: "imported_free_snapshot",
    };
  }).filter(Boolean));
}

export function buildPremiumDraftFromFreeSnapshot({ snapshot, analysis, administratorCity = "", importedAt } = {}) {
  const sourceAnswers = normalizeQuestionnaireAnswers(snapshot?.answers, snapshot?.answersVersion) || {};
  const fields = { ...sourceFields(sourceAnswers) };
  const referenceCity = resolvePremiumReferenceCity({ administratorCity, answers: sourceAnswers, analysis });
  if (referenceCity) fields["p-ville"] = referenceCity;
  const importedCriteria = premiumCriteriaFromFreeResponses(sourceAnswers);
  const conditions = normalizeQuestionnaireConditions(sourceAnswers, importedCriteria);
  const criteriaReview = sanitizeConditionalCriteria(
    normalizeLocationCriterion(importedCriteria, conditions),
    conditions,
  );
  const visibleKeys = new Set(criteriaReview.map((item) => item.key));
  const importedResponses = parseObject(sourceAnswers.responses || sourceAnswers.reponses);
  const responses = Object.fromEntries(Object.entries(importedResponses).filter(([key]) => visibleKeys.has(key)));
  return {
    ...sourceAnswers,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    scoringVersion: SCORING_VERSION,
    reportType: "premium",
    fields,
    responses,
    reponses: responses,
    ...conditions,
    criteriaReview,
    confirmedCity: referenceCity,
    importedFromFree: {
      sourceAnalysisId: analysis.analysis_id,
      sourceSnapshotId: snapshot.snapshotId,
      importedAt,
      reviewConfirmed: false,
    },
  };
}

async function loadTransferByKey(db, idempotencyKey) {
  return db.prepare(`
    SELECT source_analysis_id, target_analysis_id
    FROM audit_premium_transfers
    WHERE idempotency_key = ?
    LIMIT 1
  `).bind(idempotencyKey).first();
}

async function loadTransferSource(db, sourceAnalysisId) {
  return db.prepare(`
    SELECT a.*, s.snapshot_id, s.report_type AS snapshot_report_type,
           s.answers_version, s.answers_json, s.current_step, s.finalized_at
    FROM analyses a
    JOIN audit_questionnaire_snapshots s ON s.analysis_id = a.analysis_id
    WHERE a.analysis_id = ?
    LIMIT 1
  `).bind(sourceAnalysisId).first();
}

function formatTransfer(targetAnalysisId, created) {
  return {
    ok: true,
    created,
    analysisId: targetAnalysisId,
    draftId: targetAnalysisId,
    reportType: "premium",
    transferType: TRANSFER_TYPE,
  };
}

export async function createPremiumFromCompletedFree(db, {
  sourceAnalysisId,
  idempotencyKey,
  administratorCity = "",
} = {}) {
  const existing = await loadTransferByKey(db, idempotencyKey);
  if (existing) {
    if (existing.source_analysis_id !== sourceAnalysisId) {
      return { ok: false, error: "IDEMPOTENCY_KEY_SOURCE_CONFLICT" };
    }
    return formatTransfer(existing.target_analysis_id, false);
  }

  const source = await loadTransferSource(db, sourceAnalysisId);
  if (!source) return { ok: false, error: "SOURCE_SNAPSHOT_NOT_FOUND" };
  if (source.report_type !== "free" || source.snapshot_report_type !== "free") {
    return { ok: false, error: "SOURCE_NOT_FREE" };
  }
  if (source.status !== "pdf_generated") return { ok: false, error: "SOURCE_NOT_COMPLETED" };
  const sourceAnswers = normalizeQuestionnaireAnswers(parseObject(source.answers_json), source.answers_version);
  if (!sourceAnswers || sourceAnswers.questionnaireVersion !== QUESTIONNAIRE_VERSION) {
    return { ok: false, error: "SOURCE_SNAPSHOT_INVALID" };
  }

  const targetAnalysisId = crypto.randomUUID();
  const now = new Date().toISOString();
  const snapshot = {
    snapshotId: source.snapshot_id,
    answersVersion: source.answers_version,
    answers: sourceAnswers,
  };
  const draft = buildPremiumDraftFromFreeSnapshot({
    snapshot,
    analysis: source,
    administratorCity,
    importedAt: now,
  });
  const referenceCity = draft.confirmedCity || "";
  const fields = sourceFields(sourceAnswers);
  const sourceName = cleanText(fields["p-entreprise"], 200) || source.nom;
  const sourceActivity = cleanText(fields["p-activite"], 160) || source.activity;

  const copyAnalysis = db.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, place_id, name, rating, reviews,
      photos_count, description_length, status, fiche_json, normalized_json,
      created_at, updated_at, activity, search_query, local_position,
      competitors_json, benchmark_score, avg_rating, avg_reviews, avg_photos,
      rating_gap, reviews_gap, photos_gap, rating_percentile,
      reviews_percentile, photos_percentile, top_competitor_name,
      top_competitor_rating, top_competitor_reviews, benchmark_completed_at,
      knowledge_json, knowledge_completed_at, reasoning_json,
      document_model_json, reasoning_completed_at, composer_completed_at,
      order_id, manual_review_json, reviewed_observation_json,
      reviewed_benchmark_json, review_completed_at, approved_at,
      pdf_generated_at, report_type, score_inputs_json, reviewed_score_json,
      scoring_version
    ) SELECT
      ?, ?, ?, ?, place_id, name, rating, reviews,
      photos_count, description_length, 'awaiting_review', fiche_json, normalized_json,
      ?, ?, ?, search_query, local_position,
      competitors_json, benchmark_score, avg_rating, avg_reviews, avg_photos,
      rating_gap, reviews_gap, photos_gap, rating_percentile,
      reviews_percentile, photos_percentile, top_competitor_name,
      top_competitor_rating, top_competitor_reviews, benchmark_completed_at,
      NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'premium', NULL, NULL, ?
    FROM analyses WHERE analysis_id = ?
  `).bind(
    targetAnalysisId,
    sourceName,
    referenceCity,
    [sourceActivity, referenceCity].filter(Boolean).join(" ") || source.query,
    now,
    now,
    sourceActivity,
    SCORING_VERSION,
    sourceAnalysisId,
  );
  const createDraft = db.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES (?, ?, 'draft', 'premium', ?, ?, 'questionnaire', ?, ?)
  `).bind(targetAnalysisId, targetAnalysisId, QUESTIONNAIRE_VERSION, JSON.stringify(draft), now, now);
  const createMetadata = db.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES (?, ?, 'admin_manual', 'premium', 'manual_unpaid', 'completed', ?, ?)
  `).bind(`premium_transfer_${targetAnalysisId}`, targetAnalysisId, now, now);
  const createTransfer = db.prepare(`
    INSERT INTO audit_premium_transfers (
      source_analysis_id, idempotency_key, source_snapshot_id,
      target_analysis_id, transfer_type, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sourceAnalysisId, idempotencyKey, source.snapshot_id, targetAnalysisId, TRANSFER_TYPE, now);

  try {
    const results = await db.batch([copyAnalysis, createDraft, createMetadata, createTransfer]);
    if (!Number(results?.[0]?.meta?.changes || 0)) return { ok: false, error: "SOURCE_NOT_FOUND" };
  } catch (error) {
    const concurrent = await loadTransferByKey(db, idempotencyKey);
    if (concurrent) {
      if (concurrent.source_analysis_id !== sourceAnalysisId) {
        return { ok: false, error: "IDEMPOTENCY_KEY_SOURCE_CONFLICT" };
      }
      return formatTransfer(concurrent.target_analysis_id, false);
    }
    throw error;
  }
  return formatTransfer(targetAnalysisId, true);
}

export async function loadPremiumTransferForTarget(db, targetAnalysisId) {
  return db.prepare(`
    SELECT source_analysis_id, source_snapshot_id, target_analysis_id,
           transfer_type, created_at
    FROM audit_premium_transfers
    WHERE target_analysis_id = ?
    LIMIT 1
  `).bind(targetAnalysisId).first();
}

export const __test__ = { premiumCriteriaFromFreeResponses, usableCity, loadTransferByKey };
