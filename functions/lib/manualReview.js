const DESCRIPTION_STATUS = new Set(["absent", "too_short", "acceptable", "strong"]);
const QUALITY_STATUS = new Set(["poor", "average", "good", "excellent", "unknown"]);
const BASIC_STATUS = new Set(["poor", "average", "good", "unknown"]);
const REVIEW_RESPONSE_STATUS = new Set(["none", "irregular", "systematic", "unknown"]);
const COMPLETENESS_STATUS = new Set(["incomplete", "average", "complete", "unknown"]);
const CATEGORY_STATUS = new Set(["poor", "acceptable", "strong", "unknown"]);
const HOURS_STATUS = new Set(["incorrect", "uncertain", "correct", "unknown"]);
const CONSISTENCY_STATUS = new Set(["poor", "average", "strong", "unknown"]);
const REPORT_TYPES = new Set(["free", "premium"]);
const CRITERIA_REVIEW_VALUES = new Set(["compliant", "partial", "deficient", "not_verified"]);

import {
  QUESTIONNAIRE_VERSION,
  normalizeQuestionnaireConditions,
  sanitizeConditionalCriteria,
} from "./score-efficia/questionnaireRules.js";

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pickAllowed(value, allowed, fallback = "unknown") {
  const clean = cleanText(value, 80);
  return allowed.has(clean) ? clean : fallback;
}

function cleanIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 160)).filter(Boolean))];
}

function cleanChecklist(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 140)).filter(Boolean))].slice(0, 12);
}

function cleanOptionIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function cleanFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return null;
  }
}

