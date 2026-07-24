import { KNOWLEDGE_RULES_VERSION, KNOWLEDGE_THRESHOLDS } from "./knowledgeConfig.js";

export { KNOWLEDGE_RULES_VERSION };

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasBenchmark(input) {
  return Boolean(input?.benchmark);
}

function confidence(input) {
  return input?.benchmark?.confidence || "indicative";
}

function reviewsMagnitude(input) {
  const percentile = n(input?.benchmark?.percentiles?.reviews);
  if (percentile === null) return 1;
  return clamp(Math.abs(percentile - 50) / 50 + 0.5, 0.5, 1.5);
}

function ratingMagnitude(input) {
  const gap = n(input?.benchmark?.gaps?.rating);
  if (gap !== null) return clamp(Math.abs(gap) / 0.4 + 0.5, 0.5, 1.5);
  const rating = n(input?.business?.rating);
  if (rating === null) return 1;
  return clamp(Math.abs(4 - rating) / 1 + 0.5, 0.5, 1.5);
}

function photosMagnitude(input) {
  const gap = n(input?.benchmark?.gaps?.photos);
  const median = n(input?.benchmark?.competitor_median?.photos);
  if (gap !== null && median !== null && median > 0) {
    return clamp(Math.abs(gap) / median + 0.5, 0.5, 1.5);
  }
  const photos = n(input?.business?.photos_count);
  if (photos === null) return 1;
  return clamp((KNOWLEDGE_THRESHOLDS.photos.absoluteMinimum - photos) / KNOWLEDGE_THRESHOLDS.photos.absoluteMinimum + 0.5, 0.5, 1.5);
}

function positionMagnitude(input) {
  const position = n(input?.business?.position);
  if (position === null) return 1;
  if (position === 0) return 1.5;
  return clamp((position - 3) / 5 + 0.8, 0.5, 1.5);
}

function simpleMagnitude(value = 1) {
  return clamp(value, 0.5, 1.5);
}

