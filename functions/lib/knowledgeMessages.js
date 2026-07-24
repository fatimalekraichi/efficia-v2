import { KNOWLEDGE_MESSAGES_VERSION } from "./knowledgeConfig.js";

export { KNOWLEDGE_MESSAGES_VERSION };

export const KNOWLEDGE_MESSAGES = {
  FORCE_REVIEWS: [
    "Vous disposez d'un nombre d'avis supérieur à la quasi-totalité de vos concurrents.",
    "Votre réputation est portée par un volume d'avis exceptionnel ({reviews} avis).",
    "Avec {reviews} avis, vous dominez votre zone sur le signal que les clients regardent en premier.",
  ],
  FORCE_RATING: [
    "Votre note de {rating}/5 est un vrai capital de confiance, long à construire.",
    "Vous tenez une note de {rating}/5, au niveau des meilleures fiches de votre zone.",
  ],
  FORCE_POSITION: [
    "Votre fiche ressort dans le trio de tête des recherches locales (position {position}).",
    "Vous êtes déjà visible là où se prennent les décisions : dans les premiers résultats.",
  ],
  FORCE_PHOTOS: [
    "Votre galerie est mieux fournie que celle de vos concurrents directs.",
    "Vous montrez davantage votre activité en images que la plupart des fiches de votre zone.",
  ],
  FORCE_SCORE: [
    "Votre fiche obtient une performance globale excellente.",
    "Sur l'ensemble des critères, votre fiche fait partie des mieux tenues de votre zone.",
  ],
  FORCE_SCORE_NEUTRAL: [
    "Votre fiche présente déjà une base exploitable pour progresser.",
    "Votre fiche dispose d'une base utile sur laquelle construire la suite.",
  ],
  FORCE_RESPONSE: [
    "Vous répondez à la grande majorité de vos avis : une relation client visible et rassurante.",
  ],
  WEAK_RATING: [
    "Votre note ({rating}/5) reste en retrait par rapport aux fiches concurrentes de votre zone.",
    "Sur le premier critère que compare un client, votre note vous dessert aujourd'hui.",
  ],
  WEAK_RATING_ABSOLUTE: [
    "Votre note ({rating}/5) peut freiner la confiance au moment du choix.",
    "Une note sous 4/5 demande une attention particulière pour rassurer les futurs clients.",
  ],
  WEAK_REVIEWS: [
    "Votre volume d'avis reste inférieur à celui de vos concurrents (médiane : {competitor_median_reviews}).",
    "Face à des fiches plus fournies, votre nombre d'avis peut faire hésiter un client au moment de choisir.",
  ],
  WEAK_POSITION: [
    "Votre fiche n'apparaît pas dans les trois premiers résultats, là où partent souvent les premiers contacts.",
    "Sur la recherche testée, des concurrents peuvent être vus avant votre fiche.",
  ],
  WEAK_RECENCY: [
    "Vos avis les plus récents datent : une fiche dont les avis s'arrêtent laisse un doute sur l'activité.",
  ],
  OPP_PHOTOS: [
    "Vos concurrents publient en moyenne {competitor_median_photos} photos, contre {photos} chez vous : une marge visible à combler.",
    "Ajouter des photos rapproche votre fiche de ce que montrent les fiches qui vous devancent.",
  ],
  OPP_PHOTOS_ABSOLUTE: [
    "Votre fiche gagnerait à montrer davantage de photos récentes et utiles pour rassurer les visiteurs.",
    "Ajouter des photos concrètes permettrait de mieux montrer votre activité avant le premier contact.",
  ],
  OPP_DESCRIPTION: [
    "Votre description est peu développée ({description_length} caractères sur 750) : l'espace qui explique pourquoi vous choisir est sous-exploité.",
    "Une description travaillée aiderait un client à comprendre votre offre avant même d'appeler.",
  ],
  OPP_CATEGORIES: [
    "Aucune catégorie secondaire n'est renseignée : vous passez à côté de recherches où vous pourriez apparaître.",
  ],
  OPP_REVIEWS_FLOW: [
    "Votre réputation est correcte mais peut être consolidée par un flux d'avis plus régulier.",
  ],
  OPP_RESPONSE: [
    "Répondre plus systématiquement aux avis renforcerait la confiance des clients qui hésitent.",
  ],
};

const PLACEHOLDERS = {
  reviews: (input) => input.business?.reviews,
  rating: (input) => input.business?.rating,
  photos: (input) => input.business?.photos_count,
  competitor_median_reviews: (input) => input.benchmark?.competitor_median?.reviews,
  competitor_median_photos: (input) => input.benchmark?.competitor_median?.photos,
  top_competitor_name: (input) => input.benchmark?.top_competitor?.name,
  position: (input) => input.business?.position,
  gap_photos: (input) => input.benchmark?.gaps?.photos,
  description_length: (input) => input.business?.description_length,
};

export function stableHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function renderKnowledgeMessage(input, messageGroup) {
  const formulations = KNOWLEDGE_MESSAGES[messageGroup] || KNOWLEDGE_MESSAGES.FORCE_SCORE_NEUTRAL;
  const seed = `${input?.analysisId || ""}${messageGroup}`;
  const template = formulations[stableHash(seed) % formulations.length];

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const resolver = PLACEHOLDERS[key];
    const value = resolver ? resolver(input) : "";
    if (value === null || value === undefined || Number.isNaN(value)) return "";
    return String(value);
  });
}
