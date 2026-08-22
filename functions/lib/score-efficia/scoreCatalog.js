import { GRILLE } from "./criteriaCatalog.js";
import { CONFIG, SCORING_VERSION } from "./scoreConfig.js";
import {
  CRITERIA_DEPENDENCIES,
  PHOTO_DEPENDENT_KEYS,
  QUESTIONNAIRE_VERSION,
  REVIEW_DEPENDENT_KEYS,
} from "./questionnaireRules.js";

function optionValueForIndex(index, total, explicitValue = null) {
  if (explicitValue === "no_reviews") return "no_reviews";
  if (explicitValue === "no_photos") return "no_photos";
  if (explicitValue === "no_website") return "no_website";
  if (index === 0) return "compliant";
  if (index === total - 1) return "deficient";
  return "partial";
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && String(item).trim());
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function getNormalizedValue(normalized, keys) {
  for (const key of keys) {
    if (hasMeaningfulValue(normalized?.[key])) return normalized[key];
  }
  return null;
}

function hasNormalizedKey(normalized, keys) {
  if (!normalized || typeof normalized !== "object") return false;
  return keys.some((key) => Object.prototype.hasOwnProperty.call(normalized, key));
}

function wasObserved(normalized, keys) {
  if (Array.isArray(normalized?.observed_fields)) {
    return keys.some((key) => normalized.observed_fields.includes(key));
  }
  return hasNormalizedKey(normalized, keys);
}

function getSecondaryCategories(normalized) {
  return [...new Set([
    ...asArray(normalized?.secondary_categories),
    ...asArray(normalized?.subtypes),
    ...asArray(normalized?.categories),
  ])];
}

function getServices(normalized) {
  const value = getNormalizedValue(normalized, ["services", "service_options", "service_list"]);
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return asArray(value);
  return null;
}

function findCriterion(key) {
  for (const category of GRILLE) {
    const criterion = category.criteres.find((item) => item.key === key);
    if (criterion) return { category, criterion };
  }
  return null;
}

function criteriaOptions(criterion) {
  const scoredOptionCount = criterion.opts.filter(([, , explicitValue]) => !["no_reviews", "no_photos", "no_website"].includes(explicitValue)).length;
  return [
    ...criterion.opts.map(([label, points, explicitValue], index) => ({
      index,
      value: optionValueForIndex(index, scoredOptionCount, explicitValue),
      label,
      points,
    })),
    {
      index: criterion.opts.length,
      value: "not_verified",
      label: "Non vérifié",
      points: null,
    },
  ];
}

function optionForKey(key, optionIndex, source, evidence = null) {
  const found = findCriterion(key);
  if (!found) return null;

  const options = criteriaOptions(found.criterion);
  const option = options.find((item) => item.index === optionIndex) || options.at(-1);
  return {
    key,
    category: found.category.cat,
    categoryKey: found.category.key,
    question: found.criterion.q,
    value: option.value,
    label: option.label,
    checklist: [],
    selectedOptionIndex: option.index,
    points: option.points,
    source,
    evidence,
  };
}

function notVerified(key, source = "manual_required", evidence = null) {
  const found = findCriterion(key);
  if (!found) return null;
  return optionForKey(key, found.criterion.opts.length, source, evidence);
}

function addCriterion(items, item) {
  if (item) items.push(item);
}

export function buildScoreCatalog() {
  return {
    scoringVersion: SCORING_VERSION,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    categories: GRILLE.map((category) => ({
      key: category.key,
      label: category.cat,
      points: category.pts,
      precondition: null,
      criteria: category.criteres.map((criterion) => ({
        key: criterion.key,
        question: criterion.q,
        help: criterion.aide,
        max: criterion.max,
        checklist: criterion.checklist ? CONFIG.checklist.criteres[criterion.checklist] || [] : [],
        options: criteriaOptions(criterion),
      })),
    })),
  };
}

