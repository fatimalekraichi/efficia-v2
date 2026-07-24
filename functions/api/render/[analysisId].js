// Cloudflare Pages Function — /api/render/:analysisId
// Prévisualisation HTML d'une analyse enregistrée.

import { CORS_HEADERS, renderAnalysisById } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  return renderAnalysisById(context, context.params?.analysisId);
}
