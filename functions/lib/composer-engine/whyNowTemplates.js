import { applyToneRules } from "./toneRules.js";
import { labelForSignal } from "./vocabulary.js";

const WHY_NOW_BY_SIGNAL = {
  position: "Chaque semaine où votre fiche reste dans cette configuration, une partie des internautes peut contacter une entreprise mieux positionnée avant même de découvrir votre établissement.",
  description: "Chaque semaine où votre fiche reste peu explicite, certains prospects doivent deviner si votre entreprise répond vraiment à leur besoin.",
  photos: "Chaque semaine sans visuels récents, votre fiche montre moins clairement que votre activité est active et concrète aujourd'hui.",
  reviews: "Chaque semaine sans stratégie d'avis structurée, votre réputation progresse moins vite qu'elle le pourrait.",
  rating: "Chaque semaine sans suivi des avis, votre note reste plus exposée aux retours négatifs isolés.",
};

export function buildWhyNow({ priorities = [], actionPlan = [] } = {}) {
  const topPriority = priorities[0] || actionPlan[0];
  if (!topPriority) {
    return {
      text: applyToneRules("L'objectif est maintenant de maintenir vos signaux forts et de garder une fiche active dans le temps."),
    };
  }

  const intro = WHY_NOW_BY_SIGNAL[topPriority.signal]
    || `Chaque semaine sans amélioration sur ${labelForSignal(topPriority.signal)}, votre fiche peut rester moins lisible qu'une fiche concurrente mieux structurée.`;
  // Sprint 4 (consolidation) — objectif 1 : cette phrase de clôture reprenait
  // mot pour mot la clause finale du résumé exécutif (summaryTemplates.js,
  // actionSentence()/LEVERS_CLOSING : "...le meilleur rapport entre effort et
  // impact potentiel"), répétée à l'identique en première et dernière page du
  // même rapport. Reformulée ici avec la même idée, sans reprendre la clause.
  const action = "Ces actions ont été retenues parce qu'elles demandent, dans votre situation, le moins d'effort pour le bénéfice le plus immédiat.";

  return {
    text: applyToneRules(`${intro} ${action}`),
  };
}
