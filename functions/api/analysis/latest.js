// Cloudflare Pages Function — /api/analysis/latest
// Renvoie la dernière analyse enregistrée.

import { CORS_HEADERS, jsonResponse, loadLatestAnalysis, verifyAnalysisRequest } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const verified = verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  const analysis = await loadLatestAnalysis(verified.db);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return jsonResponse(analysis);
}
