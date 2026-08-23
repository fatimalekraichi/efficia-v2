import { QUESTIONNAIRE_VERSION } from "./score-efficia/questionnaireRules.js";

export const SUPPORTED_QUESTIONNAIRE_VERSIONS = Object.freeze([
  "score-efficia-questionnaire-v2",
  "score-efficia-questionnaire-v3",
  QUESTIONNAIRE_VERSION,
]);

const SUPPORTED_VERSION_SET = new Set(SUPPORTED_QUESTIONNAIRE_VERSIONS);

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "null"); } catch { return null; }
}

export function resolveQuestionnaireVersion(answers, storedVersion = "") {
  const embedded = answers?.questionnaireVersion;
  if (SUPPORTED_VERSION_SET.has(embedded)) return embedded;
  if (SUPPORTED_VERSION_SET.has(storedVersion)) return storedVersion;
  return QUESTIONNAIRE_VERSION;
}

export function normalizeQuestionnaireAnswers(answers, storedVersion = "") {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  const normalized = { ...answers };
  normalized.questionnaireVersion = resolveQuestionnaireVersion(answers, storedVersion);

  // v2/v3 du générateur gratuit utilisaient `reponses`, tandis que v4 et le
  // brouillon D1 utilisent `responses`. Conserver les deux clés évite toute
  // réécriture destructive et permet aux anciens écrans de relire le payload.
  if (!normalized.responses && normalized.reponses && typeof normalized.reponses === "object") {
    normalized.responses = normalized.reponses;
  }
  if (!normalized.reponses && normalized.responses && typeof normalized.responses === "object") {
    normalized.reponses = normalized.responses;
  }
  return normalized;
}

export function formatQuestionnaireSnapshot(row) {
  if (!row) return null;
  const rawAnswers = parseJson(row.answers_json);
  return {
    snapshotId: row.snapshot_id,
    analysisId: row.analysis_id,
    sourceDraftId: row.source_draft_id,
    reportType: row.report_type,
    answersVersion: resolveQuestionnaireVersion(rawAnswers, row.answers_version),
    answers: normalizeQuestionnaireAnswers(rawAnswers, row.answers_version),
    currentStep: row.current_step,
    pdfFilename: row.pdf_filename || null,
    finalizedAt: row.finalized_at,
  };
}

export async function loadQuestionnaireSnapshot(db, analysisId) {
  const row = await db.prepare(`
    SELECT *
    FROM audit_questionnaire_snapshots
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
  return formatQuestionnaireSnapshot(row);
}

export async function finalizeQuestionnaireSnapshot(db, analysisId, {
  pdfFilename = "",
  completion = "pdf_generated",
  approvedAt = "",
} = {}) {
  const existing = await loadQuestionnaireSnapshot(db, analysisId);
  let insertSnapshot = null;
  const now = new Date().toISOString();

  if (!existing) {
    const draft = await db.prepare(`
      SELECT *
      FROM audit_drafts
      WHERE analysis_id = ?
      LIMIT 1
    `).bind(analysisId).first();
    if (!draft) return { ok: false, error: "QUESTIONNAIRE_SNAPSHOT_UNAVAILABLE" };

    const rawAnswers = parseJson(draft.answers_json);
    const answers = normalizeQuestionnaireAnswers(rawAnswers, draft.answers_version);
    if (!answers) return { ok: false, error: "QUESTIONNAIRE_SNAPSHOT_INVALID" };
    const answersVersion = resolveQuestionnaireVersion(answers, draft.answers_version);
    insertSnapshot = db.prepare(`
      INSERT OR IGNORE INTO audit_questionnaire_snapshots (
        snapshot_id, analysis_id, source_draft_id, report_type, answers_version,
        answers_json, current_step, pdf_filename, finalized_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      analysisId,
      draft.draft_id,
      draft.report_type,
      answersVersion,
      JSON.stringify(answers),
      draft.current_step,
      pdfFilename || null,
      now,
    );
  }

  const markCompleted = completion === "approved"
    ? db.prepare(`
      UPDATE analyses
      SET
        status = CASE WHEN status = 'pdf_generated' THEN status ELSE 'approved' END,
        approved_at = COALESCE(approved_at, ?),
        updated_at = ?
      WHERE analysis_id = ?
    `).bind(approvedAt || now, now, analysisId)
    : db.prepare(`
      UPDATE analyses
      SET status = 'pdf_generated', pdf_generated_at = COALESCE(pdf_generated_at, ?), updated_at = ?
      WHERE analysis_id = ?
    `).bind(now, now, analysisId);

  const statements = insertSnapshot ? [insertSnapshot, markCompleted] : [markCompleted];
  const results = await db.batch(statements);

  const snapshot = await loadQuestionnaireSnapshot(db, analysisId);
  return {
    ok: Boolean(snapshot),
    created: Boolean(insertSnapshot) && Number(results?.[0]?.meta?.changes || 0) === 1,
    snapshot,
  };
}

