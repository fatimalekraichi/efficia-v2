// Résolution de l'ancrage géographique automatique de la recherche
// concurrentielle du diagnostic gratuit. Objectif : permettre à
// l'administratrice de saisir une requête simple ("Électricien
// Neufchâteau") sans jamais ajouter manuellement le code postal ou le pays
// — le backend construit l'ancrage à partir des données déjà vérifiées côté
// serveur.
//
// Correctif (cas réel Computelec, position automatique 3e alors qu'une
// recherche manuelle affiche 7e) : la version précédente de ce module
// mesurait le classement depuis les coordonnées EXACTES de l'entreprise
// analysée (épingle de son propre location_link, ou latitude/longitude
// captées à son identification) — un classement local Google dépendant
// fortement de la distance au point de recherche, cela favorisait
// mécaniquement l'entreprise analysée face à ses concurrents. Ce module ne
// dérive plus JAMAIS le point de mesure de l'entreprise analysée : il
// détermine d'abord l'identité de sa LOCALITÉ (ville/code postal/pays, une
// notion partagée par toute entreprise de cette localité), puis délègue à
// localityGeocoder.js la résolution du centre géographique neutre de cette
// localité — jamais une adresse ni des coordonnées propres à une fiche.
//
// Deux étapes bien séparées :
//  1. resolveGeographicAnchorLocality (SYNCHRONE, pure) — l'IDENTITÉ de la
//     localité (région/code postal/ville/libellé), déterminée uniquement à
//     partir de champs déjà capturés côté serveur (normalized_json /
//     fiche_json) — jamais une coordonnée, jamais une valeur transmise par
//     le navigateur. Utilisée aussi pour la détection de péremption
//     (evaluateGeographicAnchorReadiness), qui ne doit jamais dépendre d'un
//     appel réseau.
//  2. resolveGeographicAnchor (ASYNCHRONE) — à partir de cette identité,
//     résout le POINT neutre (coordonnées) via geocoding de la localité
//     (jamais de l'entreprise). AUCUN repli : si le geocoding échoue, est
//     indisponible, ou renvoie un résultat qui ne valide pas strictement
//     (voir localityGeocoder.js::validateLocalityMatch), l'ancrage entier
//     est refusé (ok:false) — jamais un repli vers un simple paramètre
//     "region" seul, et jamais vers les coordonnées de l'entreprise. Si
//     même l'identité de la localité est inconnue -> aucun ancrage fiable,
//     jamais une recherche lancée à l'aveugle.

import { resolveLocalityCenter } from "./localityGeocoder.js";

// Table de correspondance volontairement restreinte : uniquement les pays
// pour lesquels Outscraper documente déjà `country` en toutes lettres sans
// `country_code` associé. Le `country_code` (ISO, 2 lettres) fourni
// directement par Outscraper reste toujours prioritaire sur cette table —
// elle ne sert que de repli, jamais de source principale.
const COUNTRY_NAME_TO_CODE = {
  france: "FR",
  belgique: "BE",
  belgium: "BE",
  luxembourg: "LU",
  suisse: "CH",
  switzerland: "CH",
  "pays-bas": "NL",
  netherlands: "NL",
  allemagne: "DE",
  germany: "DE",
};

