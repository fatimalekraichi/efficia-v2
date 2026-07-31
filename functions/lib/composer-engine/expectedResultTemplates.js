// Reformulation déterministe du "résultat attendu" d'une priorité du Diagnostic
// Efficia gratuit (Étape A — freeDiagnostic.priorities[].expectedResult).
//
// Règles strictes :
// - une seule phrase FIXE par signal (pas de variante, pas de hasard) ;
// - ne fait que reformuler positivement un bénéfice déjà exprimé par
//   logic.businessImpact / logic.competitiveAngle (aucune nouvelle causalité) ;
// - aucune promesse chiffrée, aucun engagement de résultat.
const EXPECTED_RESULT_BY_SIGNAL = {
  rating: "Une note mieux valorisée peut rassurer davantage de prospects dès la comparaison.",
  reviews: "Un volume d'avis plus visible peut renforcer la preuve sociale au moment du choix.",
  photos: "Une galerie plus actuelle peut mieux démontrer une activité active aujourd'hui.",
  position: "Une meilleure position peut vous rendre visible avant qu'un prospect ne contacte une fiche concurrente.",
  description: "Une description plus claire peut aider un prospect à comprendre l'offre avant même d'appeler.",
};

const DEFAULT_EXPECTED_RESULT = "Ce point traité peut renforcer la clarté et la confiance perçues par un prospect.";

export function buildExpectedResult(signal) {
  return EXPECTED_RESULT_BY_SIGNAL[signal] || DEFAULT_EXPECTED_RESULT;
}
