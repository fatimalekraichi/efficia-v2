const SIGNAL_METRICS = {
  description: {
    metric: "description_length",
    unit: "caractères",
    value: (context) => context?.business?.description_length,
    competitorMedian: (context) => context?.benchmark?.competitor_median?.description_length,
  },
  photos: {
    metric: "photos_count",
    unit: "photos",
    value: (context) => context?.business?.photos_count ?? context?.business?.photos,
    competitorMedian: (context) => context?.benchmark?.competitor_median?.photos,
  },
  reviews: {
    metric: "reviews",
    unit: "avis",
    value: (context) => context?.business?.reviews,
    competitorMedian: (context) => context?.benchmark?.competitor_median?.reviews,
  },
  rating: {
    metric: "rating",
    unit: "/5",
    value: (context) => context?.business?.rating,
    competitorMedian: (context) => context?.benchmark?.competitor_median?.rating,
  },
  position: {
    metric: "position",
    unit: "position",
    value: (context) => context?.business?.position,
    competitorMedian: (context) => context?.benchmark?.competitor_median?.position,
  },
  categories: {
    metric: "secondary_categories",
    unit: "catégories",
    value: (context) => context?.business?.secondary_categories,
    competitorMedian: (context) => context?.benchmark?.competitor_median?.secondary_categories,
  },
};

function normalizedValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return value;
}

// Point 1 du plan (2026-07-31) : la fiche la plus forte du panel (nom +
// valeur du signal) est déjà calculée en amont (benchmarkEngine.js →
// analysisReader.js → buildBenchmarkContext) et transmise ici sous
// `context.benchmark.top_competitor`. Aucune nouvelle collecte : on ne fait
// que lire, signal par signal, ce qui existe déjà pour ce signal précis
// (ex. top_competitor n'a pas toujours de valeur "photos" en production).
function topCompetitorFor(signal, context = {}) {
  const top = context?.benchmark?.top_competitor;
  if (!top || !top.name) return null;

  const value = normalizedValue(top[signal]);
  if (value === null) return null;

  return { name: top.name, value };
}

// Point 1 du plan : percentile déjà calculé par benchmarkEngine.js
// (rating/reviews/photos uniquement) — simple lecture, aucun recalcul.
function percentileRankFor(signal, context = {}) {
  return normalizedValue(context?.benchmark?.percentiles?.[signal]);
}

export function buildEvidence(signal, context = {}) {
  const definition = SIGNAL_METRICS[signal];
  if (!definition) return null;

  const value = normalizedValue(definition.value(context));
  const competitorMedian = normalizedValue(definition.competitorMedian(context));
  if (value === null && competitorMedian === null) return null;

  let source = "Observation + Benchmark";
  if (value !== null && competitorMedian === null) source = "Observation";
  if (value === null && competitorMedian !== null) source = "Benchmark";

  return {
    metric: definition.metric,
    value,
    competitorMedian,
    unit: definition.unit,
    source,
    topCompetitor: topCompetitorFor(signal, context),
    percentileRank: percentileRankFor(signal, context),
  };
}

export function hasSignalValue(signal, context = {}) {
  const evidence = buildEvidence(signal, context);
  return evidence?.value !== null && evidence?.value !== undefined;
}

export function hasBenchmarkMedian(signal, context = {}) {
  const evidence = buildEvidence(signal, context);
  return evidence?.competitorMedian !== null && evidence?.competitorMedian !== undefined;
}
