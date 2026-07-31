// "Votre première action" (Diagnostic Efficia gratuit — freeDiagnostic.priorities).
//
// Une seule phrase IMPÉRATIVE et déterministe par signal (pas de variante, pas
// de hasard, pas de nombre inventé). Ce n'est pas une nouvelle recommandation :
// c'est la reformulation, sous forme d'action concrète, du signal déjà identifié
// par Knowledge/Reasoning (rating/reviews/photos/position/description).
const FIRST_ACTION_BY_SIGNAL = {
  rating: "Mettre en place un suivi des avis et répondre aux retours pour améliorer la note perçue.",
  reviews: "Mettre en place une stratégie de collecte d'avis auprès de vos clients récents.",
  photos: "Ajouter plusieurs photos récentes de votre activité, de vos équipes ou de vos réalisations.",
  position: "Renforcer le classement local : catégories, cohérence des informations et mots-clés pertinents.",
  description: "Rédiger une description claire de vos services, de votre zone d'intervention et de vos différenciants.",
};

const DEFAULT_FIRST_ACTION = "Passer en revue ce point avec l'Audit Efficia™ pour identifier l'action la plus adaptée.";

export function buildFirstAction(signal) {
  return FIRST_ACTION_BY_SIGNAL[signal] || DEFAULT_FIRST_ACTION;
}
