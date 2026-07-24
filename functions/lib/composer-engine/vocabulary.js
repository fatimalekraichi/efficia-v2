export const VOCABULARY = {
  visibility: {
    noun: "visibilité locale",
    benefit: "être davantage visible au moment où les prospects recherchent une solution",
    verb: "devenir plus visible",
  },
  conversion: {
    noun: "conversion",
    benefit: "transformer davantage de consultations en contacts",
    verb: "convaincre plus rapidement",
  },
  trust: {
    noun: "confiance",
    benefit: "rassurer les prospects dès la première comparaison",
    verb: "inspirer confiance",
  },
  completeness: {
    noun: "complétude",
    benefit: "rendre la fiche plus claire et plus facile à comprendre",
    verb: "clarifier la fiche",
  },
  signals: {
    reviews: "réputation",
    rating: "note moyenne",
    position: "visibilité locale",
    description: "description",
    photos: "galerie photos",
    categories: "catégories",
    global: "performance globale",
  },
};

export function vocabularyForImpact(impactType) {
  return VOCABULARY[impactType] || VOCABULARY.completeness;
}

export function labelForSignal(signal) {
  return VOCABULARY.signals[signal] || signal;
}
