function bounded(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
} = {}) {
  const profile = sectors[profileKey] || sectors.default || {};
  const legacy = scoringVersion === legacyScoringVersion;
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
      const scored = legacy || criterion.scored !== false;
      if (!scored) return;
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
  const normalizedScore = bounded(total * normalizationFactor, 0, 100);
  if (!legacy) {
    categories.forEach((category) => {
      category.pointsPonderes = category.pointsPonderesBruts * normalizationFactor;
      category.maximumEffectifNormalise = category.maximumEffectifCategorie * normalizationFactor;
    });
  }

  return {
    total: Number.isFinite(normalizedScore) ? normalizedScore : 0,
    repondus: answered,
    totalCrit: scoredCriteriaCount,
    categories,
    profil: profile,
    poidsPrisEnCompte: effectiveProfileMaximum,
    maximumEffectifProfil: effectiveProfileMaximum,
    facteurNormalisation: normalizationFactor,
    scoringVersion,
  };
}

globalThis.EfficiaScoreCore = Object.freeze({
  calculateScoreDetail: calculateEfficiaScoreDetail,
});
