import { GRILLE } from "./criteriaCatalog.js";
import { BANDES, CONFIG, SCORING_VERSION } from "./scoreConfig.js";
import {
  QUESTIONNAIRE_VERSION,
  conditionForCriterion,
  normalizeQuestionnaireConditions,
} from "./questionnaireRules.js";

export const CRITERE_IDS = Object.fromEntries(
  GRILLE.flatMap((categorie) => categorie.criteres.map((critere) => [critere.key, critere.key])),
);

function findCriterion(key) {
  for (const category of GRILLE) {
    const criterion = category.criteres.find((item) => item.key === key);
    if (criterion) return { category, criterion };
  }
  return null;
}

function criterionPointsFromChecklist(criterion, checklist = []) {
  const count = Array.isArray(checklist) ? checklist.length : 0;
  if (count >= CONFIG.checklist.noteMaxMinCases) return criterion.opts[0]?.[1] ?? criterion.max;
  if (count >= CONFIG.checklist.noteIntermediaireMinCases) return criterion.opts[1]?.[1] ?? null;
  return criterion.opts[2]?.[1] ?? 0;
}

function selectedOptionIndex(value, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= max) return null;
  return number;
}

export function pointsFromManualStatus(criterion, review) {
  if (!criterion || !review || review.value === "not_verified") return null;

  const exactIndex = selectedOptionIndex(review.selectedOptionIndex, criterion.opts.length);
  if (exactIndex !== null) return criterion.opts[exactIndex]?.[1] ?? null;

  if (criterion.checklist && Array.isArray(review.checklist) && review.checklist.length) {
    return criterionPointsFromChecklist(criterion, review.checklist);
  }

  if (review.value === "compliant") return criterion.opts[0]?.[1] ?? criterion.max;
  if (review.value === "partial") return criterion.opts.length >= 3 ? criterion.opts[1]?.[1] ?? null : null;
  if (review.value === "deficient") return criterion.opts.at(-1)?.[1] ?? 0;
  return null;
}

export function buildScoreInputsFromManualReview(manualReview = {}) {
  const reviews = new Map((manualReview.criteriaReview || []).map((item) => [item.key, item]));
  const conditions = normalizeQuestionnaireConditions(manualReview, manualReview.criteriaReview);
  const answers = {};
  const criteria = [];

  for (const category of GRILLE) {
    for (const criterion of category.criteres) {
      const review = reviews.get(criterion.key) || null;
      const absenceCondition = conditionForCriterion(criterion.key, conditions, manualReview.criteriaReview);
      const explicitAbsence = Boolean(absenceCondition);
      const locationPoints = criterion.key === "adresse" && conditions.locationMode !== "unknown"
        ? (Number.isFinite(review?.points) ? Math.max(0, Math.min(2, Number(review.points))) : null)
        : undefined;
      const points = explicitAbsence ? 0 : (locationPoints !== undefined ? locationPoints : pointsFromManualStatus(criterion, review));
      answers[criterion.key] = points;
      criteria.push({
        key: criterion.key,
        category: category.key,
        categoryLabel: category.cat,
        question: review?.question || criterion.q,
        status: explicitAbsence ? "absence_confirmed" : (absenceCondition ? "not_applicable" : (review?.value || "not_verified")),
        label: absenceCondition === "no_photos" ? "Aucune photo" : (absenceCondition === "no_reviews" ? "Aucun avis" : (absenceCondition ? "Sans objet" : (review?.label || null))),
        checklist: absenceCondition ? [] : (Array.isArray(review?.checklist) ? review.checklist : []),
        selectedOptionIndex: absenceCondition ? null : (review?.selectedOptionIndex ?? null),
        source: explicitAbsence ? "conditional_absence" : (absenceCondition ? "conditional_dependency" : (review?.source || null)),
        evidence: absenceCondition ? { condition: absenceCondition } : (review?.evidence || null),
        points,
        max: criterion.max,
      });
    }
  }

  return {
    scoringVersion: SCORING_VERSION,
    questionnaireVersion: manualReview.questionnaireVersion || QUESTIONNAIRE_VERSION,
    conditions,
    profileKey: manualReview.profileKey || "default",
    answers,
    criteria,
  };
}

