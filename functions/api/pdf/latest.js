// Cloudflare Pages Function — /api/pdf/latest
// Génération PDF serveur de la dernière analyse enregistrée.

import { CORS_HEADERS, renderLatestPdf } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  return renderLatestPdf(context);
}
