import { GRILLE } from "./criteriaCatalog.js";
import { CONFIG, LEGACY_SCORING_VERSION, SCORING_VERSION, resolveScoringVersion } from "./scoreConfig.js";
import {
  CRITERIA_DEPENDENCIES,
  PHOTO_DEPENDENT_KEYS,
  QUESTIONNAIRE_VERSION,
  REVIEW_DEPENDENT_KEYS,
} from "./questionnaireRules.js";
import { classifyPrimaryCategory, classifySecondaryCategories } from "../categoryEvidence.js";
import { normalizeStoredActionLinkEvidence } from "../actionLinkEvidence.js";

export const AUTO_EVIDENCE_CONTRACTS = Object.freeze({
  categoriePrincipale: "activité confirmée + catégorie principale observée",
  categoriesSecondaires: "statut de disponibilité + liste fournisseur",
  horaires: "champ horaires fournisseur non vide",
  contact: "présence explicite des champs téléphone/site",
  liensAction: "champs CTA fournisseur explicitement observés",
  nombrePhotos: "nombre de photos numérique",
  noteMoyenne: "note numérique",
  volumeAvis: "volume propre + exactement trois volumes concurrents numériques",
  descriptionRemplie: "champ description observé + longueur numérique",
  servicesPresents: "champ services observé + liste fournisseur",
  classementLocal: "rang normalisé one-based + source du rang",
  attractiviteConcurrents: "note et avis propres + moyennes concurrentielles",
});

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
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function classifyLocalRank(value) {
  const rank = asNumber(value);
  if (rank === null || !Number.isInteger(rank) || rank < 0) return { status:"unknown", optionIndex:null };
  if (rank === 0) return { status:"absent", optionIndex:2 };
  if (rank <= 3) return { status:"top3", optionIndex:0 };
  return { status:"first_page", optionIndex:1 };
}

// Classe chaque métrique (note / volume d'avis) séparément par rapport à la
// moyenne concurrentielle, dans la même tolérance métier existante :
// "up" (nettement au-dessus), "down" (nettement en dessous), "comparable"
// (dans la tolérance). Sert uniquement à calculer `synthesisStatus`
// ci-dessous, jamais `status`/`optionIndex` (voir note plus bas).
function classifyCompetitiveSignal(ratio, lowerBound, upperBound) {
  if (ratio < lowerBound) return "down";
  if (ratio > upperBound) return "up";
  return "comparable";
}

export function classifyCompetitiveAttractiveness({ rating, reviews, averageRating, averageReviews, tolerance = CONFIG.seuils.toleranceConcurrents } = {}) {
  const ownRating = asNumber(rating);
  const ownReviews = asNumber(reviews);
  const competitorRating = asNumber(averageRating);
  const competitorReviews = asNumber(averageReviews);
  if ([ownRating, ownReviews, competitorRating, competitorReviews].some((value) => value === null)
      || competitorRating <= 0 || competitorReviews <= 0) {
    return { status:"unknown", optionIndex:null, ratingRatio:null, reviewsRatio:null, ratingSignal:null, reviewsSignal:null, synthesisStatus:"unknown" };
  }
  const ratingRatio = ownRating / competitorRating;
  const reviewsRatio = ownReviews / competitorReviews;
  const lowerBound = 1 - tolerance;
  const upperBound = 1 + tolerance;

  // `status`/`optionIndex` : comportement historique INCHANGÉ (logique "OR"
  // d'origine), conservé tel quel car il alimente encore le point v4
  // (grille notée historique) via optionForKey — ne jamais le modifier ici
  // sous peine de déplacer silencieusement des scores v4 déjà calculés.
  let status;
  if (ratingRatio < lowerBound || reviewsRatio < lowerBound) {
    status = "behind";
  } else if (ratingRatio > upperBound && reviewsRatio > upperBound) {
    status = "ahead";
  } else {
    status = "comparable";
  }
  const optionIndex = status === "ahead" ? 0 : status === "behind" ? 2 : 1;

  // `synthesisStatus` : nouvelle classification purement informative pour la
  // synthèse "Confiance visible face aux concurrents" du diagnostic gratuit
  // (v5). Combine les deux signaux indépendamment :
  // - les deux "up"         -> ahead ("Devant")
  // - les deux "down"       -> behind ("Derrière")
  // - les deux "comparable" -> comparable ("Comparable")
  // - toute combinaison mixte (up/down, up/comparable, down/comparable)
  //   -> contrasted ("Contrastée") : jamais de conclusion absolue quand les
  //   signaux ne pointent pas tous dans le même sens.
  // N'affecte jamais optionIndex/points/status ci-dessus.
  const ratingSignal = classifyCompetitiveSignal(ratingRatio, lowerBound, upperBound);
  const reviewsSignal = classifyCompetitiveSignal(reviewsRatio, lowerBound, upperBound);
  let synthesisStatus;
  if (ratingSignal === "up" && reviewsSignal === "up") synthesisStatus = "ahead";
  else if (ratingSignal === "down" && reviewsSignal === "down") synthesisStatus = "behind";
  else if (ratingSignal === "comparable" && reviewsSignal === "comparable") synthesisStatus = "comparable";
  else synthesisStatus = "contrasted";

  return { status, optionIndex, ratingRatio, reviewsRatio, ratingSignal, reviewsSignal, synthesisStatus };
}

