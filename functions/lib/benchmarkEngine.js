import { BENCHMARK_WEIGHTS } from "../config/benchmark.config.js";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const numbers = values.map(toNumber).filter((value) => value !== null);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function percentile(clientValue, competitorValues) {
  const value = toNumber(clientValue);
  const numbers = competitorValues.map(toNumber).filter((entry) => entry !== null);
  if (value === null || !numbers.length) return null;

  const lower = numbers.filter((entry) => entry < value).length;
  const equal = numbers.filter((entry) => entry === value).length;
  return ((lower + equal * 0.5) / numbers.length) * 100;
}

function normalizeAgainstBest(clientValue, competitorValues, absoluteMax = null) {
  const value = toNumber(clientValue);
  if (value === null) return null;

  const numbers = competitorValues.map(toNumber).filter((entry) => entry !== null);
  const maxObserved = Math.max(value, ...numbers, absoluteMax ?? 0);
  if (!Number.isFinite(maxObserved) || maxObserved <= 0) return null;

  return Math.max(0, Math.min(100, (value / maxObserved) * 100));
}

function weightedScore(scores, weights = BENCHMARK_WEIGHTS) {
  let weightedTotal = 0;
  let activeWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = toNumber(scores[key]);
    if (value === null || !Number.isFinite(weight) || weight <= 0) continue;
    weightedTotal += value * weight;
    activeWeight += weight;
  }

  if (!activeWeight) return null;
  return weightedTotal / activeWeight;
}

function parseCompetitors(competitorsJson) {
  if (Array.isArray(competitorsJson)) return competitorsJson;
  if (typeof competitorsJson !== "string" || !competitorsJson.trim()) return [];

  try {
    const parsed = JSON.parse(competitorsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findTopCompetitor(competitors) {
  if (!competitors.length) return null;

  return [...competitors].sort((a, b) => {
    const ratingDiff = (toNumber(b.rating) ?? -1) - (toNumber(a.rating) ?? -1);
    if (ratingDiff !== 0) return ratingDiff;
    return (toNumber(b.reviews) ?? -1) - (toNumber(a.reviews) ?? -1);
  })[0];
}

export function benchmarkEngine(analysis, options = {}) {
  const competitors = parseCompetitors(analysis?.competitors_json);
  const weights = options.weights || BENCHMARK_WEIGHTS;

  const clientRating = toNumber(analysis?.rating);
  const clientReviews = toNumber(analysis?.reviews);
  const clientPhotos = toNumber(analysis?.photos_count);

  const competitorRatings = competitors.map((competitor) => competitor.rating);
  const competitorReviews = competitors.map((competitor) => competitor.reviews);
  const competitorPhotos = competitors.map((competitor) => competitor.photos_count);

  const avgRating = average(competitorRatings);
  const avgReviews = average(competitorReviews);
  const avgPhotos = average(competitorPhotos);

  const ratingPercentile = percentile(clientRating, competitorRatings);
  const reviewsPercentile = percentile(clientReviews, competitorReviews);
  const photosPercentile = percentile(clientPhotos, competitorPhotos);

  const metricScores = {
    rating: normalizeAgainstBest(clientRating, competitorRatings, 5),
    reviews: normalizeAgainstBest(clientReviews, competitorReviews),
    photos: normalizeAgainstBest(clientPhotos, competitorPhotos),
  };

  const topCompetitor = findTopCompetitor(competitors);
  const benchmarkScore = weightedScore(metricScores, weights);

  return {
    benchmark_score: round(benchmarkScore, 0),
    competitor_count: competitors.length,
    avg_rating: round(avgRating, 2),
    avg_reviews: round(avgReviews, 0),
    avg_photos: round(avgPhotos, 0),
    rating_gap: avgRating === null || clientRating === null ? null : round(clientRating - avgRating, 2),
    reviews_gap: avgReviews === null || clientReviews === null ? null : round(clientReviews - avgReviews, 0),
    photos_gap: avgPhotos === null || clientPhotos === null ? null : round(clientPhotos - avgPhotos, 0),
    rating_percentile: round(ratingPercentile, 0),
    reviews_percentile: round(reviewsPercentile, 0),
    photos_percentile: round(photosPercentile, 0),
    top_competitor_name: topCompetitor?.name || null,
    top_competitor_rating: topCompetitor ? toNumber(topCompetitor.rating) : null,
    top_competitor_reviews: topCompetitor ? toNumber(topCompetitor.reviews) : null,
  };
}
