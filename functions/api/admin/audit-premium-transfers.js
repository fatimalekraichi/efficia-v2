import { isValidAnalysisId } from "../analysis/_shared.js";
import {
  jsonResponse,
  normalizeText,
  requireAdminSession,
  requireOrdersDb,
  requireSameOriginMutation,
} from "../../admin/_shared.js";
import { createPremiumFromCompletedFree } from "../../lib/auditPremiumTransfers.js";
import { QUESTIONNAIRE_VERSION } from "../../lib/score-efficia/questionnaireRules.js";

const KEY_PATTERN = /^[a-zA-Z0-9_-]{16,100}$/;
const ALLOWED_PAYLOAD_KEYS = new Set([
  "operation",
  "sourceAnalysisId",
  "idempotencyKey",
  "referenceCity",
]);

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const db = requireOrdersDb(context.env);
  const result = await db.prepare(`
    SELECT a.analysis_id, a.nom, a.ville, s.finalized_at, s.answers_version,
           json_extract(s.answers_json, '$.score') AS score
    FROM analyses a
    JOIN audit_questionnaire_snapshots s ON s.analysis_id = a.analysis_id
    WHERE a.report_type = 'free'
      AND s.report_type = 'free'
      AND a.status = 'pdf_generated'
      AND s.answers_version = ?
    ORDER BY s.finalized_at DESC
    LIMIT 100
  `).bind(QUESTIONNAIRE_VERSION).all();
  return jsonResponse({
    success: true,
    sources: (result?.results || []).map((row) => ({
      analysisId: row.analysis_id,
      company: row.nom,
      city: row.ville,
      finalizedAt: row.finalized_at,
      answersVersion: row.answers_version,
      score: row.score === null || row.score === undefined ? null : Number(row.score),
    })),
  }, 200, { "Cache-Control": "no-store" });
}

export async function onRequestPost(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const sameOrigin = requireSameOriginMutation(context.request);
  if (!sameOrigin.ok) return sameOrigin.response;
  let payload;
  try { payload = await context.request.json(); } catch { payload = null; }
  if (!payload) return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  if (normalizeText(payload.operation) !== "create_premium_from_free") {
    return jsonResponse({ success: false, error: "INVALID_TRANSFER_OPERATION" }, 400);
  }
  const sourceAnalysisId = normalizeText(payload.sourceAnalysisId);
  const idempotencyKey = normalizeText(payload.idempotencyKey);
  if (!isValidAnalysisId(sourceAnalysisId)) return jsonResponse({ success: false, error: "INVALID_SOURCE_ANALYSIS_ID" }, 400);
  if (!KEY_PATTERN.test(idempotencyKey)) return jsonResponse({ success: false, error: "INVALID_IDEMPOTENCY_KEY" }, 400);
  if (Object.keys(payload).some((key) => !ALLOWED_PAYLOAD_KEYS.has(key))) {
    return jsonResponse({ success: false, error: "FORGED_TRANSFER_PAYLOAD" }, 400);
  }
  try {
    const result = await createPremiumFromCompletedFree(requireOrdersDb(context.env), {
      sourceAnalysisId,
      idempotencyKey,
      administratorCity: normalizeText(payload.referenceCity).slice(0, 120),
    });
    if (!result.ok) {
      const status = ["SOURCE_SNAPSHOT_NOT_FOUND", "SOURCE_NOT_FOUND"].includes(result.error) ? 404 : 409;
      return jsonResponse({ success: false, error: result.error }, status);
    }
    return jsonResponse({
      success: true,
      transfer: result,
      links: { review: `/admin/audit-review/${encodeURIComponent(result.analysisId)}` },
    }, result.created ? 201 : 200);
  } catch (error) {
    const missingMigration = String(error?.message || error).includes("audit_premium_transfers");
    const reference = crypto.randomUUID();
    console.error(JSON.stringify({
      message: "premium transfer failed",
      reference,
      source_analysis_id: sourceAnalysisId,
      missing_migration: missingMigration,
    }));
    return jsonResponse({
      success: false,
      error: missingMigration ? "MISSING_D1_MIGRATION" : "TRANSFER_FAILED",
      reference,
    }, 500);
  }
}