export function calculateScoreDetail(answers = {}, profileKey = "default") {
  const profil = CONFIG.secteurs[profileKey] || CONFIG.secteurs.default;
  let total = 0;
  let poidsPrisEnCompte = 0;
  let repondus = 0;
  let totalCrit = 0;
  const categories = [];

  GRILLE.forEach((cat) => {
    let brut = 0;
    let maxEvalue = 0;
    let repondusCat = 0;
    let nonVerifiesCat = 0;

    cat.criteres.forEach((cr) => {
      totalCrit += 1;
      // Portage fidèle de l'ancien Score Efficia (calc() : somme brute sur la
      // grille de 100 points). Chaque critère compte son max au dénominateur,
      // y compris NON VÉRIFIÉ : il vaut alors 0 point et ne peut jamais gonfler
      // artificiellement le score. Aucune renormalisation sur les seuls critères
      // renseignés.
      maxEvalue += cr.max;
      const points = answers[cr.key] ?? null;
      if (points !== null) {
        brut += points;
        repondus += 1;
        repondusCat += 1;
      } else {
        nonVerifiesCat += 1;
      }
    });

    const poidsProfil = profil[cat.key] ?? cat.pts;
    const pct = maxEvalue ? brut / maxEvalue : 0;
    const pointsPonderes = pct * poidsProfil;
    total += pointsPonderes;
    poidsPrisEnCompte += poidsProfil;

    categories.push({
      key: cat.key,
      label: cat.cat,
      brut,
      maxEvalue,
      pct,
      poidsProfil,
      pointsPonderes,
      repondusCat,
      nonVerifiesCat,
    });
  });

  const scoreNormalise = poidsPrisEnCompte ? total * (100 / poidsPrisEnCompte) : 0;
  return {
    total: Number.isFinite(scoreNormalise) ? scoreNormalise : 0,
    repondus,
    totalCrit,
    categories,
    profil,
    poidsPrisEnCompte,
  };
}

export function scoreCriteres(keys, answers = {}) {
  let obtenu = 0;
  let max = 0;

  keys.forEach((key) => {
    const found = findCriterion(CRITERE_IDS[key]);
    const points = answers[key] ?? null;
    if (found && points !== null) {
      obtenu += points;
      max += found.criterion.max;
    }
  });

  return max ? Math.round((obtenu / max) * 100) : null;
}

export function indicesProspect(answers = {}) {
  return {
    visibilite: scoreCriteres(["categoriePrincipale", "categoriesSecondaires", "nap", "classementLocal", "publicationRecente", "rythmePublication", "recenceAvis"], answers),
    confiance: scoreCriteres(["noteMoyenne", "volumeAvis", "tauxReponseAvis", "qualiteReponsesAvis", "qualitePhotos", "contact", "adresse", "nap"], answers),
    conversion: scoreCriteres(["descriptionRemplie", "descriptionQualite", "servicesPresents", "servicesDecrits", "liensAction", "questionsReponses", "varietePhotos"], answers),
  };
}

const PACK_CRITERIA = new Set([
  "revendiquee",
  "categoriePrincipale",
  "categoriesSecondaires",
  "horaires",
  "contact",
  "adresse",
  "attributs",
  "nap",
  "logoCouverture",
  "nombrePhotos",
  "photoRecente",
  "varietePhotos",
  "qualitePhotos",
  "tauxReponseAvis",
  "qualiteReponsesAvis",
  "descriptionRemplie",
  "descriptionQualite",
  "servicesPresents",
  "servicesDecrits",
  "questionsReponses",
  "liensAction",
]);

export function scoreProjetePack(answers = {}) {
  const projected = { ...answers };
  let corriges = 0;
  let ameliorables = 0;

  for (const category of GRILLE) {
    for (const criterion of category.criteres) {
      if (projected[criterion.key] !== null && projected[criterion.key] !== undefined) {
        const fixable = PACK_CRITERIA.has(criterion.key);
        if (projected[criterion.key] < criterion.max) {
          ameliorables += 1;
          if (fixable) corriges += 1;
        }
        projected[criterion.key] = fixable ? criterion.max : projected[criterion.key];
      }
    }
  }
  return {
    projete: Math.min(97, Math.round(calculateScoreDetail(projected).total)),
    corriges,
    ameliorables,
  };
}

function findBand(score) {
  return BANDES.find((band) => score >= band.min) || BANDES.at(-1);
}

export function runScoreEfficia({ manualReview = {} } = {}) {
  const scoreInputs = buildScoreInputsFromManualReview(manualReview);
  const detail = calculateScoreDetail(scoreInputs.answers, scoreInputs.profileKey);
  const score = Number(detail.total.toFixed(2));
  const roundedScore = Math.round(detail.total);

  return {
    scoreInputs,
    reviewedScore: {
      scoringVersion: SCORING_VERSION,
      score,
      roundedScore,
      repondus: detail.repondus,
      totalCrit: detail.totalCrit,
      indices: indicesProspect(scoreInputs.answers),
      projectedPackScore: scoreProjetePack(scoreInputs.answers),
      band: findBand(roundedScore),
      categories: detail.categories,
    },
  };
}
