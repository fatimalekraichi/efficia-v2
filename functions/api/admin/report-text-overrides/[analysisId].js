import { isValidAnalysisId } from "../../analysis/_shared.js";
import {
  jsonResponse,
  normalizeText,
  onOptions,
  requireAdminSession,
  requireOrdersDb,
  requireSameOriginMutation,
} from "../../../admin/_shared.js";
import {
  REPORT_NARRATIVE_FIELD_IDS,
  REPORT_NARRATIVE_LIMIT_POLICY,
  isAllowedReportNarrativeField,
  loadReportNarrativeContext,
  loadReportNarrativeOverrides,
  reportNarrativeCatalog,
  validateReportNarrativeCategory,
  validateReportNarrativeText,
} from "../../../lib/reportNarrativeOverrides.js";

const ALLOWED_PAYLOAD_KEYS = new Set(["analysisId", "overrides", "restoredFieldIds"]);
const ALLOWED_OVERRIDE_KEYS = new Set(["fieldId", "text", "automaticText", "weeklyReview", "anomalyCategory"]);

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key));
}

async function readPayload(request) {
  try { return await request.json(); } catch { return null; }
}

async function analysisExists(db, analysisId) {
  return db.prepare(`SELECT analysis_id FROM analyses WHERE analysis_id = ? LIMIT 1`).bind(analysisId).first();
}

function invalidOverrideResponse(error, details = {}) {
  const status = error === "UNAUTHORIZED_FIELD_ID" ? 403 : (error === "TEXT_TOO_LONG" ? 413 : 400);
  return jsonResponse({ success: false, error, ...details }, status);
}

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  const db = requireOrdersDb(context.env);
  if (!await analysisExists(db, analysisId)) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  const overrides = await loadReportNarrativeOverrides(db, analysisId);
  return jsonResponse({ success: true, analysisId, catalog: reportNarrativeCatalog(), overrides }, 200, { "Cache-Control": "no-store" });
}

export async function onRequestPut(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const sameOrigin = requireSameOriginMutation(context.request);
  if (!sameOrigin.ok) return sameOrigin.response;
  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  const payload = await readPayload(context.request);
  if (!hasOnlyKeys(payload, ALLOWED_PAYLOAD_KEYS)) return jsonResponse({ success: false, error: "INVALID_PAYLOAD_STRUCTURE" }, 400);
  if (normalizeText(payload.analysisId) !== analysisId) return jsonResponse({ success: false, error: "ANALYSIS_ID_MISMATCH" }, 409);
  if (!Array.isArray(payload.overrides) || !Array.isArray(payload.restoredFieldIds)) {
    return jsonResponse({ success: false, error: "INVALID_PAYLOAD_STRUCTURE" }, 400);
  }
  if (payload.overrides.length > REPORT_NARRATIVE_FIELD_IDS.length || payload.restoredFieldIds.length > REPORT_NARRATIVE_FIELD_IDS.length) {
    return jsonResponse({ success: false, error: "TOO_MANY_OVERRIDES" }, 400);
  }

  const normalized = [];
  const seen = new Set();
  for (const item of payload.overrides) {
    if (!hasOnlyKeys(item, ALLOWED_OVERRIDE_KEYS)) return jsonResponse({ success: false, error: "INVALID_OVERRIDE_STRUCTURE" }, 400);
    const fieldId = normalizeText(item.fieldId);
    if (seen.has(fieldId)) return jsonResponse({ success: false, error: "DUPLICATE_FIELD_ID" }, 400);
    seen.add(fieldId);
    if (typeof item.automaticText !== "string" || Array.from(item.automaticText).length > REPORT_NARRATIVE_LIMIT_POLICY.maximumAutomaticSnapshotLength) {
      return jsonResponse({ success: false, error: "INVALID_AUTOMATIC_TEXT", fieldId }, 400);
    }
    const text = validateReportNarrativeText(fieldId, item.text, item.automaticText);
    if (!text.ok) return invalidOverrideResponse(text.error, { fieldId, maxLength: text.maxLength, length: text.length });
    if (typeof item.weeklyReview !== "boolean") return jsonResponse({ success: false, error: "INVALID_WEEKLY_REVIEW", fieldId }, 400);
    const category = validateReportNarrativeCategory(item.anomalyCategory, item.weeklyReview);
    if (!category.ok) return invalidOverrideResponse(category.error, { fieldId });
    normalized.push({
      fieldId,
      text: text.text,
      automaticText: item.automaticText,
      weeklyReview: item.weeklyReview,
      anomalyCategory: category.category,
    });
  }

  const restored = [];
  for (const rawId of payload.restoredFieldIds) {
    if (typeof rawId !== "string" || !isAllowedReportNarrativeField(rawId)) {
      return invalidOverrideResponse("UNAUTHORIZED_FIELD_ID", { fieldId: normalizeText(rawId) });
    }
    if (seen.has(rawId) || restored.includes(rawId)) return jsonResponse({ success: false, error: "DUPLICATE_FIELD_ID" }, 400);
    restored.push(rawId);
  }

  const db = requireOrdersDb(context.env);
  if (!await analysisExists(db, analysisId)) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  const contextInfo = await loadReportNarrativeContext(db, analysisId);
  if (!contextInfo) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  const now = new Date().toISOString();
  const statements = [
    ...restored.map((fieldId) => db.prepare(`
      DELETE FROM report_narrative_overrides WHERE analysis_id = ? AND field_id = ?
    `).bind(analysisId, fieldId)),
    ...normalized.map((item) => db.prepare(`
      INSERT INTO report_narrative_overrides (
        analysis_id, field_id, custom_text, automatic_text_snapshot, generator_version,
        review_weekly, anomaly_category, needs_review, context_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(analysis_id, field_id) DO UPDATE SET
        custom_text = excluded.custom_text,
        automatic_text_snapshot = excluded.automatic_text_snapshot,
        generator_version = excluded.generator_version,
        review_weekly = excluded.review_weekly,
        anomaly_category = excluded.anomaly_category,
        needs_review = 0,
        context_hash = excluded.context_hash,
        updated_at = excluded.updated_at
    `).bind(
      analysisId,
      item.fieldId,
      item.text,
      item.automaticText,
      contextInfo.generatorVersion,
      item.weeklyReview ? 1 : 0,
      item.anomalyCategory,
      contextInfo.contextHash,
      now,
      now,
    )),
  ];
  try {
    if (statements.length) await db.batch(statements);
  } catch (error) {
    if (/no such table|does not exist/i.test(String(error?.message || error))) {
      return jsonResponse({ success: false, error: "TEXT_OVERRIDES_NOT_CONFIGURED" }, 503);
    }
    throw error;
  }
  const overrides = await loadReportNarrativeOverrides(db, analysisId);
  return jsonResponse({ success: true, analysisId, catalog: reportNarrativeCatalog(), overrides });
}

export const onRequestOptions = () => onOptions();

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

export const __test__ = { hasOnlyKeys };
