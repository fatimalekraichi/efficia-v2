// Cloudflare Pages Function — /api/pdf/:analysisId
// Génération PDF serveur d'une analyse enregistrée.

import { CORS_HEADERS, renderPdfById } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  return renderPdfById(context, context.params?.analysisId);
}
