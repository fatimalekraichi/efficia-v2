// Cloudflare Pages Function — /api/benchmark
// Calcule le benchmark concurrentiel à partir d'une analyse déjà collectée.

import { verifyConnectorToken } from "./_auth.js";
import { benchmarkEngine } from "../lib/benchmarkEngine.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

function isValidAnalysisId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value.trim());
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = verifyConnectorToken(context);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  const db = env.ORDERS_DB;
  if (!db) {
    console.error("benchmark: binding ORDERS_DB indisponible.");
    return jsonResponse({ success: false, error: "Server configuration error." }, 500);
  }

  let analysisId = "";
  try {
    const payload = await request.json();
    analysisId = typeof payload?.analysisId === "string" ? payload.analysisId.trim() : "";
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await db.prepare(`
    SELECT
      analysis_id,
      rating,
      reviews,
      photos_count,
      local_position,
      competitors_json
    FROM analyses
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();

  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  const benchmark = benchmarkEngine(analysis);
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE analyses
    SET
      benchmark_score = ?,
      avg_rating = ?,
      avg_reviews = ?,
      avg_photos = ?,
      rating_gap = ?,
      reviews_gap = ?,
      photos_gap = ?,
      rating_percentile = ?,
      reviews_percentile = ?,
      photos_percentile = ?,
      top_competitor_name = ?,
      top_competitor_rating = ?,
      top_competitor_reviews = ?,
      benchmark_completed_at = ?,
      updated_at = ?
    WHERE analysis_id = ?
  `).bind(
    benchmark.benchmark_score,
    benchmark.avg_rating,
    benchmark.avg_reviews,
    benchmark.avg_photos,
    benchmark.rating_gap,
    benchmark.reviews_gap,
    benchmark.photos_gap,
    benchmark.rating_percentile,
    benchmark.reviews_percentile,
    benchmark.photos_percentile,
    benchmark.top_competitor_name,
    benchmark.top_competitor_rating,
    benchmark.top_competitor_reviews,
    now,
    now,
    analysisId,
  ).run();

  return jsonResponse({
    success: true,
    analysisId,
    benchmarkScore: benchmark.benchmark_score,
    competitorCount: benchmark.competitor_count,
    topCompetitor: benchmark.top_competitor_name,
  });
}
