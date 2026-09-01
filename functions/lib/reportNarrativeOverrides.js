import { COMPOSER_VERSION } from "./composer-engine/composerVersion.js";
import { normalizeQuestionnaireAnswers } from "./auditQuestionnaireSnapshots.js";

export const REPORT_NARRATIVE_ANOMALY_CATEGORIES = Object.freeze([
  "texte faux ou contradictoire",
  "texte trop générique",
  "mauvaise adaptation au secteur",
  "problème de ton",
  "répétition",
  "problème de mise en page",
  "autre",
]);

/*
 * Les textes automatiques sont produits côté navigateur à partir des données
 * de la fiche. Une limite par libellé (90, 110, etc.) finissait donc par être
 * plus courte que certaines branches parfaitement valides du générateur.
 *
 * La règle est volontairement unique : chaque champ dispose d'un plancher
 * éditorial de 400 caractères et, dès que le texte automatique est plus long,
 * sa limite devient sa longueur + max(25 %, 50 caractères). L'API applique la
 * même fonction que l'éditeur ; aucun des deux ne tronque une valeur.
 */
export const REPORT_NARRATIVE_LIMIT_POLICY = Object.freeze({
  minimumMaxLength: 400,
  headroomRatio: 0.25,
  minimumHeadroom: 50,
  maximumAutomaticSnapshotLength: 4_000,
});

export const REPORT_NARRATIVE_TITLE_LIMIT_POLICY = Object.freeze({
  minimumMaxLength: 120,
  headroomRatio: 0.25,
  minimumHeadroom: 25,
});

const fields = [
  ["summary.general", "Synthèse générale", "Page 1 · Votre situation"],
  ["weaknesses.summary", "Synthèse des faiblesses", "Page 2 · Pourquoi ce score"],
  ["strength.1", "Point fort 1", "Page 4 · Vos priorités"],
  ["strength.2", "Point fort 2", "Page 4 · Vos priorités"],
  ...[1, 2, 3].flatMap((rank) => [
    [`priority.${rank}.title`, `Priorité ${rank} · Titre`, rank < 3 ? "Page 4 · Vos priorités" : "Page 5 · Comment les résoudre", REPORT_NARRATIVE_TITLE_LIMIT_POLICY],
    [`priority.${rank}.observation`, `Priorité ${rank} · Constat`, rank < 3 ? "Page 4 · Vos priorités" : "Page 5 · Comment les résoudre"],
    [`priority.${rank}.impact`, `Priorité ${rank} · Impact prospect`, rank < 3 ? "Page 4 · Vos priorités" : "Page 5 · Comment les résoudre"],
    [`priority.${rank}.first_action`, `Priorité ${rank} · Première action`, rank < 3 ? "Page 4 · Vos priorités" : "Page 5 · Comment les résoudre"],
    [`priority.${rank}.expected_result`, `Priorité ${rank} · Résultat attendu`, rank < 3 ? "Page 4 · Vos priorités" : "Page 5 · Comment les résoudre"],
    [`priority.${rank}.action_example`, `Priorité ${rank} · Exemple ou aide d’action`, rank < 3 ? "Page 4 · Vos priorités" : "Page 5 · Comment les résoudre"],
  ]),
  ["conclusion.commercial", "Conclusion commerciale", "Page 6 · Passer à l’action"],
];

export const REPORT_NARRATIVE_FIELDS = Object.freeze(Object.fromEntries(fields.map(([id, label, section, policy = REPORT_NARRATIVE_LIMIT_POLICY]) => [id, Object.freeze({
  id,
  label,
  section,
  maxLength: policy.minimumMaxLength,
  ...policy,
})])));

export const REPORT_NARRATIVE_FIELD_IDS = Object.freeze(Object.keys(REPORT_NARRATIVE_FIELDS));

const FIELD_ID_SET = new Set(REPORT_NARRATIVE_FIELD_IDS);
const CATEGORY_SET = new Set(REPORT_NARRATIVE_ANOMALY_CATEGORIES);
const encoder = new TextEncoder();

function parseContextJson(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "null"); } catch { return null; }
}

function canonicalizeContextValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeContextValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeContextValue(value[key])]));
}

export function serializeReportNarrativeContext(value) {
  return JSON.stringify(canonicalizeContextValue(value));
}

export function reportNarrativeCatalog() {
  return REPORT_NARRATIVE_FIELD_IDS.map((id) => ({ ...REPORT_NARRATIVE_FIELDS[id] }));
}

