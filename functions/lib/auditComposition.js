import { runComposer } from "./composer-engine/composerEngine.js";
import { resolveAnalysisReportType } from "./reportDepth.js";
import { runReasoningEngine } from "./reasoning-engine/reasoningEngine.js";

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : null;
}

export function buildBusinessContext(analysis = {}) {
  const business = analysis.business || {};
  const reviewed = business.reviewed || {};
  const normalized = business.normalized || {};

  return {
    name: firstDefined(reviewed.name, business.name, business.nom, normalized.name),
    category: firstDefined(reviewed.category, business.activity, normalized.category, normalized.type),
    city: reviewed.city || business.ville || null,
    rating: reviewed.rating ?? business.rating ?? null,
    reviews: reviewed.reviews ?? business.reviews ?? null,
    photos_count: reviewed.photosCount ?? business.photosCount ?? null,
    description_length: reviewed.descriptionLength ?? business.descriptionLength ?? null,
    description_status: reviewed.descriptionStatus || null,
    review_response_status: reviewed.reviewResponseStatus || null,
    photo_quality: reviewed.photoQuality || null,
    photo_relevance: reviewed.photoRelevance || null,
    profile_completeness: reviewed.profileCompleteness || null,
    category_relevance: reviewed.categoryRelevance || null,
    hours_accuracy: reviewed.hoursAccuracy || null,
    visual_consistency: reviewed.visualConsistency || null,
    secondary_categories: firstDefined(
      normalized.secondary_categories_count,
      arrayLength(normalized.secondary_categories),
      arrayLength(normalized.categories),
    ),
    position: reviewed.localPosition ?? business.localPosition ?? null,
  };
}

// Point 3 du plan (2026-07-31, Sprint 1 "Constats irréfutables") : combien de
// concurrents du panel affichent une note strictement supérieure à celle du
// client, pour la phrase "Vous êtes actuellement derrière N concurrents".
// Ne recalcule rien du Score Efficia ni du benchmark : simple tri de la liste
// de concurrents déjà collectée (analysis.business.competitors), déjà lue par
// ailleurs pour l'admin (js/admin-audit-review.js).
function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function computeCompetitiveRank(analysis = {}) {
  const business = analysis.business || {};
  const competitors = Array.isArray(business.competitors) ? business.competitors : [];
  const clientRating = toNumber(business.reviewed?.rating ?? business.rating);
  if (!competitors.length || clientRating === null) return null;

  const ratings = competitors.map((competitor) => toNumber(competitor?.rating)).filter((value) => value !== null);
  if (!ratings.length) return null;

  const aheadCount = ratings.filter((rating) => rating > clientRating).length;
  return { aheadCount, totalCompetitors: ratings.length };
}

export function buildBenchmarkContext(analysis = {}) {
  const business = analysis.business || {};
  const benchmark = analysis.benchmark || {};
  const reviewed = benchmark.reviewed || null;
  const reviewedScore = analysis.reviewedScore || null;
  const score = reviewedScore?.roundedScore ?? reviewedScore?.score ?? benchmark.score ?? null;

  if (!benchmark.completedAt && score === null) {
    return null;
  }

  return {
    benchmark_score: score,
    scoring_version: reviewedScore?.scoringVersion || analysis.scoringVersion || null,
    panel_size: reviewed?.competitorCount ?? arrayLength(business.competitors),
    confidence: reviewed?.benchmarkConfidence || analysis.knowledge?.confidence || "established",
    percentiles: benchmark.percentiles || null,
    gaps: reviewed?.gaps || benchmark.gaps || null,
    competitor_median: {
      rating: reviewed?.averages?.rating ?? benchmark.averages?.rating ?? null,
      reviews: reviewed?.averages?.reviews ?? benchmark.averages?.reviews ?? null,
      photos: reviewed?.averages?.photos ?? benchmark.averages?.photos ?? null,
    },
    top_competitor: benchmark.topCompetitor || null,
    rank: computeCompetitiveRank(analysis),
  };
}

// Score Efficia historique déjà calculé (scoreEngine.js, non modifié ici) :
// simple passthrough des données déjà persistées (reviewed_score_json /
// score_inputs_json), sans aucun recalcul. Alimente uniquement
// documentModel.freeDiagnostic (Étape A) ; aucun impact sur le Score Efficia
// ni sur le documentModel premium existant.
export function buildScoreContext(analysis = {}) {
  const reviewedScore = analysis.reviewedScore || null;
  const scoreInputs = analysis.scoreInputs || null;

  return {
    band: reviewedScore?.band || null,
    indices: reviewedScore?.indices || null,
    categories: reviewedScore?.categories || null,
    projectedPackScore: reviewedScore?.projectedPackScore || null,
    criteria: scoreInputs?.criteria || null,
  };
}

export function getCompositionGeneratedAt(analysis = {}) {
  return firstDefined(
    analysis.timestamps?.knowledgeCompletedAt,
    analysis.timestamps?.benchmarkCompletedAt,
    analysis.timestamps?.updatedAt,
    analysis.timestamps?.createdAt,
    new Date().toISOString(),
  );
}

export function buildReasoningInputFromAnalysis(analysis = {}) {
  return {
    analysisId: analysis.analysisId,
    reportType: resolveAnalysisReportType(analysis.reportType),
    generatedAt: getCompositionGeneratedAt(analysis),
    context: {
      business: buildBusinessContext(analysis),
      benchmark: buildBenchmarkContext(analysis),
    },
    knowledge: analysis.knowledge || {},
  };
}

export function buildComposerBundleFromAnalysis(analysis = {}, reasoning = null) {
  const businessContext = buildBusinessContext(analysis);
  const generatedAt = getCompositionGeneratedAt(analysis);

  return {
    analysisId: analysis.analysisId,
    reportType: resolveAnalysisReportType(analysis.reportType),
    generatedAt,
    meta: {
      businessName: businessContext.name,
      category: businessContext.category,
      city: businessContext.city,
      generatedAt,
    },
    observation: businessContext,
    benchmark: buildBenchmarkContext(analysis),
    knowledge: analysis.knowledge || {},
    reasoning: reasoning || analysis.reasoning || {},
    scoreContext: buildScoreContext(analysis),
  };
}

export function runReasoningForAnalysis(analysis = {}) {
  const input = buildReasoningInputFromAnalysis(analysis);
  return {
    input,
    output: runReasoningEngine(input),
  };
}

export function runComposerForAnalysis(analysis = {}, reasoning = null) {
  const input = buildComposerBundleFromAnalysis(analysis, reasoning);
  return {
    input,
    output: runComposer(input),
  };
}
