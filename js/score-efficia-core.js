function bounded(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreFromApplicablePoints(pointsObtenus, pointsApplicables) {
  const numerator = Number(pointsObtenus);
  const denominator = Number(pointsApplicables);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return bounded((numerator / denominator) * 100, 0, 100);
}

// Méthode des plus grands restes : préserver les poids réels, mais répartir
// exactement le total entier affiché. Les ex aequo suivent l'ordre du barème.
function allocateDisplayedPoints(values, target, caps = values.map(() => Infinity)) {
  const result = values.map((value, i) => Math.min(caps[i], Math.floor(value)));
  const order = values.map((value, i) => ({ i, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  let remaining = target - result.reduce((sum, value) => sum + value, 0);
  while (remaining > 0) {
    let allocated = false;
    for (const { i } of order) {
      if (remaining && result[i] < caps[i]) { result[i]++; remaining--; allocated = true; }
    }
    if (!allocated) break;
  }
  return result;
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
    const maxima = categories.map(category => category.maximumEffectifCategorie * normalizationFactor);
    const points = categories.map((category, i) => bounded(category.pointsPonderesBruts * normalizationFactor, 0, maxima[i]));
    const displayedMaxima = allocateDisplayedPoints(maxima, normalizationFactor ? 100 : 0);
    const displayedPoints = allocateDisplayedPoints(points, Math.round(points.reduce((sum, value) => sum + value, 0)), displayedMaxima);
    categories.forEach((category, i) => {
      category.pointsPonderesPrecis = points[i];
      category.maximumEffectifNormalisePrecis = maxima[i];
      category.pointsPonderes = displayedPoints[i];
      category.maximumEffectifNormalise = displayedMaxima[i];
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
  const finalScore = legacy ? scoreFromApplicablePoints(pointsObtenusApplicables, pointsApplicables) : pointsObtenusApplicables;

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
