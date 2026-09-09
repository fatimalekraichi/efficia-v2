function bounded(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreFromApplicablePoints(pointsObtenus, pointsApplicables) {
  const numerator = Number(pointsObtenus);
  const denominator = Number(pointsApplicables);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return bounded((numerator / denominator) * 100, 0, 100);
}

/**
 * Source de vérité unique du calcul Score Efficia, utilisable dans le
 * navigateur comme par les fonctions Cloudflare.
 */
function calculateEfficiaScoreDetail({
  grid = [],
  sectors = {},
  answers = {},
  profileKey = "default",
  scoringVersion,
  legacyScoringVersion,
  manualScoredCriteria = [],
  notApplicableCriteria = [],
} = {}) {
  const profile = sectors[profileKey] || sectors.default || {};
  const legacy = scoringVersion === legacyScoringVersion;
  const manuallyScored = new Set(Array.isArray(manualScoredCriteria) ? manualScoredCriteria : []);
  const notApplicable = new Set(Array.isArray(notApplicableCriteria) ? notApplicableCriteria : []);
  let total = 0;
  let effectiveProfileMaximum = 0;
  let answered = 0;
  let scoredCriteriaCount = 0;
  const categories = [];

  grid.forEach((category) => {
    let rawPoints = 0;
    let evaluatedMaximum = 0;
    let answeredInCategory = 0;
    let unverifiedInCategory = 0;
    const historicalRawMaximum = category.criteres.reduce(
      (sum, criterion) => sum + Number(criterion.max || 0),
      0,
    );

    category.criteres.forEach((criterion) => {
      const scored = legacy || criterion.scored !== false || manuallyScored.has(criterion.key);
      if (!scored) return;
      if (!legacy && notApplicable.has(criterion.key)) return;
      scoredCriteriaCount += 1;
      evaluatedMaximum += Number(criterion.max || 0);
      const points = answers[criterion.key];
      if (points !== null && points !== undefined && Number.isFinite(Number(points))) {
        rawPoints += Number(points);
        answered += 1;
        answeredInCategory += 1;
      } else {
        unverifiedInCategory += 1;
      }
    });

    const profileWeight = Number(profile[category.key] ?? category.pts ?? 0);
    const denominator = legacy ? evaluatedMaximum : historicalRawMaximum;
    const percentage = denominator > 0 ? rawPoints / denominator : 0;
    const capacityPercentage = denominator > 0 ? evaluatedMaximum / denominator : 0;
    const rawWeightedPoints = percentage * profileWeight;
    const effectiveCategoryMaximum = capacityPercentage * profileWeight;
    total += rawWeightedPoints;
    effectiveProfileMaximum += legacy ? profileWeight : effectiveCategoryMaximum;

    categories.push({
      cat: category,
      key: category.key,
      label: category.cat,
      brut: rawPoints,
      maxEvalue: evaluatedMaximum,
      pct: percentage,
      poidsProfil: profileWeight,
      pointsPonderes: rawWeightedPoints,
      pointsPonderesBruts: rawWeightedPoints,
      maximumEffectifCategorie: effectiveCategoryMaximum,
      historicalRawMax: historicalRawMaximum,
      capacitePct: capacityPercentage,
      repondusCat: answeredInCategory,
      nonVerifiesCat: unverifiedInCategory,
    });
  });

  const normalizationFactor = Number.isFinite(effectiveProfileMaximum) && effectiveProfileMaximum > 0
    ? 100 / effectiveProfileMaximum
    : 0;
  if (!legacy) {
    categories.forEach((category) => {
      category.pointsPonderes = category.pointsPonderesBruts * normalizationFactor;
      category.maximumEffectifNormalise = category.maximumEffectifCategorie * normalizationFactor;
    });
  }

  /* En v5, le score global est strictement le ratio des sous-scores
     applicables affichés dans le rapport. Un critère not_applicable est déjà
     absent de chaque catégorie : il ne peut donc pas réapparaître sous la
     forme d'un plafond global implicite. */
  const pointsObtenusApplicables = legacy
    ? total
    : categories.reduce((sum, category) => sum + Math.round(category.pointsPonderes), 0);
  const pointsApplicables = legacy
    ? effectiveProfileMaximum
    : categories.reduce((sum, category) => sum + Math.round(category.maximumEffectifNormalise), 0);
  const finalScore = scoreFromApplicablePoints(pointsObtenusApplicables, pointsApplicables);

  return {
    total: finalScore,
    repondus: answered,
    totalCrit: scoredCriteriaCount,
    categories,
    pointsObtenusApplicables,
    pointsApplicables,
    profil: profile,
    poidsPrisEnCompte: effectiveProfileMaximum,
    maximumEffectifProfil: effectiveProfileMaximum,
    facteurNormalisation: normalizationFactor,
    scoringVersion,
  };
}

globalThis.EfficiaScoreCore = Object.freeze({
  calculateScoreDetail: calculateEfficiaScoreDetail,
  scoreFromApplicablePoints,
});
