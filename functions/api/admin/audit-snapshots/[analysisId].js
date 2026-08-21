import { isValidAnalysisId } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import {
  duplicateQuestionnaireSnapshot,
  finalizeQuestionnaireSnapshot,
  loadQuestionnaireSnapshot,
} from "../../../lib/auditQuestionnaireSnapshots.js";

async function readPayload(request) {
  try { return await request.json(); } catch { return null; }
}

async function authorizedContext(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return { response: auth.response };
  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return { response: jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400) };
  }
  return { analysisId, db: requireOrdersDb(context.env) };
}

export async function onRequestGet(context) {
  const authorized = await authorizedContext(context);
  if (authorized.response) return authorized.response;
  const snapshot = await loadQuestionnaireSnapshot(authorized.db, authorized.analysisId);
  if (!snapshot) {
    return jsonResponse({
      success: false,
      error: "QUESTIONNAIRE_SNAPSHOT_NOT_FOUND",
      message: "Aucune sauvegarde finale du questionnaire n’existe pour cet audit.",
    }, 404);
  }
  return jsonResponse({ success: true, snapshot }, 200, { "Cache-Control": "no-store" });
}

export async function onRequestPost(context) {
  const authorized = await authorizedContext(context);
  if (authorized.response) return authorized.response;
  const payload = await readPayload(context.request);
  const action = normalizeText(payload?.action);

  if (action === "finalize") {
    const analysis = await authorized.db.prepare(`
      SELECT report_type FROM analyses WHERE analysis_id = ? LIMIT 1
    `).bind(authorized.analysisId).first();
    if (!analysis) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
    const result = await finalizeQuestionnaireSnapshot(authorized.db, authorized.analysisId, {
      pdfFilename: normalizeText(payload?.pdfFilename).slice(0, 240),
    });
    if (!result.ok) {
      return jsonResponse({
        success: false,
        error: result.error,
        message: "Aucune sauvegarde du questionnaire n’existe : le PDF n’a pas finalisé l’audit.",
      }, 409);
    }
    return jsonResponse({ success: true, snapshot: result.snapshot, created: result.created });
  }

  if (action === "duplicate") {
    const idempotencyKey = normalizeText(payload?.idempotencyKey);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) {
      return jsonResponse({ success: false, error: "INVALID_IDEMPOTENCY_KEY" }, 400);
    }
    const result = await duplicateQuestionnaireSnapshot(
      authorized.db,
      authorized.analysisId,
      idempotencyKey,
    );
    if (!result.ok) {
      const status = result.error === "ANALYSIS_NOT_FOUND" ? 404 : 409;
      return jsonResponse({ success: false, error: result.error }, status);
    }
    return jsonResponse({ success: true, duplicate: result }, result.created ? 201 : 200);
  }

  return jsonResponse({ success: false, error: "INVALID_ACTION" }, 400);
}