function normalizeCriteriaReview(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 80)
    .map((item) => {
      const key = cleanText(item?.key, 80);
      const question = cleanText(item?.question, 280);
      if (!key || !question) return null;

      const status = pickAllowed(item?.value, CRITERIA_REVIEW_VALUES, "not_verified");

      const normalized = {
        key,
        category: cleanText(item?.category, 140),
        question,
        value: status,
        label: cleanText(item?.label, 140) || status,
        checklist: cleanChecklist(item?.checklist),
      };

      const selectedOptionIndex = cleanOptionIndex(item?.selectedOptionIndex);
      if (selectedOptionIndex !== null) normalized.selectedOptionIndex = selectedOptionIndex;

      const points = cleanFiniteNumber(item?.points);
      if (points !== null) normalized.points = points;

      const source = cleanText(item?.source, 80);
      if (source) normalized.source = source;

      const evidence = cleanJsonObject(item?.evidence);
      if (evidence) normalized.evidence = evidence;

      return normalized;
    })
    .filter(Boolean);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function roundAverage(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!valid.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

function competitorCountForReview(competitors) {
  return Array.isArray(competitors) ? competitors.length : 0;
}

export function computeBenchmarkConfidence(competitors) {
  const count = competitorCountForReview(competitors);
  if (count >= 3) return "established";
  if (count > 0) return "limited";
  return "unavailable";
}

export function normalizeManualReview(payload = {}) {
  const normalizedCriteria = normalizeCriteriaReview(payload.criteriaReview);
  const conditions = normalizeQuestionnaireConditions(payload, normalizedCriteria);
  return {
    reportType: pickAllowed(payload.reportType, REPORT_TYPES, "premium"),
    questionnaireVersion: cleanText(payload.questionnaireVersion, 80) || QUESTIONNAIRE_VERSION,
    photoPresence: conditions.photoPresence,
    reviewsPresence: conditions.reviewsPresence,
    descriptionStatus: pickAllowed(payload.descriptionStatus, DESCRIPTION_STATUS, "unknown"),
    photoQuality: pickAllowed(payload.photoQuality, QUALITY_STATUS, "unknown"),
    photoRelevance: pickAllowed(payload.photoRelevance, BASIC_STATUS, "unknown"),
    reviewResponseStatus: pickAllowed(payload.reviewResponseStatus, REVIEW_RESPONSE_STATUS, "unknown"),
    profileCompleteness: pickAllowed(payload.profileCompleteness, COMPLETENESS_STATUS, "unknown"),
    categoryRelevance: pickAllowed(payload.categoryRelevance, CATEGORY_STATUS, "unknown"),
    hoursAccuracy: pickAllowed(payload.hoursAccuracy, HOURS_STATUS, "unknown"),
    visualConsistency: pickAllowed(payload.visualConsistency, CONSISTENCY_STATUS, "unknown"),
    manualNotes: cleanText(payload.manualNotes, 4000),
    excludedCompetitorIds: cleanIdList(payload.excludedCompetitorIds),
    confirmedCompetitorIds: cleanIdList(payload.confirmedCompetitorIds),
    confirmedCity: cleanText(payload.confirmedCity, 120),
    confirmedCategory: cleanText(payload.confirmedCategory, 160),
    confirmedPosition: cleanOptionalNumber(payload.confirmedPosition),
    confirmedQuery: cleanText(payload.confirmedQuery, 240),
    criteriaReview: sanitizeConditionalCriteria(normalizedCriteria, conditions),
    executionPlan: normalizeExecutionPlanReview(payload.executionPlan),
  };
}

export function buildReviewedObservation(row = {}, manualReview = {}) {
  const normalized = parseJson(row.normalized_json, {});
  const descriptionLength = cleanOptionalNumber(row.description_length);
  const confirmedDescriptionStatus = manualReview.descriptionStatus === "unknown"
    ? (descriptionLength === 0 ? "absent" : "unknown")
    : manualReview.descriptionStatus;

  return {
    analysisId: row.analysis_id,
    name: row.name || normalized.name || row.nom || null,
    city: manualReview.confirmedCity || row.ville || null,
    category: manualReview.confirmedCategory || row.activity || null,
    secondaryCategories: normalized.subtypes || normalized.secondary_categories || null,
    rating: manualReview.reviewsPresence === "none" ? null : cleanOptionalNumber(row.rating),
    reviews: manualReview.reviewsPresence === "none" ? 0 : cleanOptionalNumber(row.reviews),
    photosCount: manualReview.photoPresence === "none" ? 0 : cleanOptionalNumber(row.photos_count),
    descriptionLength,
    descriptionStatus: confirmedDescriptionStatus,
    hasDescription: confirmedDescriptionStatus === "absent" ? false : descriptionLength === null ? null : descriptionLength > 0,
    workingHours: normalized.working_hours || null,
    website: normalized.site || normalized.website || null,
    phone: normalized.phone || normalized.phone_number || null,
    localPosition: manualReview.confirmedPosition ?? cleanOptionalNumber(row.local_position),
    searchQuery: manualReview.confirmedQuery || row.search_query || null,
    photoQuality: manualReview.photoQuality,
    photoRelevance: manualReview.photoRelevance,
    reviewResponseStatus: manualReview.reviewResponseStatus,
    profileCompleteness: manualReview.profileCompleteness,
    categoryRelevance: manualReview.categoryRelevance,
    hoursAccuracy: manualReview.hoursAccuracy,
    visualConsistency: manualReview.visualConsistency,
    manualNotes: manualReview.manualNotes || null,
  };
}

export function buildReviewedBenchmark(row = {}, manualReview = {}) {
  const originalCompetitors = parseJson(row.competitors_json, []);
  const excluded = new Set(manualReview.excludedCompetitorIds || []);
  const confirmed = new Set(manualReview.confirmedCompetitorIds || []);
  const competitors = (Array.isArray(originalCompetitors) ? originalCompetitors : [])
    .filter((competitor) => {
      const id = competitor.place_id || competitor.name || "";
      if (excluded.has(id)) return false;
      if (confirmed.size) return confirmed.has(id);
      return true;
    });

  const avgRating = roundAverage(competitors.map((item) => item.rating));
  const avgReviews = roundAverage(competitors.map((item) => item.reviews));
  const avgPhotos = roundAverage(competitors.map((item) => item.photos_count));
  const rating = cleanOptionalNumber(row.rating);
  const reviews = cleanOptionalNumber(row.reviews);
  const photos = cleanOptionalNumber(row.photos_count);
  const competitorCount = competitorCountForReview(competitors);

  return {
    searchQuery: manualReview.confirmedQuery || row.search_query || null,
    location: manualReview.confirmedCity || row.ville || null,
    position: manualReview.confirmedPosition ?? cleanOptionalNumber(row.local_position),
    competitorCount,
    benchmarkConfidence: computeBenchmarkConfidence(competitors),
    competitors,
    averages: {
      rating: avgRating,
      reviews: avgReviews,
      photos: avgPhotos,
    },
    gaps: {
      rating: rating !== null && avgRating !== null ? Number((rating - avgRating).toFixed(2)) : null,
      reviews: reviews !== null && avgReviews !== null ? Number((reviews - avgReviews).toFixed(2)) : null,
      photos: photos !== null && avgPhotos !== null ? Number((photos - avgPhotos).toFixed(2)) : null,
    },
  };
}

export function buildReviewedData(row = {}, payload = {}) {
  const manualReview = normalizeManualReview(payload);
  return {
    manualReview,
    reviewedObservation: buildReviewedObservation(row, manualReview),
    reviewedBenchmark: buildReviewedBenchmark(row, manualReview),
  };
}
import { normalizeExecutionPlanReview } from "./executionPlanBuilder.js";
