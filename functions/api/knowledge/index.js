// Cloudflare Pages Function — /api/knowledge
// Branche le Knowledge Engine pur au pipeline existant.

import { CORS_HEADERS, jsonResponse, runKnowledgeFromRequest } from "./_shared.js";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const result = await runKnowledgeFromRequest(context);
  if (!result.ok) return result.response;

  const now = new Date().toISOString();
  await result.db.prepare(`
    UPDATE analyses
    SET
      knowledge_json = ?,
      knowledge_completed_at = ?,
      updated_at = ?
    WHERE analysis_id = ?
  `).bind(
    JSON.stringify(result.output),
    now,
    now,
    result.analysisId,
  ).run();

  return jsonResponse({
    analysisId: result.analysisId,
    status: "completed",
    knowledge: result.output,
  });
}
