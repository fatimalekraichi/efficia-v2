// Cloudflare Pages Function — /api/analysis/:analysisId
// Couche de lecture complète d'une analyse enregistrée.

import { CORS_HEADERS, isValidAnalysisId, jsonResponse, loadAnalysisById, verifyAnalysisRequest } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const verified = verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  const analysisId = context.params?.analysisId;
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(verified.db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return jsonResponse(analysis);
}
