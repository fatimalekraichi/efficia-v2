import { GRILLE } from "./criteriaCatalog.js";

export const QUESTIONNAIRE_VERSION = "score-efficia-questionnaire-v2";
export const PHOTO_DEPENDENT_KEYS = Object.freeze([
  "nombrePhotos",
  "photoRecente",
  "varietePhotos",
  "qualitePhotos",
]);
export const REVIEW_DEPENDENT_KEYS = Object.freeze([
  "volumeAvis",
  "recenceAvis",
  "tauxReponseAvis",
  "qualiteReponsesAvis",
]);
export const CRITERIA_DEPENDENCIES = Object.freeze([
  { parent: "tauxReponseAvis", child: "qualiteReponsesAvis", hideWhen: ["deficient"] },
  { parent: "descriptionRemplie", child: "descriptionQualite", hideWhen: ["deficient"] },
  { parent: "servicesPresents", child: "servicesDecrits", hideWhen: ["deficient"] },
  { parent: "publicationRecente", child: "rythmePublication", hideWhen: ["deficient"] },
]);

const PRESENCE_VALUES = new Set(["present", "none", "unknown"]);

function cleanPresence(value) {
  return PRESENCE_VALUES.has(value) ? value : "unknown";
}

export function normalizeQuestionnaireConditions(payload = {}, criteriaReview = []) {
  const criteria = new Map((Array.isArray(criteriaReview) ? criteriaReview : [])
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));
  let photoPresence = cleanPresence(payload.photoPresence);
  let reviewsPresence = cleanPresence(payload.reviewsPresence);

  if (photoPresence === "unknown" && PHOTO_DEPENDENT_KEYS.some((key) => criteria.has(key))) {
    photoPresence = "present";
  }
  if (reviewsPresence === "unknown" && criteria.has("noteMoyenne")) {
    reviewsPresence = "present";
  }

  return { photoPresence, reviewsPresence };
}

export function sanitizeConditionalCriteria(criteriaReview = [], conditions = {}) {
  const hidden = new Set();
  if (conditions.photoPresence === "none") PHOTO_DEPENDENT_KEYS.forEach((key) => hidden.add(key));
  if (conditions.reviewsPresence === "none") {
    hidden.add("noteMoyenne");
    REVIEW_DEPENDENT_KEYS.forEach((key) => hidden.add(key));
  }
  const criteria = new Map((Array.isArray(criteriaReview) ? criteriaReview : []).map((item) => [item?.key, item]));
  CRITERIA_DEPENDENCIES.forEach(({ parent, child, hideWhen }) => {
    if (hideWhen.includes(criteria.get(parent)?.value)) hidden.add(child);
  });
  return (Array.isArray(criteriaReview) ? criteriaReview : []).filter((item) => !hidden.has(item?.key));
}

export function conditionForCriterion(key, conditions = {}, criteriaReview = []) {
  if (conditions.photoPresence === "none" && PHOTO_DEPENDENT_KEYS.includes(key)) return "no_photos";
  if (conditions.reviewsPresence === "none" && (key === "noteMoyenne" || REVIEW_DEPENDENT_KEYS.includes(key))) {
    return "no_reviews";
  }
  const criteria = new Map((Array.isArray(criteriaReview) ? criteriaReview : []).map((item) => [item?.key, item]));
  const dependency = CRITERIA_DEPENDENCIES.find(({ parent, child, hideWhen }) => (
    child === key && hideWhen.includes(criteria.get(parent)?.value)
  ));
  if (dependency) return `parent_${dependency.parent}_absent`;
  return null;
}

export function requiredVisibleCriterionKeys(conditions = {}, criteriaReview = []) {
  return GRILLE.flatMap((category) => category.criteres.map((criterion) => criterion.key))
    .filter((key) => conditionForCriterion(key, conditions, criteriaReview) === null);
}

export function incompleteQuestionnaireFields(manualReview = {}) {
  const conditions = normalizeQuestionnaireConditions(manualReview, manualReview.criteriaReview);
  const criteria = new Map((manualReview.criteriaReview || []).map((item) => [item.key, item]));
  const missing = requiredVisibleCriterionKeys(conditions, manualReview.criteriaReview)
    .filter((key) => !criteria.has(key) || criteria.get(key)?.value === "not_verified");

  if (conditions.photoPresence === "unknown") missing.unshift("photoPresence");
  if (conditions.reviewsPresence === "unknown" && !criteria.has("noteMoyenne")) missing.unshift("reviewsPresence");
  return [...new Set(missing)];
}
