import { runComposer } from "./composer-engine/composerEngine.js";
import { runReasoningEngine } from "./reasoning-engine/reasoningEngine.js";

function firstDefined(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : null;
}

function buildBusinessContext(analysis = {}) {
  const business = analysis.business || {};
  const normalized = business.normalized || {};

  return {
    name: firstDefined(business.name, business.nom, normalized.name),
    category: firstDefined(business.activity, normalized.category, normalized.type),
    city: business.ville || null,
    rating: business.rating ?? null,
    reviews: business.reviews ?? null,
    photos_count: business.photosCount ?? null,
    description_length: business.descriptionLength ?? null,
    secondary_categories: firstDefined(
      normalized.secondary_categories_count,
      arrayLength(normalized.secondary_categories),
      arrayLength(normalized.categories),
    ),
    position: business.localPosition ?? null,
  };
}

function buildBenchmarkContext(analysis = {}) {
  const business = analysis.business || {};
  const benchmark = analysis.benchmark || {};

  if (!benchmark.completedAt && benchmark.score === null) {
    return null;
  }

  return {
    benchmark_score: benchmark.score ?? null,
    panel_size: arrayLength(business.competitors),
    confidence: analysis.knowledge?.confidence || "established",
    percentiles: benchmark.percentiles || null,
    gaps: benchmark.gaps || null,
    competitor_median: {
      rating: benchmark.averages?.rating ?? null,
      reviews: benchmark.averages?.reviews ?? null,
      photos: benchmark.averages?.photos ?? null,
    },
    top_competitor: benchmark.topCompetitor || null,
  };
}

export function buildDocumentModelFromAnalysis(analysis = {}) {
  const businessContext = buildBusinessContext(analysis);
  const benchmarkContext = buildBenchmarkContext(analysis);
  const generatedAt = firstDefined(
    analysis.timestamps?.knowledgeCompletedAt,
    analysis.timestamps?.benchmarkCompletedAt,
    analysis.timestamps?.updatedAt,
    analysis.timestamps?.createdAt,
    new Date().toISOString(),
  );
  const reasoningInput = {
    analysisId: analysis.analysisId,
    generatedAt,
    context: {
      business: businessContext,
      benchmark: benchmarkContext,
    },
    knowledge: analysis.knowledge || {},
  };
  const reasoning = runReasoningEngine(reasoningInput);

  return runComposer({
    analysisId: analysis.analysisId,
    generatedAt,
    meta: {
      businessName: businessContext.name,
      category: businessContext.category,
      city: businessContext.city,
      generatedAt,
    },
    observation: businessContext,
    benchmark: benchmarkContext,
    knowledge: analysis.knowledge || {},
    reasoning,
  });
}