export function isAllowedReportNarrativeField(fieldId) {
  return typeof fieldId === "string" && FIELD_ID_SET.has(fieldId);
}

export function countReportNarrativeCharacters(value) {
  return Array.from(String(value || "")).length;
}

export function reportNarrativeTextMaxLength(fieldId, automaticText = "") {
  if (!isAllowedReportNarrativeField(fieldId)) return null;
  const field = REPORT_NARRATIVE_FIELDS[fieldId];
  const automaticLength = countReportNarrativeCharacters(String(automaticText).trim());
  const headroom = Math.max(
    Math.ceil(automaticLength * field.headroomRatio),
    field.minimumHeadroom,
  );
  return Math.max(field.minimumMaxLength, automaticLength + headroom);
}

export function validateReportNarrativeText(fieldId, value, automaticText = "") {
  if (!isAllowedReportNarrativeField(fieldId)) return { ok: false, error: "UNAUTHORIZED_FIELD_ID" };
  if (typeof value !== "string") return { ok: false, error: "INVALID_TEXT_TYPE" };
  const text = value.trim();
  if (!text) return { ok: false, error: "EMPTY_CUSTOM_TEXT" };
  const length = countReportNarrativeCharacters(text);
  const maxLength = reportNarrativeTextMaxLength(fieldId, automaticText);
  if (length > maxLength) return { ok: false, error: "TEXT_TOO_LONG", maxLength, length };
  return { ok: true, text, length, maxLength };
}

