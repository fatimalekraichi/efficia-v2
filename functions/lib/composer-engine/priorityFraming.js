// Sprint 3 (2026-07-31) — helpers de rédaction uniquement, aucune nouvelle
// logique métier : tout part de données déjà calculées en amont (item.signal,
// item.evidence.value déjà produit par evidence.js, item.actionability déjà
// produit par actionability.js). Rien n'est recalculé, rien n'est inventé.
//
// Trois helpers, utilisés uniquement par priorityCard() (renderAnalysisHtml.js,
// section "Les priorités") :
//   - angleForSignal()      : l'angle psychologique propre à chaque signal
//                             ("chaque priorité raconte une histoire" — chaque
//                             signal insiste sur un mécanisme différent).
//   - buildConstat()        : le niveau de lecture 1, purement factuel, à
//                             partir de la seule valeur déjà mesurée.
//   - buildEffortImpactNote(): une phrase courte qui relie la difficulté et le
//                             temps déjà estimés, sans jamais les recalculer.

// Un signal ⇒ un mécanisme psychologique distinct, jamais une formulation
// générique répétée d'un signal à l'autre.
const SIGNAL_ANGLES = {
  rating: "Confiance avant le clic",
  reviews: "Le poids de la preuve sociale",
  photos: "Se projeter avant de choisir",
  description: "Comprendre votre activité en un coup d'œil",
  categories: "Ce que Google comprend de vous",
  position: "Être vu au bon moment",
};

export function angleForSignal(signal) {
  return SIGNAL_ANGLES[signal] || null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Niveau de lecture 1 ("Constat") : une phrase factuelle et neutre, jamais
// interprétative, jamais extrapolée — construite uniquement à partir de
// item.evidence.value (déjà calculé par evidence.js, non modifié ici).
// Chaque signal a sa propre formulation, cohérente avec l'unité déjà définie
// dans evidence.js (avis, /5, photos, caractères, catégories, position).
const CONSTAT_BUILDERS = {
  rating: (value) => `Actuellement, votre note moyenne est de ${value}/5.`,
  reviews: (value) => `Actuellement, votre fiche compte ${value} avis.`,
  photos: (value) => (value > 0
    ? `Actuellement, votre fiche présente ${value} photo${value > 1 ? "s" : ""}.`
    : "Actuellement, votre fiche ne présente aucune photo."),
  description: (value) => (value > 0
    ? `Actuellement, votre description compte ${value} caractères.`
    : "Actuellement, votre fiche ne comporte aucune description."),
  categories: (value) => (value > 0
    ? `Actuellement, votre fiche référence ${value} catégorie${value > 1 ? "s" : ""} secondaire${value > 1 ? "s" : ""}.`
    : "Actuellement, votre fiche ne référence aucune catégorie secondaire."),
  position: (value) => `Actuellement, votre fiche apparaît en position ${value} sur la recherche testée.`,
};

export function buildConstat(item = {}) {
  const builder = CONSTAT_BUILDERS[item.signal];
  const value = toNumber(item.evidence?.value);
  if (!builder || value === null) return null;
  return builder(value);
}

// Niveau de lecture 2, partie "effort/impact" (objectif 4) : une phrase
// courte reliant la difficulté et le temps déjà estimés (actionability.js),
// jamais un recalcul de l'un ou de l'autre. Classement volontairement
// indépendant du regroupement du plan d'action (Sprint 2B) : ce texte
// accompagne la carte de priorité, pas la timeline d'actions.
const OPEN_ENDED_TIMES = new Set(["variable", "en continu", "long terme"]);

export function buildEffortImpactNote({ difficulty, estimatedTime } = {}) {
  const time = String(estimatedTime || "").trim().toLowerCase();

  if (OPEN_ENDED_TIMES.has(time)) {
    return "Cette amélioration se construit progressivement, mais elle renforce votre crédibilité sur la durée.";
  }
  if (difficulty === "hard") {
    return "Cette action demande davantage de temps, mais produit généralement un effet durable.";
  }
  if (difficulty === "medium") {
    return "Cette action demande un peu plus de temps, mais l'effet se voit rapidement sur votre fiche.";
  }
  if (difficulty === "easy") {
    return "Quelques minutes peuvent suffire à améliorer un élément pourtant très visible.";
  }
  return null;
}