const COUNTRY_CODE_TO_NAME = Object.freeze({
  BE: "Belgique",
  FR: "France",
  LU: "Luxembourg",
  CH: "Suisse",
  NL: "Pays-Bas",
  DE: "Allemagne",
});

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function resolveRegionCode(record) {
  const explicit = String(record?.country_code || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;
  const byName = COUNTRY_NAME_TO_CODE[normalizeKey(record?.country)];
  return byName || null;
}

export function normalizeConfirmedSearchZone(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const city = firstNonEmpty(value.city).slice(0, 160);
  const postalCode = firstNonEmpty(value.postalCode, value.postal_code).slice(0, 32);
  const explicitCode = firstNonEmpty(value.countryCode, value.country_code).toUpperCase();
  const suppliedCountryName = firstNonEmpty(value.countryName, value.country).slice(0, 80);
  const codeFromName = COUNTRY_NAME_TO_CODE[normalizeKey(suppliedCountryName)] || null;
  const countryCode = /^[A-Z]{2}$/.test(explicitCode) ? explicitCode : codeFromName;
  if (!city || !countryCode || !COUNTRY_CODE_TO_NAME[countryCode]) return null;
  if (codeFromName && codeFromName !== countryCode) return null;
  const countryName = COUNTRY_CODE_TO_NAME[countryCode];
  return {
    city,
    postalCode,
    countryName,
    countryCode,
    source: value.source === "admin_confirmed_city"
      ? "admin_confirmed_city"
      : "admin_confirmed_search_zone",
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function buildLabel({ postalCode, city, countryName, countryCode }) {
  const locality = [postalCode, city].filter(Boolean).join(" ").trim();
  const country = countryName || countryCode || "";
  const label = [locality, country].filter(Boolean).join(", ");
  return label || null;
}

/**
 * Résout uniquement l'IDENTITÉ de la localité de l'entreprise analysée —
 * jamais une coordonnée, jamais l'adresse précise, jamais un appel réseau.
 * Base commune à la résolution complète de l'ancrage (ci-dessous) et à la
 * détection de péremption (evaluateGeographicAnchorReadiness), qui doit
 * rester synchrone.
 */
export function resolveGeographicAnchorLocality({ normalized = {}, fiche = {}, confirmedSearchZone = null } = {}) {
  const region = resolveRegionCode(normalized) || resolveRegionCode(fiche) || null;
  const postalCode = firstNonEmpty(normalized?.postal_code, fiche?.postal_code);
  const city = firstNonEmpty(normalized?.city, fiche?.city, normalized?.borough, fiche?.borough);
  const countryName = firstNonEmpty(normalized?.country, fiche?.country);
  const label = buildLabel({ postalCode, city, countryName, countryCode: region });

  // Une localité fiable exige au minimum une VILLE et un PAYS reconnu — un
  // code postal seul, ou une ville sans pays, ne permet ni de désambiguïser
  // les homonymes (Neufchâteau Belgique/France) ni de géocoder sans deviner.
  if (region && city) {
    return { ok: true, region, postalCode, city, countryName, label };
  }

  // Repli explicite uniquement : la zone de recherche confirmée est un
  // objet distinct de l'adresse et de la zone de service de la fiche. Elle
  // n'est acceptée qu'avec un pays non ambigu et n'est jamais construite à
  // partir du seul libellé de ville transmis par l'ancien formulaire.
  const confirmed = normalizeConfirmedSearchZone(
    confirmedSearchZone || normalized?.confirmed_search_zone,
  );
  if (confirmed) {
    return {
      ok: true,
      region: confirmed.countryCode,
      postalCode: confirmed.postalCode,
      city: confirmed.city,
      countryName: confirmed.countryName,
      label: buildLabel({
        postalCode: confirmed.postalCode,
        city: confirmed.city,
        countryName: confirmed.countryName,
        countryCode: confirmed.countryCode,
      }),
      localitySource: confirmed.source,
    };
  }

  return { ok: false, region: null, postalCode: "", city: "", countryName: "", label: null };
}

function isSameLocality(a, b) {
  if (!a?.ok || !b?.ok) return a?.ok === b?.ok;
  return a.region === b.region
    && normalizeKey(a.city) === normalizeKey(b.city)
    && String(a.postalCode || "").trim() === String(b.postalCode || "").trim();
}

// Codes exposés à l'appelant (free-diagnostic-collect/[analysisId].js) pour
// journalisation/diagnostic — n'affecte jamais le message affiché à
// l'administratrice (toujours le même message générique bloquant, voir
// geographicAnchorUnavailableFailure()) ni le comportement (toujours
// ok:false, jamais un repli).
export const GEOGRAPHIC_ANCHOR_ERROR = Object.freeze({
  LOCALITY_UNKNOWN: "GEOGRAPHIC_ANCHOR_LOCALITY_UNKNOWN",
  CENTER_UNAVAILABLE: "GEOGRAPHIC_ANCHOR_CENTER_UNAVAILABLE",
});

/**
 * Résout l'ancrage géographique complet à utiliser pour la recherche
 * concurrentielle : identité de la localité (voir
 * resolveGeographicAnchorLocality) PUIS point neutre (coordonnées) mesuré
 * au centre de cette localité — jamais aux coordonnées de l'entreprise
 * analysée. Ne lève jamais d'exception ; renvoie { ok:false } quand aucun
 * ancrage fiable n'est disponible plutôt que d'inventer une localisation.
 *
 * Correctif (revue 2026-08-29) — AUCUN repli "region seul" : si le
 * geocoding de la localité échoue, est indisponible, ou renvoie un résultat
 * qui ne valide pas strictement (ville/code postal/pays incohérents,
 * coordonnées absentes — voir localityGeocoder.js::validateLocalityMatch),
 * l'ancrage entier est refusé (ok:false). L'appelant ne doit alors JAMAIS
 * lancer collectCompetitors, ni écrire une position/des concurrents/des
 * moyennes, ni marquer l'analyse comme actualisée ; la finalisation reste
 * bloquée tant qu'aucun ancrage fiable n'a été obtenu.
 */
export async function resolveGeographicAnchor({
  normalized = {}, fiche = {}, confirmedSearchZone = null, apiKey, timeoutMs,
} = {}) {
  const locality = resolveGeographicAnchorLocality({ normalized, fiche, confirmedSearchZone });
  if (!locality.ok) {
    return {
      ok: false, code: GEOGRAPHIC_ANCHOR_ERROR.LOCALITY_UNKNOWN,
      tier: 0, source: "none", coordinates: null, region: null, label: null, locality: null,
    };
  }

  // Seule source du point de mesure : le centre géocodé de la localité —
  // jamais une coordonnée propre à l'entreprise analysée, jamais un simple
  // paramètre "region" en repli (voir localityGeocoder.js).
  const center = await resolveLocalityCenter({
    postalCode: locality.postalCode,
    city: locality.city,
    countryName: locality.countryName,
    countryCode: locality.region,
    apiKey,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  if (!center.ok) {
    return {
      ok: false, code: GEOGRAPHIC_ANCHOR_ERROR.CENTER_UNAVAILABLE, centerErrorCode: center.code,
      tier: 0, source: "none", coordinates: null, region: locality.region, label: locality.label, locality: null,
    };
  }

  return {
    ok: true,
    tier: 1,
    source: center.source,
    ...(locality.localitySource ? { localitySource: locality.localitySource } : {}),
    coordinates: `${center.lat},${center.lng}`,
    region: locality.region,
    label: locality.label,
    locality: { city: locality.city, postalCode: locality.postalCode, country: locality.countryName, countryCode: locality.region },
  };
}

// Instantané persistable (normalized_json.geographic_anchor) construit à
// partir d'un ancrage résolu — utilisé identiquement par la collecte
// initiale ET par la relance de recherche (source commune, jamais deux
// implémentations divergentes). N'est jamais construit pour un ancrage non
// résolu : l'absence de la clé signifie sans ambiguïté "aucun ancrage
// n'a été utilisé pour la dernière recherche effectuée". Persiste, comme
// exigé, la localité utilisée, le pays, le point géographique neutre, la
// source de ce point et l'horodatage de la recherche — jamais la requête
// visible elle-même (déjà persistée séparément, voir business.searchQuery).
export function buildGeographicAnchorRecord(anchor, resolvedAt) {
  if (!anchor?.ok) return null;
  return {
    tier: anchor.tier,
    source: anchor.source,
    ...(anchor.localitySource ? { localitySource: anchor.localitySource } : {}),
    region: anchor.region,
    label: anchor.label,
    coordinates: anchor.coordinates,
    locality: anchor.locality || null,
    resolvedAt,
  };
}

// Une recherche concurrentielle a-t-elle déjà produit des résultats pour
// cette analyse ? (requête testée, position, concurrents, moyennes) — sert
// à distinguer "aucune collecte encore effectuée" (comportement normal,
// jamais périmé) de "des résultats existent mais sans ancrage mémorisé"
// (état périmé, doit être signalé et bloquer la génération).
// Number(null) vaut 0 (donc "fini") : un champ explicitement NULL en base
// (jamais analysé) ne doit jamais être confondu avec une position/moyenne
// réelle de 0 — même bug de coercition que celui déjà corrigé dans
// resolveGeographicAnchorLocality (voir plus haut), ici pour les résultats
// concurrentiels plutôt que pour les coordonnées.
function isFiniteNumericValue(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

export function hasExistingCompetitiveResults(business = {}, benchmarkAverages = {}) {
  const hasQuery = Boolean(String(business?.searchQuery || "").trim());
  const hasPosition = isFiniteNumericValue(business?.localPosition);
  const hasCompetitors = Array.isArray(business?.competitors) && business.competitors.length > 0;
  const hasAverages = [benchmarkAverages?.rating, benchmarkAverages?.reviews, benchmarkAverages?.photos]
    .some((value) => isFiniteNumericValue(value));
  return hasQuery || hasPosition || hasCompetitors || hasAverages;
}

function normalizeQueryForComparison(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

// Évaluation unique de l'état de l'ancrage géographique — utilisée à la
// fois pour l'affichage (freeDiagnosticProductionLink.js) et pour le
// blocage serveur de la finalisation/génération PDF
// (free-diagnostic-collect/[analysisId].js, audit-review/[analysisId].js,
// audit-snapshots/[analysisId].js). Reste volontairement SYNCHRONE (compare
// l'IDENTITÉ de la localité, jamais le point géocodé — voir
// resolveGeographicAnchorLocality) : ne modifie jamais rien, ne lance jamais
// d'appel réseau ; se contente d'évaluer l'état à partir des données déjà
// persistées + de l'identité de localité live recalculée. Une variation
// mineure du point géocodé d'un appel à l'autre pour une même localité
// (non garanti par un fournisseur externe) ne doit jamais être interprétée
// comme une péremption : seule une localité réellement différente l'est.
//   - GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS : des résultats
//     concurrentiels existent déjà mais aucun ancrage n'a jamais été
//     mémorisé pour eux (fiche antérieure à cette mission, ou recherche
//     initiale effectuée sans ancrage résolu) — jamais présenté comme "à
//     jour".
//   - GEOGRAPHIC_ANCHOR_STALE : un ancrage a été mémorisé, mais la localité
//     actuelle de la fiche ne correspond plus à celle qui a produit les
//     résultats actuellement affichés (région/ville/code postal divergents).
//   - SEARCH_QUERY_STALE : la requête actuellement affichée à
//     l'administrateur diffère de la dernière requête réellement analysée
//     (fourni uniquement quand `displayedSearchQuery` est renseigné — ce
//     signal n'existe que côté client, jamais reconstitué côté serveur).
export function evaluateGeographicAnchorReadiness({
  normalized = {}, fiche = {}, business = {}, benchmarkAverages = {}, displayedSearchQuery,
  displayedSearchZone,
} = {}) {
  const persistedRaw = normalized?.geographic_anchor || null;
  const persisted = persistedRaw && firstNonEmpty(persistedRaw.label)
    ? {
      tier: Number.isFinite(Number(persistedRaw.tier)) ? Number(persistedRaw.tier) : null,
      source: firstNonEmpty(persistedRaw.source) || null,
      region: firstNonEmpty(persistedRaw.region) || null,
      label: firstNonEmpty(persistedRaw.label) || null,
      coordinates: firstNonEmpty(persistedRaw.coordinates) || null,
      localitySource: firstNonEmpty(persistedRaw.localitySource) || null,
      locality: persistedRaw.locality && typeof persistedRaw.locality === "object" ? persistedRaw.locality : null,
    }
    : null;
  const resultsExist = hasExistingCompetitiveResults(business, benchmarkAverages);
  const live = resolveGeographicAnchorLocality({ normalized, fiche });
  const liveDisplay = live.ok
    ? {
      region: live.region,
      label: live.label,
      localitySource: live.localitySource || null,
      locality: {
        city: live.city,
        postalCode: live.postalCode,
        country: live.countryName,
        countryCode: live.region,
      },
    }
    : null;

  if (resultsExist && !persisted) {
    return { ok: false, code: "GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS", persisted, live: liveDisplay };
  }

  if (persisted) {
    const persistedLocality = {
      ok: true,
      region: persisted.region,
      city: persisted.locality?.city || "",
      postalCode: persisted.locality?.postalCode || "",
    };
    const drifted = !isSameLocality(persistedLocality, live.ok ? { ok: true, region: live.region, city: live.city, postalCode: live.postalCode } : { ok: false });
    if (drifted) {
      return { ok: false, code: "GEOGRAPHIC_ANCHOR_STALE", persisted, live: liveDisplay };
    }
  }

  if (displayedSearchQuery !== undefined) {
    if (normalizeQueryForComparison(displayedSearchQuery) !== normalizeQueryForComparison(business?.searchQuery)) {
      return { ok: false, code: "SEARCH_QUERY_STALE", persisted, live: liveDisplay };
    }
  }

  if (displayedSearchZone !== undefined) {
    const displayed = normalizeConfirmedSearchZone(displayedSearchZone);
    const analyzedCity = persisted?.locality?.city || "";
    if (!displayed
      || !persisted
      || displayed.countryCode !== persisted.region
      || normalizeKey(displayed.city) !== normalizeKey(analyzedCity)) {
      return { ok: false, code: "SEARCH_ZONE_STALE", persisted, live: liveDisplay };
    }
  }

  return { ok: true, code: null, persisted, live: liveDisplay };
}

export const __test__ = {
  resolveRegionCode, buildLabel, COUNTRY_NAME_TO_CODE, COUNTRY_CODE_TO_NAME, isSameLocality,
};