export const KNOWLEDGE_RULES = [
  {
    id: "FORCE_REVIEWS",
    type: "strength",
    signal: "reviews",
    base_weight: 9,
    min_confidence: "estimated",
    message_group: "FORCE_REVIEWS",
    when: (input) => hasBenchmark(input) && n(input.benchmark?.percentiles?.reviews) > KNOWLEDGE_THRESHOLDS.reviews.forcePercentile,
    magnitude: reviewsMagnitude,
  },
  {
    id: "FORCE_RATING",
    type: "strength",
    signal: "rating",
    base_weight: 9,
    min_confidence: "estimated",
    message_group: "FORCE_RATING",
    when: (input) => hasBenchmark(input)
      && n(input.business?.rating) >= KNOWLEDGE_THRESHOLDS.rating.strong
      && n(input.benchmark?.gaps?.rating) >= KNOWLEDGE_THRESHOLDS.rating.forceGapMinimum,
    magnitude: ratingMagnitude,
  },
  {
    id: "FORCE_POSITION",
    type: "strength",
    signal: "position",
    base_weight: 8,
    min_confidence: "indicative",
    message_group: "FORCE_POSITION",
    when: (input) => {
      const position = n(input.business?.position);
      return position !== null && position >= 1 && position <= KNOWLEDGE_THRESHOLDS.position.strongMax;
    },
    magnitude: () => 1,
  },
  {
    id: "FORCE_PHOTOS",
    type: "strength",
    signal: "photos",
    base_weight: 5,
    min_confidence: "estimated",
    message_group: "FORCE_PHOTOS",
    when: (input) => hasBenchmark(input)
      && n(input.benchmark?.gaps?.photos) > 0
      && n(input.benchmark?.percentiles?.photos) > KNOWLEDGE_THRESHOLDS.photos.forcePercentile,
    magnitude: photosMagnitude,
  },
  {
    id: "FORCE_SCORE",
    type: "strength",
    signal: "global",
    base_weight: 7,
    min_confidence: "estimated",
    message_group: "FORCE_SCORE",
    when: (input) => hasBenchmark(input) && n(input.benchmark?.benchmark_score) >= KNOWLEDGE_THRESHOLDS.score.strong,
    magnitude: () => 1,
  },
  {
    id: "FORCE_RESPONSE",
    type: "strength",
    signal: "reviews",
    base_weight: 4,
    min_confidence: "indicative",
    message_group: "FORCE_RESPONSE",
    when: (input) => n(input.business?.owner_response_rate) >= KNOWLEDGE_THRESHOLDS.response.strongRate,
    magnitude: () => 1,
  },
  {
    id: "WEAK_RATING",
    type: "weakness",
    signal: "rating",
    base_weight: 10,
    min_confidence: "indicative",
    message_group: "WEAK_RATING",
    when: (input) => {
      const rating = n(input.business?.rating);
      const gap = n(input.benchmark?.gaps?.rating);
      return rating !== null && (rating < KNOWLEDGE_THRESHOLDS.rating.weakAbsolute || (hasBenchmark(input) && gap !== null && gap <= KNOWLEDGE_THRESHOLDS.rating.weakGap));
    },
    magnitude: ratingMagnitude,
  },
  {
    id: "WEAK_REVIEWS",
    type: "weakness",
    signal: "reviews",
    base_weight: 9,
    min_confidence: "estimated",
    message_group: "WEAK_REVIEWS",
    when: (input) => {
      if (!hasBenchmark(input)) return false;
      const percentile = n(input.benchmark?.percentiles?.reviews);
      const gap = n(input.benchmark?.gaps?.reviews);
      const median = n(input.benchmark?.competitor_median?.reviews);
      return (percentile !== null && percentile < KNOWLEDGE_THRESHOLDS.reviews.weakPercentile)
        || (gap !== null && median !== null && gap <= -median * KNOWLEDGE_THRESHOLDS.reviews.weakMedianGapRatio);
    },
    magnitude: reviewsMagnitude,
  },
  {
    id: "WEAK_POSITION",
    type: "weakness",
    signal: "position",
    base_weight: 9,
    min_confidence: "indicative",
    message_group: "WEAK_POSITION",
    when: (input) => {
      const position = n(input.business?.position);
      return position !== null && (position === KNOWLEDGE_THRESHOLDS.position.absent || position >= KNOWLEDGE_THRESHOLDS.position.weakMin);
    },
    magnitude: positionMagnitude,
  },
  {
    id: "WEAK_RECENCY",
    type: "weakness",
    signal: "reviews",
    base_weight: 6,
    min_confidence: "indicative",
    message_group: "WEAK_RECENCY",
    when: (input) => n(input.business?.last_review_age_days) > KNOWLEDGE_THRESHOLDS.recency.maxDaysWithoutRecentReview,
    magnitude: (input) => simpleMagnitude(n(input.business?.last_review_age_days) / 180),
  },
  {
    id: "OPP_PHOTOS",
    type: "opportunity",
    signal: "photos",
    base_weight: 7,
    min_confidence: "indicative",
    message_group: "OPP_PHOTOS",
    when: (input) => {
      const photos = n(input.business?.photos_count);
      if (hasBenchmark(input)) {
        const gap = n(input.benchmark?.gaps?.photos);
        const median = n(input.benchmark?.competitor_median?.photos);
        return gap !== null && median !== null && median > 0 && gap < -median * KNOWLEDGE_THRESHOLDS.photos.opportunityGapRatio;
      }
      return photos !== null && photos < KNOWLEDGE_THRESHOLDS.photos.absoluteMinimum;
    },
    magnitude: photosMagnitude,
  },
  {
    id: "OPP_DESCRIPTION",
    type: "opportunity",
    signal: "description",
    base_weight: 6,
    min_confidence: "indicative",
    message_group: "OPP_DESCRIPTION",
    when: (input) => {
      const hasDescription = input.business?.has_description;
      const length = n(input.business?.description_length);
      return hasDescription === false || (length !== null && length < KNOWLEDGE_THRESHOLDS.description.minimumLength);
    },
    magnitude: (input) => {
      const length = n(input.business?.description_length);
      if (length === null) return 1;
      return simpleMagnitude((KNOWLEDGE_THRESHOLDS.description.minimumLength - length) / KNOWLEDGE_THRESHOLDS.description.minimumLength + 0.5);
    },
  },
  {
    id: "OPP_CATEGORIES",
    type: "opportunity",
    signal: "categories",
    base_weight: 5,
    min_confidence: "indicative",
    message_group: "OPP_CATEGORIES",
    when: (input) => n(input.business?.secondary_categories) === 0,
    magnitude: () => 1,
  },
  {
    id: "OPP_REVIEWS_FLOW",
    type: "opportunity",
    signal: "reviews",
    base_weight: 5,
    min_confidence: "estimated",
    message_group: "OPP_REVIEWS_FLOW",
    when: (input) => {
      if (!hasBenchmark(input)) return false;
      const percentile = n(input.benchmark?.percentiles?.reviews);
      return percentile !== null
        && percentile >= KNOWLEDGE_THRESHOLDS.reviews.opportunityMinPercentile
        && percentile <= KNOWLEDGE_THRESHOLDS.reviews.opportunityMaxPercentile;
    },
    magnitude: reviewsMagnitude,
  },
  {
    id: "OPP_RESPONSE",
    type: "opportunity",
    signal: "reviews",
    base_weight: 4,
    min_confidence: "indicative",
    message_group: "OPP_RESPONSE",
    when: (input) => n(input.business?.owner_response_rate) < KNOWLEDGE_THRESHOLDS.response.weakRate,
    magnitude: (input) => simpleMagnitude(1 - n(input.business?.owner_response_rate)),
  },
];

export function messageGroupForRule(rule, input) {
  if (rule.id === "OPP_PHOTOS" && !hasBenchmark(input)) return "OPP_PHOTOS_ABSOLUTE";
  if (rule.id === "WEAK_RATING" && !hasBenchmark(input)) return "WEAK_RATING_ABSOLUTE";
  return rule.message_group;
}

export function getInputConfidence(input) {
  return confidence(input);
}
