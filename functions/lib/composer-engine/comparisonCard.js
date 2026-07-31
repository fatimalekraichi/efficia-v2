// Point 11 du plan (2026-07-31, Sprint 1 "Constats irréfutables") : bloc
// visuel VOUS / Meilleure fiche observée (note, avis, photos), affiché sur la
// page de couverture — la première chose lue, comme demandé. Aucune nouvelle
// donnée : uniquement business.{rating,reviews,photos_count} (déjà exposés
// par buildBusinessContext) et benchmark.top_competitor / competitor_median
// (déjà calculés par benchmarkEngine.js → analysisReader.js →
// buildBenchmarkContext, cf. auditComposition.js).
//
// Libellé "Meilleure fiche observée" (et non "Meilleur concurrent", révisé le
// 2026-07-31) : plus neutre, la fiche la plus forte du panel n'est pas
// toujours perçue par le client comme son concurrent principal.

function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// benchmarkEngine.js ne calcule aujourd'hui que top_competitor_name/rating/
// reviews (pas de photos par fiche individuelle en base). Option A du plan :
// pour la seule ligne "photos", on retombe sur la moyenne des concurrents,
// avec un libellé honnête ("Moyenne concurrents") plutôt que d'attribuer à
// tort ce chiffre à la meilleure fiche observée.
function bestPhotos(topCompetitor, competitorMedian) {
  const direct = n(topCompetitor?.photos);
  if (direct !== null) return { value: direct, label: "Meilleure fiche observée", isEstimate: false };

  const median = n(competitorMedian?.photos);
  if (median !== null) return { value: median, label: "Moyenne concurrents", isEstimate: true };

  return { value: null, label: "Meilleure fiche observée", isEstimate: false };
}

export function buildComparisonCard(bundle = {}) {
  const business = bundle.observation || bundle.context?.business || {};
  const benchmark = bundle.benchmark || bundle.context?.benchmark || {};
  const top = benchmark.top_competitor || null;

  // Sans fiche de référence nommée, aucune comparaison directe n'est
  // affichable (on ne fabrique jamais un nom ou une valeur).
  if (!top?.name) return null;

  const photos = bestPhotos(top, benchmark.competitor_median);

  return {
    you: {
      label: "Vous",
      rating: n(business.rating),
      reviews: n(business.reviews),
      photos: n(business.photos_count ?? business.photosCount),
    },
    best: {
      label: "Meilleure fiche observée",
      name: top.name,
      rating: n(top.rating),
      reviews: n(top.reviews),
      photos: photos.value,
      photosLabel: photos.label,
      photosIsEstimate: photos.isEstimate,
    },
  };
}