export function validateReportNarrativeCategory(value, weeklyReview) {
  if (!weeklyReview && (value === null || value === undefined || value === "")) return { ok: true, category: null };
  if (typeof value !== "string" || !CATEGORY_SET.has(value)) return { ok: false, error: "INVALID_ANOMALY_CATEGORY" };
  return { ok: true, category: value };
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashReportNarrativeContext(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return hex(digest);
}

export async function loadReportNarrativeContext(db, analysisId) {
  const row = await db.prepare(`
    SELECT
      a.nom, a.ville, a.activity, a.rating, a.reviews, a.photos_count, a.description_length,
      a.search_query, a.local_position, a.competitors_json, a.fiche_json, a.normalized_json,
      a.manual_review_json, a.reviewed_observation_json, a.reviewed_benchmark_json,
      a.score_inputs_json, a.reviewed_score_json, a.scoring_version,
      a.document_model_json,
      d.answers_json AS draft_answers_json,
      s.answers_json AS snapshot_answers_json
    FROM analyses a
    LEFT JOIN audit_drafts d ON d.analysis_id = a.analysis_id
    LEFT JOIN audit_questionnaire_snapshots s ON s.analysis_id = a.analysis_id
    WHERE a.analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
  if (!row) return null;
  const questionnaire = normalizeQuestionnaireAnswers(
    parseContextJson(row.draft_answers_json || row.snapshot_answers_json),
  );
  const contextHash = await hashReportNarrativeContext(serializeReportNarrativeContext({
    business: {
      name: row.nom || null,
      city: row.ville || null,
      activity: row.activity || null,
      rating: row.rating ?? null,
      reviews: row.reviews ?? null,
      photosCount: row.photos_count ?? null,
      descriptionLength: row.description_length ?? null,
      searchQuery: row.search_query || null,
      localPosition: row.local_position ?? null,
      competitors: parseContextJson(row.competitors_json),
      fiche: parseContextJson(row.fiche_json),
      normalized: parseContextJson(row.normalized_json),
    },
    review: {
      manual: parseContextJson(row.manual_review_json),
      observation: parseContextJson(row.reviewed_observation_json),
      benchmark: parseContextJson(row.reviewed_benchmark_json),
      scoreInputs: parseContextJson(row.score_inputs_json),
      reviewedScore: parseContextJson(row.reviewed_score_json),
      scoringVersion: row.scoring_version || null,
    },
    questionnaire,
  }));
  let generatorVersion = COMPOSER_VERSION;
  try {
    generatorVersion = JSON.parse(row.document_model_json || "null")?.composerVersion || COMPOSER_VERSION;
  } catch {
    generatorVersion = COMPOSER_VERSION;
  }
  return { contextHash, generatorVersion };
}

export async function loadReportNarrativeOverrides(db, analysisId) {
  try {
    const statement = db.prepare(`
      SELECT field_id, custom_text, automatic_text_snapshot, generator_version,
             review_weekly, anomaly_category, needs_review, created_at, updated_at
      FROM report_narrative_overrides
      WHERE analysis_id = ?
      ORDER BY field_id
    `).bind(analysisId);
    if (typeof statement?.all !== "function") return [];
    const result = await statement.all();
    return (result?.results || [])
      .filter((row) => isAllowedReportNarrativeField(row?.field_id) && typeof row?.custom_text === "string")
      .map((row) => ({
        fieldId: row.field_id,
        customText: row.custom_text,
        automaticText: row.automatic_text_snapshot || "",
        generatorVersion: row.generator_version || null,
        weeklyReview: Number(row.review_weekly) === 1,
        anomalyCategory: row.anomaly_category || null,
        needsReview: Number(row.needs_review) === 1,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      }));
  } catch (error) {
    if (/no such table|does not exist/i.test(String(error?.message || error))) return [];
    throw error;
  }
}

export async function markReportNarrativeOverridesNeedsReview(db, analysisId) {
  try {
    await db.prepare(`
      UPDATE report_narrative_overrides
      SET needs_review = 1
      WHERE analysis_id = ?
    `).bind(analysisId).run();
  } catch (error) {
    if (!/no such table|does not exist/i.test(String(error?.message || error))) throw error;
  }
}

export async function markReportNarrativeOverridesForContext(db, analysisId, contextHash) {
  try {
    await db.prepare(`
      UPDATE report_narrative_overrides
      SET needs_review = 1
      WHERE analysis_id = ? AND context_hash <> ?
    `).bind(analysisId, contextHash).run();
  } catch (error) {
    if (!/no such table|does not exist/i.test(String(error?.message || error))) throw error;
  }
}

export async function markReportNarrativeOverridesForCurrentContext(db, analysisId) {
  try {
    const existing = await db.prepare(`
      SELECT 1 FROM report_narrative_overrides WHERE analysis_id = ? LIMIT 1
    `).bind(analysisId).first();
    if (!existing) return false;
  } catch (error) {
    if (/no such table|does not exist/i.test(String(error?.message || error))) return false;
    throw error;
  }
  const context = await loadReportNarrativeContext(db, analysisId);
  if (!context) return false;
  await markReportNarrativeOverridesForContext(db, analysisId, context.contextHash);
  return true;
}

function overrideMap(overrides) {
  return new Map((Array.isArray(overrides) ? overrides : [])
    .filter((item) => isAllowedReportNarrativeField(item?.fieldId) && typeof item?.customText === "string")
    .map((item) => [item.fieldId, item.customText]));
}

export function applyReportNarrativeOverrides(documentModel = {}, overrides = []) {
  const values = overrideMap(overrides);
  if (!values.size) return documentModel;

  const model = {
    ...documentModel,
    executiveSummary: { ...(documentModel.executiveSummary || {}) },
    strengths: (documentModel.strengths || []).map((item) => ({ ...item })),
    freeDiagnostic: {
      ...(documentModel.freeDiagnostic || {}),
      priorities: (documentModel.freeDiagnostic?.priorities || []).map((item) => ({ ...item })),
    },
  };
  if (values.has("summary.general")) model.executiveSummary.text = values.get("summary.general");
  if (values.has("weaknesses.summary")) model.freeDiagnostic.weaknessesSummary = values.get("weaknesses.summary");
  for (const index of [0, 1]) {
    const id = `strength.${index + 1}`;
    if (values.has(id) && model.strengths[index]) model.strengths[index].message = values.get(id);
  }
  for (const index of [0, 1, 2]) {
    const priority = model.freeDiagnostic.priorities[index];
    if (!priority) continue;
    const rank = index + 1;
    if (values.has(`priority.${rank}.title`)) priority.title = values.get(`priority.${rank}.title`);
    if (values.has(`priority.${rank}.observation`)) priority.observed = values.get(`priority.${rank}.observation`);
    if (values.has(`priority.${rank}.impact`)) priority.prospectView = values.get(`priority.${rank}.impact`);
    if (values.has(`priority.${rank}.first_action`)) priority.firstAction = values.get(`priority.${rank}.first_action`);
    if (values.has(`priority.${rank}.expected_result`)) priority.expectedResult = values.get(`priority.${rank}.expected_result`);
    if (values.has(`priority.${rank}.action_example`)) priority.actionExample = values.get(`priority.${rank}.action_example`);
  }
  if (values.has("conclusion.commercial")) model.freeDiagnostic.commercialConclusion = values.get("conclusion.commercial");
  return model;
}

export const REPORT_NARRATIVE_GENERATOR_VERSION = COMPOSER_VERSION;
