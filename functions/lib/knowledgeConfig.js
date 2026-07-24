export const KNOWLEDGE_ENGINE_VERSION = "1.0";
export const KNOWLEDGE_RULES_VERSION = "1.0.0";
export const KNOWLEDGE_MESSAGES_VERSION = "1.0.0";

export const CONFIDENCE_FACTORS = {
  established: 1,
  estimated: 0.8,
  indicative: 0.6,
};

export const CONFIDENCE_RANKS = {
  indicative: 1,
  estimated: 2,
  established: 3,
};

export const KNOWLEDGE_THRESHOLDS = {
  rating: {
    strong: 4.5,
    weakAbsolute: 4,
    weakGap: -0.2,
    forceGapMinimum: -0.05,
  },
  reviews: {
    forcePercentile: 85,
    weakPercentile: 25,
    opportunityMinPercentile: 25,
    opportunityMaxPercentile: 60,
    weakMedianGapRatio: 0.4,
  },
  position: {
    strongMax: 3,
    weakMin: 4,
    absent: 0,
  },
  photos: {
    forcePercentile: 70,
    opportunityGapRatio: 0.3,
    absoluteMinimum: 15,
  },
  description: {
    minimumLength: 250,
  },
  categories: {
    minimumSecondary: 1,
  },
  recency: {
    maxDaysWithoutRecentReview: 120,
  },
  response: {
    weakRate: 0.5,
    strongRate: 0.8,
  },
  score: {
    strong: 90,
    positiveFloor: 60,
  },
};

export const BUSINESS_IMPACT_BY_SIGNAL = {
  reviews: "trust",
  rating: "trust",
  position: "visibility",
  categories: "visibility",
  posts: "visibility",
  photos: "conversion",
  description: "conversion",
  global: "completeness",
};