export function buildScorePrefill(analysis = {}) {
  const business = analysis.business || {};
  const normalized = business.normalized || {};
  const benchmark = analysis.benchmark || {};
  const competitors = Array.isArray(business.competitors) ? business.competitors : [];
  const criteria = [];

  const primaryCategory = getNormalizedValue(normalized, ["category", "type", "main_category"]) || business.activity;
  const secondaryCategories = getSecondaryCategories(normalized);
  const workingHours = getNormalizedValue(normalized, ["working_hours", "hours"]);
  const website = getNormalizedValue(normalized, ["website", "site"]);
  const phone = getNormalizedValue(normalized, ["phone", "phone_number"]);
  const contactWasObserved = wasObserved(normalized, ["website", "site", "phone", "phone_number"]);
  const services = getServices(normalized);
  const photos = asNumber(business.photosCount);
  const rating = asNumber(business.rating);
  const reviewsCount = asNumber(business.reviews);
  const avgReviews = asNumber(benchmark.averages?.reviews);
  const localPosition = asNumber(business.localPosition);
  const descriptionLength = asNumber(business.descriptionLength);
  const gaps = benchmark.gaps || {};
  const conditions = {
    photoPresence: photos === null ? "unknown" : (photos > 0 ? "present" : "none"),
    reviewsPresence: reviewsCount === null && rating === null
      ? "unknown"
      : (reviewsCount === 0 ? "none" : "present"),
    locationMode: "unknown",
    addressVerification: "unknown",
    serviceAreaVerification: "unknown",
  };

  addCriterion(criteria, primaryCategory
    ? optionForKey("categoriePrincipale", 0, "observed", { value: primaryCategory })
    : notVerified("categoriePrincipale"));

  if (secondaryCategories.length) {
    addCriterion(criteria, optionForKey("categoriesSecondaires", 0, "observed", { value: secondaryCategories }));
  } else if (wasObserved(normalized, ["secondary_categories", "subtypes", "categories"])) {
    addCriterion(criteria, optionForKey("categoriesSecondaires", 1, "observed", { value: [] }));
  } else {
    addCriterion(criteria, notVerified("categoriesSecondaires"));
  }

  addCriterion(criteria, workingHours
    ? optionForKey("horaires", 0, "observed", { value: workingHours })
    : notVerified("horaires"));

  if (contactWasObserved) {
    addCriterion(criteria, optionForKey("contact", phone && website ? 0 : (phone || website ? 1 : 2), "observed", { phone: Boolean(phone), website: Boolean(website) }));
    addCriterion(criteria, optionForKey("liensAction", phone || website ? 0 : 2, "observed", { phone: Boolean(phone), website: Boolean(website) }));
  } else {
    addCriterion(criteria, notVerified("contact"));
    addCriterion(criteria, notVerified("liensAction"));
  }

  // Une adresse publique ne permet pas de conclure si l'activité reçoit sur
  // place, intervient chez le client ou combine les deux. Le contrôle de
  // localisation reste donc manuel et n'expose jamais la donnée brute.
  addCriterion(criteria, notVerified("adresse"));

  if (photos === null) {
    addCriterion(criteria, notVerified("nombrePhotos"));
  } else if (photos === 0) {
    addCriterion(criteria, optionForKey("nombrePhotos", 3, "observed", { value: 0 }));
  } else {
    addCriterion(criteria, optionForKey("nombrePhotos", photos >= CONFIG.seuils.photosNombreMax ? 0 : (photos >= CONFIG.seuils.photosNombreMoyen ? 1 : 2), "observed", { value: photos }));
  }

  if (rating === null) {
    addCriterion(criteria, notVerified("noteMoyenne"));
  } else {
    addCriterion(criteria, optionForKey("noteMoyenne", rating >= 4.5 ? 0 : (rating >= 4 ? 1 : (rating >= 3.5 ? 2 : 3)), "observed", { value: rating }));
  }

  if (reviewsCount === null) {
    addCriterion(criteria, notVerified("volumeAvis"));
  } else if (avgReviews !== null && avgReviews > 0) {
    addCriterion(criteria, optionForKey("volumeAvis", reviewsCount >= avgReviews * (1 - CONFIG.seuils.toleranceConcurrents) ? 0 : (reviewsCount >= avgReviews * 0.5 ? 1 : 2), "observed", { value: reviewsCount, average: avgReviews }));
  } else {
    addCriterion(criteria, optionForKey("volumeAvis", reviewsCount >= 30 ? 0 : (reviewsCount >= 10 ? 1 : 2), "observed", { value: reviewsCount }));
  }

  if (descriptionLength === null || !wasObserved(normalized, ["description", "description_length"])) {
    addCriterion(criteria, notVerified("descriptionRemplie"));
  } else {
    // Seuils historiques : ≥600 = complète, >0 = courte, 0 = vide (Absente).
    addCriterion(criteria, optionForKey("descriptionRemplie", descriptionLength >= 600 ? 0 : (descriptionLength > 0 ? 1 : 2), "observed", { value: descriptionLength }));
  }
  // Historique : la QUALITÉ de la description est une check-list visuelle → reste manuelle.
  addCriterion(criteria, notVerified("descriptionQualite"));

  if (Array.isArray(services)) {
    addCriterion(criteria, optionForKey("servicesPresents", services.length ? 0 : 2, "observed", { value: services.length }));
  } else {
    addCriterion(criteria, notVerified("servicesPresents"));
  }
  addCriterion(criteria, notVerified("servicesDecrits"));

  if (localPosition === null) {
    addCriterion(criteria, notVerified("classementLocal"));
  } else {
    addCriterion(criteria, optionForKey("classementLocal", localPosition >= 1 && localPosition <= 3 ? 0 : (localPosition >= 4 && localPosition <= 10 ? 1 : 2), "observed", { value: localPosition }));
  }

  if (!competitors.length) {
    addCriterion(criteria, notVerified("attractiviteConcurrents"));
  } else {
    let positiveSignals = 0;
    if (asNumber(gaps.rating) !== null && asNumber(gaps.rating) >= -0.1) positiveSignals += 1;
    if (asNumber(gaps.reviews) !== null && asNumber(gaps.reviews) >= 0) positiveSignals += 1;
    if (asNumber(gaps.photos) !== null && asNumber(gaps.photos) >= 0) positiveSignals += 1;
    addCriterion(criteria, optionForKey("attractiviteConcurrents", positiveSignals >= 2 ? 0 : (positiveSignals === 1 ? 1 : 2), "observed", { competitors: competitors.length, gaps }));
  }

  // La conformité du nom nécessite une comparaison humaine avec les sources
  // publiques de l'entreprise et n'est jamais déduite du fournisseur.
  addCriterion(criteria, notVerified("nomConforme"));

  [
    "revendiquee",
    "attributs",
    "nap",
    "logoCouverture",
    "photoRecente",
    "varietePhotos",
    "qualitePhotos",
    "recenceAvis",
    "tauxReponseAvis",
    "qualiteReponsesAvis",
    "questionsReponses",
    "publicationRecente",
    "rythmePublication",
  ].forEach((key) => addCriterion(criteria, notVerified(key)));

  const hiddenCriteria = new Set([
    ...(conditions.photoPresence === "none" ? PHOTO_DEPENDENT_KEYS : []),
    ...(conditions.reviewsPresence === "none" ? ["noteMoyenne", ...REVIEW_DEPENDENT_KEYS] : []),
  ]);
  const byKey = new Map(criteria.map((criterion) => [criterion.key, criterion]));
  CRITERIA_DEPENDENCIES.forEach(({ parent, child, hideWhen }) => {
    if (hideWhen.includes(byKey.get(parent)?.value)) hiddenCriteria.add(child);
  });

  return {
    scoringVersion: SCORING_VERSION,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    conditions,
    criteria: criteria.filter((criterion) => !hiddenCriteria.has(criterion.key)),
  };
}
