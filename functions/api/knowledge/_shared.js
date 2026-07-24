import { runKnowledgeEngine } from "../../lib/knowledgeEngine.js";
import { verifyConnectorToken } from "../_auth.js";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

export function isValidAnalysisId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value.trim());
}

export async function readAnalysisId(request) {
  try {
    const payload = await request.json();
    return typeof payload?.analysisId === "string" ? payload.analysisId.trim() : "";
  } catch {
    return "";
  }
}

export function verifyKnowledgeRequest(context) {
  const auth = verifyConnectorToken(context);
  if (!auth.ok) return { ok: false, response: jsonResponse({ success: false, error: auth.error }, auth.status) };

  const db = context.env.ORDERS_DB;
  if (!db) {
    console.error("knowledge: binding ORDERS_DB indisponible.");
    return { ok: false, response: jsonResponse({ success: false, error: "Server configuration error." }, 500) };
  }

  return { ok: true, db };
}

export async function loadKnowledgeAnalysis(db, analysisId) {
  return db.prepare(`
    SELECT
      analysis_id,
      name,
      activity,
      rating,
      reviews,
      photos_count,
      description_length,
      local_position,
      competitors_json,
      benchmark_score,
      avg_rating,
      avg_reviews,
      avg_photos,
      rating_gap,
      reviews_gap,
      photos_gap,
      rating_percentile,
      reviews_percentile,
      photos_percentile,
      top_competitor_name,
      top_competitor_rating,
      top_competitor_reviews,
      benchmark_completed_at
    FROM analyses
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseCompetitorCount(competitorsJson) {
  if (typeof competitorsJson !== "string" || !competitorsJson.trim()) return 0;
  try {
    const parsed = JSON.parse(competitorsJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function buildKnowledgeInput(analysis) {
  const descriptionLength = toNumber(analysis.description_length);

  return {
    analysisId: analysis.analysis_id,
    business: {
      name: analysis.name || null,
      category: analysis.activity || null,
      rating: toNumber(analysis.rating),
      reviews: toNumber(analysis.reviews),
      photos_count: toNumber(analysis.photos_count),
      has_description: descriptionLength === null ? null : descriptionLength > 0,
      description_length: descriptionLength,
      secondary_categories: null,
      position: toNumber(analysis.local_position),
      last_review_age_days: null,
      owner_response_rate: null,
    },
    benchmark: {
      benchmark_score: toNumber(analysis.benchmark_score),
      panel_size: parseCompetitorCount(analysis.competitors_json),
      confidence: "established",
      percentiles: {
        rating: toNumber(analysis.rating_percentile),
        reviews: toNumber(analysis.reviews_percentile),
        photos: toNumber(analysis.photos_percentile),
      },
      gaps: {
        rating: toNumber(analysis.rating_gap),
        reviews: toNumber(analysis.reviews_gap),
        photos: toNumber(analysis.photos_gap),
      },
      competitor_median: {
        rating: toNumber(analysis.avg_rating),
        reviews: toNumber(analysis.avg_reviews),
        photos: toNumber(analysis.avg_photos),
      },
      top_competitor: {
        name: analysis.top_competitor_name || null,
        rating: toNumber(analysis.top_competitor_rating),
        reviews: toNumber(analysis.top_competitor_reviews),
        photos: null,
      },
    },
  };
}

export async function runKnowledgeFromRequest(context) {
  const verified = verifyKnowledgeRequest(context);
  if (!verified.ok) return verified;

  const analysisId = await readAnalysisId(context.request);
  if (!isValidAnalysisId(analysisId)) {
    return { ok: false, response: jsonResponse({ success: false, error: "Invalid analysisId." }, 400) };
  }

  const analysis = await loadKnowledgeAnalysis(verified.db, analysisId);
  if (!analysis) {
    return { ok: false, response: jsonResponse({ success: false, error: "Analysis not found." }, 404) };
  }

  if (!analysis.benchmark_completed_at) {
    return { ok: false, response: jsonResponse({ success: false, error: "Benchmark not completed" }, 409) };
  }

  const input = buildKnowledgeInput(analysis);
  const output = runKnowledgeEngine(input);
  return { ok: true, db: verified.db, analysisId, input, output };
}