export function classifyReviewVolume({ reviews, competitors, tolerance = CONFIG.seuils.toleranceConcurrents } = {}) {
  const ownReviews = asNumber(reviews);
  const competitorReviews = (Array.isArray(competitors) ? competitors : [])
    .map((competitor) => asNumber(competitor?.reviews))
    .filter((value) => value !== null && value >= 0);
  if (ownReviews === null || ownReviews < 0 || competitorReviews.length !== 3) {
    return {
      status:"unknown",
      optionIndex:null,
      ownReviews,
      competitorReviews,
      averageReviews:null,
      ratio:null,
    };
  }
  const averageReviews = competitorReviews.reduce((sum, value) => sum + value, 0) / 3;
  const ratio = averageReviews === 0 ? (ownReviews > 0 ? Number.POSITIVE_INFINITY : 1) : ownReviews / averageReviews;
  if (ownReviews > averageReviews * (1 + tolerance)) {
    return { status:"superior", optionIndex:0, ownReviews, competitorReviews, averageReviews, ratio };
  }
  if (ownReviews < averageReviews * (1 - tolerance)) {
    return { status:"inferior", optionIndex:2, ownReviews, competitorReviews, averageReviews, ratio };
  }
  return { status:"comparable", optionIndex:1, ownReviews, competitorReviews, averageReviews, ratio };
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

function getSecondaryCategories(normalized, includeGenericCategories = false) {
  return [...new Set([
    ...asArray(normalized?.secondary_categories),
    ...asArray(normalized?.subtypes),
    ...(includeGenericCategories ? asArray(normalized?.categories) : []),
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

export function buildScoreCatalog(requestedScoringVersion = SCORING_VERSION) {
  const scoringVersion = resolveScoringVersion(requestedScoringVersion);
  return {
    scoringVersion,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    categories: GRILLE.map((category) => ({
      key: category.key,
      label: category.cat,
      points: scoringVersion === LEGACY_SCORING_VERSION
        ? category.pts
        : category.criteres.filter((criterion) => criterion.scored !== false).reduce((sum, criterion) => sum + criterion.max, 0),
      precondition: null,
      criteria: category.criteres.map((criterion) => ({
        key: criterion.key,
        question: scoringVersion === LEGACY_SCORING_VERSION && criterion.legacyQuestion
          ? criterion.legacyQuestion
          : criterion.q,
        help: criterion.aide,
        max: scoringVersion === LEGACY_SCORING_VERSION || criterion.scored !== false ? criterion.max : 0,
        historicalMax: criterion.max,
        scored: scoringVersion === LEGACY_SCORING_VERSION || criterion.scored !== false,
        informational: scoringVersion !== LEGACY_SCORING_VERSION && criterion.informational === true,
        checklist: criterion.checklist ? CONFIG.checklist.criteres[criterion.checklist] || [] : [],
        options: scoringVersion !== LEGACY_SCORING_VERSION && criterion.informational === true
          ? []
          : criteriaOptions(criterion),
      })),
    })),
  };
}

export function buildScorePrefill(analysis = {}, { verifiedCategoryEvidence = false, scoringVersion: requestedScoringVersion = SCORING_VERSION } = {}) {
  const scoringVersion = resolveScoringVersion(requestedScoringVersion);
  const business = analysis.business || {};
  const normalized = business.normalized || {};
  const benchmark = analysis.benchmark || {};
  const competitors = Array.isArray(business.competitors) ? business.competitors : [];
  const criteria = [];

  const confirmedActivity = verifiedCategoryEvidence
    ? (getNormalizedValue(normalized, ["confirmed_activity"]) || getNormalizedValue(business, ["confirmedActivity"]))
    : null;
  const primaryCategory = getNormalizedValue(normalized, ["category", "type", "main_category"])
    || (!verifiedCategoryEvidence ? business.activity : null);
  const secondaryCategories = getSecondaryCategories(normalized, !verifiedCategoryEvidence);
  const secondaryAvailability = wasObserved(normalized, ["secondary_categories", "subtypes"])
    ? "available"
    : "unavailable";
  const workingHours = getNormalizedValue(normalized, ["working_hours", "hours"]);
  const website = getNormalizedValue(normalized, ["website", "site"]);
  const phone = getNormalizedValue(normalized, ["phone", "phone_number"]);
  const contactWasObserved = wasObserved(normalized, ["website", "site", "phone", "phone_number"]);
  const actionLinkEvidence = normalizeStoredActionLinkEvidence(normalized);
  const services = getServices(normalized);
  const photos = asNumber(business.photosCount);
  const rating = asNumber(business.rating);
  const reviewsCount = asNumber(business.reviews);
  const avgReviews = asNumber(benchmark.averages?.reviews);
  const avgRating = asNumber(benchmark.averages?.rating);
  const localPosition = asNumber(business.localPosition);
  const rankSource = String(normalized.search_rank_context?.source || "").trim();
  const descriptionLength = asNumber(business.descriptionLength);
  const conditions = {
    photoPresence: photos === null ? "unknown" : (photos > 0 ? "present" : "none"),
    reviewsPresence: reviewsCount === null && rating === null
      ? "unknown"
      : (reviewsCount === 0 ? "none" : "present"),
    locationMode: "unknown",
    addressVerification: "unknown",
    serviceAreaVerification: "unknown",
  };

  if (!verifiedCategoryEvidence) {
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
  } else {
    const primaryDecision = classifyPrimaryCategory(confirmedActivity, primaryCategory);
    const primaryOptionIndex = primaryDecision.status === "precise"
      ? 0
      : (primaryDecision.status === "approximate" ? 1 : (primaryDecision.status === "incompatible" ? 2 : null));
    addCriterion(criteria, primaryOptionIndex === null
      ? notVerified("categoriePrincipale", "unknown", {
          activity: confirmedActivity || null,
          observedCategory: primaryCategory || null,
        })
      : optionForKey("categoriePrincipale", primaryOptionIndex, "auto", {
          activity: confirmedActivity,
          observedCategory: primaryCategory,
          decision: primaryDecision.status,
        }));

    const secondaryDecision = classifySecondaryCategories({
      activity: confirmedActivity,
      primaryCategory,
      secondaryCategories,
      availability: secondaryAvailability,
    });
    if (secondaryDecision.status === "relevant") {
      addCriterion(criteria, optionForKey("categoriesSecondaires", 0, "auto", {
        categories: secondaryCategories,
        relevant: secondaryDecision.relevant,
      }));
    } else if (secondaryDecision.status === "none" || secondaryDecision.status === "irrelevant") {
      addCriterion(criteria, optionForKey("categoriesSecondaires", 1, "auto", {
        categories: secondaryCategories,
        decision: secondaryDecision.status,
      }));
    } else {
      addCriterion(criteria, notVerified("categoriesSecondaires", "unknown", {
        availability: secondaryAvailability,
        categories: secondaryCategories,
      }));
    }
  }

  addCriterion(criteria, workingHours
    ? optionForKey("horaires", 0, "observed", { value: workingHours })
    : notVerified("horaires"));

  if (contactWasObserved) {
    addCriterion(criteria, optionForKey("contact", phone && website ? 0 : (phone || website ? 1 : 2), "observed", { availability:"available", phone: Boolean(phone), website: Boolean(website) }));
  } else {
    addCriterion(criteria, notVerified("contact"));
  }
  if (actionLinkEvidence.availability === "available") {
    addCriterion(criteria, optionForKey("liensAction", actionLinkEvidence.directLinks.length ? 0 : 2, "observed", {
      availability:"available",
      links:actionLinkEvidence.links,
      directLinks:actionLinkEvidence.directLinks.length,
    }));
  } else {
    addCriterion(criteria, notVerified("liensAction", "unknown", { availability:"unavailable", links:[] }));
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

  const reviewVolume = classifyReviewVolume({ reviews:reviewsCount, competitors });
  const reviewVolumeEvidence = {
    value:reviewVolume.ownReviews,
    competitorReviews:reviewVolume.competitorReviews,
    average:reviewVolume.averageReviews,
    ratio:reviewVolume.ratio,
    tolerance:CONFIG.seuils.toleranceConcurrents,
    decision:reviewVolume.status,
  };
  addCriterion(criteria, reviewVolume.optionIndex === null
    ? notVerified("volumeAvis", "unknown", reviewVolumeEvidence)
    : optionForKey("volumeAvis", reviewVolume.optionIndex, "auto", reviewVolumeEvidence));

  if (descriptionLength === null || !wasObserved(normalized, ["description", "description_length"])) {
    addCriterion(criteria, notVerified("descriptionRemplie"));
  } else {
    // Seuils historiques : ≥600 = complète, >0 = courte, 0 = vide (Absente).
    addCriterion(criteria, optionForKey("descriptionRemplie", descriptionLength >= 600 ? 0 : (descriptionLength > 0 ? 1 : 2), "observed", { value: descriptionLength }));
  }
  // Historique : la QUALITÉ de la description est une check-list visuelle → reste manuelle.
  addCriterion(criteria, notVerified("descriptionQualite"));

  if (Array.isArray(services)) {
    addCriterion(criteria, optionForKey("servicesPresents", services.length ? 0 : 2, "observed", { availability:"available", value: services.length }));
  } else {
    addCriterion(criteria, notVerified("servicesPresents"));
  }
  addCriterion(criteria, notVerified("servicesDecrits"));

  const localRankDecision = classifyLocalRank(localPosition);
  if (localRankDecision.optionIndex === null || !rankSource) {
    addCriterion(criteria, notVerified("classementLocal", "unknown", { value:localPosition, source:rankSource || null }));
  } else {
    addCriterion(criteria, optionForKey("classementLocal", localRankDecision.optionIndex, "observed", {
      value:localPosition,
      source:rankSource,
      decision:localRankDecision.status,
      rawRank:asNumber(normalized.search_rank_context?.raw_rank),
    }));
  }

  const attractiveness = classifyCompetitiveAttractiveness({
    rating,
    reviews:reviewsCount,
    averageRating:avgRating,
    averageReviews:avgReviews,
  });
  if (!competitors.length || attractiveness.optionIndex === null) {
    addCriterion(criteria, notVerified("attractiviteConcurrents", "unknown", {
      rating,
      reviews:reviewsCount,
      averageRating:avgRating,
      averageReviews:avgReviews,
    }));
  } else {
    addCriterion(criteria, optionForKey("attractiviteConcurrents", attractiveness.optionIndex, "observed", {
      competitors:competitors.length,
      rating,
      reviews:reviewsCount,
      averageRating:avgRating,
      averageReviews:avgReviews,
      tolerance:CONFIG.seuils.toleranceConcurrents,
      decision:attractiveness.status,
      ratingRatio:attractiveness.ratingRatio,
      reviewsRatio:attractiveness.reviewsRatio,
      // Libellé informatif de la synthèse "Confiance visible face aux
      // concurrents" (v5) — distinct de `decision` (status historique, lié
      // à optionIndex/points v4) pour ne jamais faire bouger un score déjà
      // calculé. ratingSignal/reviewsSignal permettent au libellé "Contrastée"
      // de préciser QUEL signal est au-dessus/en dessous. Voir
      // classifyCompetitiveAttractiveness.
      synthesisStatus:attractiveness.synthesisStatus,
      ratingSignal:attractiveness.ratingSignal,
      reviewsSignal:attractiveness.reviewsSignal,
    }));
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
    scoringVersion,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    conditions,
    criteria: criteria.filter((criterion) => !hiddenCriteria.has(criterion.key)).map((criterion) => (
      scoringVersion !== LEGACY_SCORING_VERSION && criterion.key === "attractiviteConcurrents"
        ? {
            ...criterion,
            question: "Confiance visible face aux concurrents",
            selectedOptionIndex: null,
            points: null,
            scored: false,
            informational: true,
          }
        : criterion
    )),
  };
}
