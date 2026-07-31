export const COMPOSER_CONFIG = {
  locale: "fr",
  caps: {
    strengths: 3,
    weaknesses: 3,
    opportunities: 5,
    priorities: 3,
    keyFindings: 3,
    actionPlan: 5,
    improvementDrivers: 3,
  },
  actionEaseFactor: {
    easy: 1.2,
    medium: 1,
    hard: 0.8,
    variable: 0.75,
  },
  improvementPotential: {
    weights: {
      gap: 0.35,
      weakCount: 0.25,
      gain: 0.2,
      ease: 0.2,
    },
    weakSignalCap: 6,
    gainPriorityCap: 30,
    gapNormalizers: {
      rating: 1,
      reviews: 100,
      photos: 100,
    },
    // Point 9 du plan (2026-07-31, Sprint 2A) : phrase de cadrage temporel par
    // palier, en plus du label existant — ne modifie ni les seuils (`min`) ni
    // les étoiles (`stars`), donc aucun impact sur le calcul du score lui-même.
    bands: [
      { min: 80, stars: 5, label: "Très élevé", timeframe: "Accessible rapidement avec des optimisations ciblées." },
      { min: 60, stars: 4, label: "Élevé", timeframe: "Accessible avec des optimisations réalisables en moins de deux mois." },
      { min: 40, stars: 3, label: "Modéré", timeframe: "Nécessite plusieurs améliorations progressives." },
      { min: 20, stars: 2, label: "Limité", timeframe: "Nécessite un travail structuré sur plusieurs mois." },
      { min: 0, stars: 1, label: "Faible", timeframe: "Nécessite un travail plus approfondi sur plusieurs mois." },
    ],
    signalLabels: {
      position: "Visibilité locale",
      description: "Description",
      photos: "Galerie photos",
      reviews: "Avis clients",
      rating: "Note moyenne",
      categories: "Catégories",
      global: "Performance globale",
    },
    note: "Estimation interne — pas une promesse de résultat.",
  },
  scoreBands: [
    { min: 90, label: "Excellente" },
    { min: 75, label: "Solide" },
    { min: 50, label: "Perfectible" },
    { min: 0, label: "À renforcer" },
  ],
};