async function loadQuestionnaireDuplication(db, analysisId, idempotencyKey) {
  return db.prepare(`
    SELECT new_analysis_id
    FROM audit_questionnaire_duplications
    WHERE source_analysis_id = ? AND idempotency_key = ?
    LIMIT 1
  `).bind(analysisId, idempotencyKey).first();
}

function formatDuplication(snapshot, analysisId, created) {
  return {
    ok: true,
    created,
    analysisId,
    draftId: analysisId,
    reportType: snapshot.reportType,
  };
}

export function prepareDuplicatedDraftAnswers(answers, storedVersion = "") {
  const normalized = normalizeQuestionnaireAnswers(answers, storedVersion);
  if (!normalized) return null;

  // Le snapshot reste immuable. La copie conserve les réponses factuelles,
  // mais aucun contenu narratif généré ou statut d'approbation de la source.
  // Ces contenus seront reconstruits avec le contexte et l'identifiant de la
  // nouvelle analyse lors de la confirmation globale.
  const duplicated = JSON.parse(JSON.stringify(normalized));
  delete duplicated.action;
  delete duplicated.analysisId;
  delete duplicated.confirmAll;
  delete duplicated.executionPlan;
  return duplicated;
}

export async function duplicateQuestionnaireSnapshot(db, analysisId, idempotencyKey) {
  const snapshot = await loadQuestionnaireSnapshot(db, analysisId);
  if (!snapshot) return { ok: false, error: "QUESTIONNAIRE_SNAPSHOT_NOT_FOUND" };

  const existing = await loadQuestionnaireDuplication(db, analysisId, idempotencyKey);
  if (existing) return formatDuplication(snapshot, existing.new_analysis_id, false);

  const newAnalysisId = crypto.randomUUID();
  const newDraftId = newAnalysisId;
  const now = new Date().toISOString();
  const duplicatedAnswers = prepareDuplicatedDraftAnswers(snapshot.answers, snapshot.answersVersion);
  if (!duplicatedAnswers) return { ok: false, error: "QUESTIONNAIRE_SNAPSHOT_INVALID" };
  const duplicatedManualReview = snapshot.reportType === "premium"
    ? JSON.stringify(duplicatedAnswers)
    : null;

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
    )
    SELECT
      ?, nom, ville, query, place_id, name, rating, reviews,
      photos_count, description_length, 'awaiting_review', fiche_json,
      normalized_json, ?, ?, activity, search_query, local_position,
      competitors_json, benchmark_score, avg_rating, avg_reviews, avg_photos,
      rating_gap, reviews_gap, photos_gap, rating_percentile,
      reviews_percentile, photos_percentile, top_competitor_name,
      top_competitor_rating, top_competitor_reviews, benchmark_completed_at,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, NULL,
      NULL, NULL, report_type, NULL, NULL, NULL
    FROM analyses
    WHERE analysis_id = ?
  `).bind(newAnalysisId, now, now, duplicatedManualReview, analysisId);

  const copyDraft = db.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)
  `).bind(
    newDraftId,
    newAnalysisId,
    snapshot.reportType,
    snapshot.answersVersion,
    JSON.stringify(duplicatedAnswers),
    snapshot.currentStep || "questionnaire",
    now,
    now,
  );

  const recordDuplication = db.prepare(`
    INSERT INTO audit_questionnaire_duplications (
      source_analysis_id, idempotency_key, new_analysis_id, created_at
    ) VALUES (?, ?, ?, ?)
  `).bind(analysisId, idempotencyKey, newAnalysisId, now);

  const recordManualOrigin = db.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES (?, ?, 'duplicate_manual', ?, ?, 'completed', ?, ?)
  `).bind(
    `duplicate_${analysisId}_${idempotencyKey}`,
    newAnalysisId,
    snapshot.reportType,
    snapshot.reportType === "premium" ? "manual_unpaid" : "not_applicable",
    now,
    now,
  );

  try {
    const results = await db.batch([copyAnalysis, copyDraft, recordDuplication, recordManualOrigin]);
    if (!Number(results?.[0]?.meta?.changes || 0)) {
      return { ok: false, error: "ANALYSIS_NOT_FOUND" };
    }
  } catch (error) {
    // A concurrent request with the same key can win the UNIQUE constraint.
    // Its transaction is then the canonical result; this transaction rolled back.
    const concurrent = await loadQuestionnaireDuplication(db, analysisId, idempotencyKey);
    if (concurrent) return formatDuplication(snapshot, concurrent.new_analysis_id, false);
    throw error;
  }

  return formatDuplication(snapshot, newAnalysisId, true);
}
