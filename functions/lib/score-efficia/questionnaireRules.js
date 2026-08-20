import { GRILLE } from "./criteriaCatalog.js";

export const QUESTIONNAIRE_VERSION = "score-efficia-questionnaire-v4";
export const LEGACY_QUESTIONNAIRE_VERSION = "score-efficia-questionnaire-v2";
export const LOCATION_MODES = Object.freeze(["storefront", "service_area", "hybrid"]);
export const ADDRESS_VERIFICATIONS = Object.freeze(["exact", "inaccurate", "not_verifiable"]);
export const SERVICE_AREA_VERIFICATIONS = Object.freeze(["coherent", "partial", "incoherent", "not_verifiable"]);
export const PHOTO_DEPENDENT_KEYS = Object.freeze([
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
const LOCATION_MODE_VALUES = new Set(LOCATION_MODES);
const ADDRESS_VALUES = new Set(ADDRESS_VERIFICATIONS);
const SERVICE_AREA_VALUES = new Set(SERVICE_AREA_VERIFICATIONS);

function cleanPresence(value) {
  return PRESENCE_VALUES.has(value) ? value : "unknown";
}

export function normalizeQuestionnaireConditions(payload = {}, criteriaReview = []) {
  const criteria = new Map((Array.isArray(criteriaReview) ? criteriaReview : [])
    .filter((item) => item?.key)
    .map((item) => [item.key, item]));
  let photoPresence = cleanPresence(payload.photoPresence);
  let reviewsPresence = cleanPresence(payload.reviewsPresence);

  if (photoPresence === "unknown" && criteria.has("nombrePhotos")) {
    photoPresence = "present";
  }
  if (reviewsPresence === "unknown" && criteria.has("noteMoyenne")) {
    reviewsPresence = "present";
  }

  const locationMode = LOCATION_MODE_VALUES.has(payload.locationMode) ? payload.locationMode : "unknown";
  return {
    photoPresence,
    reviewsPresence,
    locationMode,
    addressVerification: ["storefront", "hybrid"].includes(locationMode) && ADDRESS_VALUES.has(payload.addressVerification)
      ? payload.addressVerification
      : "unknown",
    serviceAreaVerification: ["service_area", "hybrid"].includes(locationMode) && SERVICE_AREA_VALUES.has(payload.serviceAreaVerification)
      ? payload.serviceAreaVerification
      : "unknown",
  };
}

export function locationScore(conditions = {}) {
  const { locationMode, addressVerification, serviceAreaVerification } = conditions;
  if (locationMode === "storefront") {
    if (addressVerification === "exact") return 2;
    if (addressVerification === "inaccurate") return 0;
    return null;
  }
  if (locationMode === "service_area") {
    if (serviceAreaVerification === "coherent") return 2;
    if (serviceAreaVerification === "partial") return 1;
    if (serviceAreaVerification === "incoherent") return 0;
    return null;
  }
  if (locationMode === "hybrid") {
    if (!["exact", "inaccurate"].includes(addressVerification)
      || !["coherent", "partial", "incoherent"].includes(serviceAreaVerification)) return null;
    if (addressVerification === "exact" && serviceAreaVerification === "coherent") return 2;
    if (addressVerification === "inaccurate" && serviceAreaVerification === "incoherent") return 0;
    return 1;
  }
  return null;
}

export function normalizeLocationCriterion(criteriaReview = [], conditions = {}) {
  if (!LOCATION_MODE_VALUES.has(conditions.locationMode)) return criteriaReview;
  const withoutLegacyLocation = criteriaReview.filter((item) => item?.key !== "adresse");
  const points = locationScore(conditions);
  const value = points === 2 ? "compliant" : (points === 1 ? "partial" : (points === 0 ? "deficient" : "not_verified"));
  const labels = {
    storefront: points === 2 ? "Adresse et épingle exactes" : (points === 0 ? "Adresse ou épingle imprécise" : "Adresse à confirmer"),
    service_area: points === 2 ? "Zone renseignée et cohérente" : (points === 1 ? "Zone partielle ou imprécise" : (points === 0 ? "Zone absente ou incohérente" : "Zone à confirmer")),
    hybrid: points === 2 ? "Adresse et zone correctes" : (points === 1 ? "Un élément reste à corriger" : (points === 0 ? "Adresse et zone incorrectes" : "Adresse et zone à confirmer")),
  };
  return [...withoutLegacyLocation, {
    key: "adresse",
    category: "Informations essentielles",
    question: conditions.locationMode === "storefront"
      ? "L’adresse et l’épingle Google Maps sont-elles exactes ?"
      : (conditions.locationMode === "service_area"
        ? "La zone desservie est-elle renseignée et cohérente ?"
        : "L’adresse, l’épingle et la zone desservie sont-elles cohérentes ?"),
    value,
    label: labels[conditions.locationMode],
    checklist: [],
    points,
    source: "manual_location_mode",
  }];
}

export function sanitizeConditionalCriteria(criteriaReview = [], conditions = {}) {
  const hidden = new Set();
  if (conditions.photoPresence === "none") {
    hidden.add("nombrePhotos");
    PHOTO_DEPENDENT_KEYS.forEach((key) => hidden.add(key));
  }
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
  if (conditions.photoPresence === "none" && (key === "nombrePhotos" || PHOTO_DEPENDENT_KEYS.includes(key))) return "no_photos";
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
  const requiresLocationMode = manualReview.questionnaireVersion === QUESTIONNAIRE_VERSION
    || LOCATION_MODE_VALUES.has(conditions.locationMode);
  if (requiresLocationMode) {
    if (conditions.locationMode === "unknown") missing.unshift("locationMode");
    if (["storefront", "hybrid"].includes(conditions.locationMode)
      && ["unknown", "not_verifiable"].includes(conditions.addressVerification)) missing.unshift("addressVerification");
    if (["service_area", "hybrid"].includes(conditions.locationMode)
      && ["unknown", "not_verifiable"].includes(conditions.serviceAreaVerification)) missing.unshift("serviceAreaVerification");
  }
  return [...new Set(missing)];
}
