import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import { loadPremiumAuthorization } from "../../../lib/premiumAuthorization.js";

export const onRequestOptions = () => onOptions();

export async function onRequestPost(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  }

  const db = requireOrdersDb(context.env);
  const analysis = await loadAnalysisById(db, analysisId);
  if (!analysis) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);

  const authorization = await loadPremiumAuthorization(db, analysisId);
  if (!authorization.allowed) {
    return jsonResponse({ success: false, error: "PREMIUM_NOT_AUTHORIZED" }, 403, {
      "Cache-Control": "no-store",
    });
  }

  return jsonResponse({ success: true, premiumAllowed: true }, 200, {
    "Cache-Control": "no-store",
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
