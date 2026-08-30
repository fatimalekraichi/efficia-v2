// "Votre première action" (Diagnostic Efficia gratuit — freeDiagnostic.priorities).
//
// Une seule phrase IMPÉRATIVE et déterministe par signal (pas de variante, pas
// de hasard, pas de nombre inventé). Ce n'est pas une nouvelle recommandation :
// c'est la reformulation, sous forme d'action concrète, du signal déjà identifié
// par Knowledge/Reasoning (rating/reviews/photos/position/description/categories).
//
// Correctif générique (2026-08-30, retour terrain diagnostic gratuit) : deux priorités
// distinctes (clarté/conversion via "description" et visibilité locale via
// "position"/"categories") pouvaient toutes deux pousser une action centrée
// sur "vos services", donnant l'impression de répéter deux fois la même
// recommandation. Chaque signal garde ici un territoire exclusif :
//  - "description" reste seul propriétaire de la présentation des
//    prestations/services (clarté/conversion) ;
//  - "position" ne porte que sur le CLASSEMENT et les écarts constatés avec
//    les fiches mieux placées — il ne mentionne jamais la catégorie, ne la
//    fait jamais vérifier/modifier/remplacer, une position faible n'étant
//    jamais à elle seule une preuve d'inadéquation de catégorie ;
//  - "categories" ne porte que sur la ou les catégories elles-mêmes
//    (secondaires absentes, ou inadéquation avérée de la catégorie
//    principale — cf. narrativeModel.js pour ce second cas) — jamais sur le
//    classement, jamais d'affirmation qu'une catégorie doit être changée :
//    on ne fait que proposer de VÉRIFIER, jamais de conclure à sa place
//    faute de preuve suffisante.
const FIRST_ACTION_BY_SIGNAL = {
  rating: "Mettre en place un suivi des avis et répondre aux retours pour améliorer la note perçue.",
  reviews: "Mettre en place une stratégie de collecte d'avis auprès de vos clients récents.",
  photos: "Ajouter plusieurs photos récentes de votre activité, de vos équipes ou de vos réalisations.",
  position: "Identifier les écarts visibles avec les fiches mieux positionnées, puis concentrer les efforts sur le levier local le plus important.",
  description: "Rédiger une description claire de vos services, de votre zone d'intervention et de vos différenciants.",
  categories: "Ajouter des catégories secondaires pertinentes pour élargir les recherches locales sur lesquelles votre fiche peut apparaître.",
};

const DEFAULT_FIRST_ACTION = "Passer en revue ce point avec l'Audit Efficia™ pour identifier l'action la plus adaptée.";

export function buildFirstAction(signal) {
  return FIRST_ACTION_BY_SIGNAL[signal] || DEFAULT_FIRST_ACTION;
}
