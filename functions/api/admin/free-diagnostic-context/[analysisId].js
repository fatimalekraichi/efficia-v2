import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import { buildFreeDiagnosticProductionContext, loadOrderContextForAnalysis } from "../../../lib/freeDiagnosticProductionLink.js";

export const onRequestOptions = () => onOptions();

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  }

  const db = requireOrdersDb(context.env);
  const analysis = await loadAnalysisById(db, analysisId);
  if (!analysis) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  if (analysis.reportType !== "free") {
    return jsonResponse({ success: false, error: "FREE_DIAGNOSTIC_REQUIRED" }, 409);
  }

  const orderContext = await loadOrderContextForAnalysis(db, analysisId);
  return jsonResponse({
    success: true,
    context: buildFreeDiagnosticProductionContext(analysis, orderContext),
  }, 200, { "Cache-Control": "no-store" });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
