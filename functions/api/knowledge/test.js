// Cloudflare Pages Function — /api/knowledge/test
// Construit l'entrée et la sortie du Knowledge Engine sans écrire dans D1.

import { CORS_HEADERS, jsonResponse, runKnowledgeFromRequest } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const result = await runKnowledgeFromRequest(context);
  if (!result.ok) return result.response;

  return jsonResponse({
    input: result.input,
    output: result.output,
  });
}
