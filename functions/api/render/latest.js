// Cloudflare Pages Function — /api/render/latest
// Prévisualisation HTML de la dernière analyse enregistrée.

import { CORS_HEADERS, renderLatestAnalysis } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  return renderLatestAnalysis(context);
}
