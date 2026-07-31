import { runKnowledgeEngine } from "../../lib/knowledgeEngine.js";
import { resolveAnalysisReportType } from "../../lib/reportDepth.js";
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
      benchmark_completed_at,
      reviewed_observation_json,
      reviewed_benchmark_json,
      reviewed_score_json,
      scoring_version,
      report_type
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

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function buildKnowledgeInput(analysis) {
  const descriptionLength = toNumber(analysis.description_length);
  const reviewedObservation = parseJson(analysis.reviewed_observation_json);
  const reviewedBenchmark = parseJson(analysis.reviewed_benchmark_json);
  const reviewedScore = parseJson(analysis.reviewed_score_json);
  const scoreEfficia = toNumber(reviewedScore?.roundedScore) ?? toNumber(reviewedScore?.score);
  const reviewedDescriptionLength = toNumber(reviewedObservation?.descriptionLength);
  const finalDescriptionLength = reviewedDescriptionLength ?? descriptionLength;
  const descriptionStatus = reviewedObservation?.descriptionStatus || null;
  const competitorCount = toNumber(reviewedBenchmark?.competitorCount);
  const avg = reviewedBenchmark?.averages || {};
  const gaps = reviewedBenchmark?.gaps || {};

  return {
    analysisId: analysis.analysis_id,
    reportType: resolveAnalysisReportType(analysis.report_type),
    business: {
      name: reviewedObservation?.name || analysis.name || null,
      category: reviewedObservation?.category || analysis.activity || null,
      rating: toNumber(reviewedObservation?.rating) ?? toNumber(analysis.rating),
      reviews: toNumber(reviewedObservation?.reviews) ?? toNumber(analysis.reviews),
      photos_count: toNumber(reviewedObservation?.photosCount) ?? toNumber(analysis.photos_count),
      has_description: descriptionStatus === "absent" ? false : finalDescriptionLength === null ? null : finalDescriptionLength > 0,
      description_length: finalDescriptionLength,
      description_status: descriptionStatus,
      secondary_categories: reviewedObservation?.secondaryCategories || null,
      position: toNumber(reviewedObservation?.localPosition) ?? toNumber(analysis.local_position),
      last_review_age_days: null,
      owner_response_rate: reviewedObservation?.reviewResponseStatus === "unknown" ? null : null,
      review_response_status: reviewedObservation?.reviewResponseStatus || "unknown",
      photo_quality: reviewedObservation?.photoQuality || "unknown",
      photo_relevance: reviewedObservation?.photoRelevance || "unknown",
      profile_completeness: reviewedObservation?.profileCompleteness || "unknown",
      category_relevance: reviewedObservation?.categoryRelevance || "unknown",
      hours_accuracy: reviewedObservation?.hoursAccuracy || "unknown",
      visual_consistency: reviewedObservation?.visualConsistency || "unknown",
    },
    benchmark: {
      benchmark_score: scoreEfficia ?? toNumber(analysis.benchmark_score),
      scoring_version: reviewedScore?.scoringVersion || analysis.scoring_version || null,
      panel_size: competitorCount ?? parseCompetitorCount(analysis.competitors_json),
      confidence: reviewedBenchmark?.benchmarkConfidence || "established",
      percentiles: {
        rating: toNumber(analysis.rating_percentile),
        reviews: toNumber(analysis.reviews_percentile),
        photos: toNumber(analysis.photos_percentile),
      },
      gaps: {
        rating: toNumber(gaps.rating) ?? toNumber(analysis.rating_gap),
        reviews: toNumber(gaps.reviews) ?? toNumber(analysis.reviews_gap),
        photos: toNumber(gaps.photos) ?? toNumber(analysis.photos_gap),
      },
      competitor_median: {
        rating: toNumber(avg.rating) ?? toNumber(analysis.avg_rating),
        reviews: toNumber(avg.reviews) ?? toNumber(analysis.avg_reviews),
        photos: toNumber(avg.photos) ?? toNumber(analysis.avg_photos),
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
