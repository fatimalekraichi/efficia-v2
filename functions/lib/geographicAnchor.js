// Résolution de l'ancrage géographique automatique (mission "ancrage
// géographique automatique de la recherche concurrentielle du diagnostic
// gratuit"). Objectif : permettre à l'administrateur de saisir une requête
// simple ("Électricien Neufchâteau") sans jamais ajouter manuellement le
// code postal ou le pays — le backend construit l'ancrage à partir des
// données déjà vérifiées côté serveur, selon un ordre de priorité strict.
//
// Ordre de priorité (jamais modifié, jamais contourné) :
//  1. coordonnées extraites du location_link Google Maps déjà connu ;
//  2. coordonnées structurées déjà renvoyées lors de l'identification
//     initiale de la fiche (latitude/longitude Outscraper bruts) ;
//  3. pays déjà connu (postal_code/adresse/pays serveur) — utilisé comme
//     paramètre "region" Outscraper (aucune coordonnée n'est déduite d'une
//     adresse : ce serait inventer une localisation) ;
//  4. aucun ancrage fiable disponible -> avertissement, jamais une recherche
//     lancée silencieusement à l'aveugle.
//
// Les coordonnées/pays utilisés ici proviennent uniquement de champs déjà
// capturés et stockés côté serveur (normalized_json / fiche_json) — jamais
// d'une valeur transmise par le navigateur.

import { extractCoordinatesFromLocationLink } from "./googleMapsUrl.js";

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

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveRegionCode(record) {
  const explicit = String(record?.country_code || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;
  const byName = COUNTRY_NAME_TO_CODE[normalizeKey(record?.country)];
  return byName || null;
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

function isValidCoordinatePair(lat, lng) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/**
 * Résout l'ancrage géographique à utiliser pour la recherche concurrentielle,
 * à partir des seules données déjà vérifiées côté serveur (normalized/fiche).
 * Ne lève jamais d'exception ; renvoie { ok:false } quand aucun ancrage
 * fiable n'est disponible plutôt que d'inventer une localisation.
 */
export function resolveGeographicAnchor({ normalized = {}, fiche = {} } = {}) {
  const region = resolveRegionCode(normalized) || resolveRegionCode(fiche) || null;
  const postalCode = firstNonEmpty(normalized?.postal_code, fiche?.postal_code);
  const city = firstNonEmpty(normalized?.city, fiche?.city, normalized?.borough, fiche?.borough);
  const countryName = firstNonEmpty(normalized?.country, fiche?.country);
  const label = buildLabel({ postalCode, city, countryName, countryCode: region });

  // Priorité 1 : coordonnées présentes dans le location_link Google Maps.
  const locationLink = firstNonEmpty(normalized?.location_link, fiche?.location_link);
  const fromLink = locationLink ? extractCoordinatesFromLocationLink(locationLink) : null;
  if (fromLink && isValidCoordinatePair(fromLink.lat, fromLink.lng)) {
    return {
      ok: true,
      tier: 1,
      source: fromLink.source,
      coordinates: `${fromLink.lat},${fromLink.lng}`,
      region,
      label,
    };
  }

  // Priorité 2 : coordonnées structurées déjà renvoyées à l'identification
  // initiale. Comparaison stricte sur Number.isFinite (jamais une coercition
  // Number(null)/Number(undefined) qui vaudrait 0 — "Null Island" ne doit
  // jamais être traitée comme une coordonnée réelle).
  const rawLat = Number.isFinite(normalized?.latitude) ? normalized.latitude
    : (Number.isFinite(fiche?.latitude) ? fiche.latitude : null);
  const rawLng = Number.isFinite(normalized?.longitude) ? normalized.longitude
    : (Number.isFinite(fiche?.longitude) ? fiche.longitude : null);
  if (rawLat !== null && rawLng !== null && isValidCoordinatePair(rawLat, rawLng)) {
    return {
      ok: true,
      tier: 2,
      source: "initial_identification",
      coordinates: `${rawLat},${rawLng}`,
      region,
      label,
    };
  }

  // Priorité 3 : adresse / code postal / pays déjà disponibles côté serveur.
  // On n'a alors aucune coordonnée fiable : seul le paramètre "region"
  // (pays) est transmis à Outscraper, jamais une coordonnée déduite.
  if (region && (postalCode || city)) {
    return {
      ok: true,
      tier: 3,
      source: "server_address_data",
      coordinates: null,
      region,
      label,
    };
  }

  // Priorité 4 : aucun ancrage fiable — jamais d'invention.
  return { ok: false, tier: 0, source: "none", coordinates: null, region: null, label: null };
}

// Instantané persistable (normalized_json.geographic_anchor) construit à
// partir d'un ancrage résolu — utilisé identiquement par la collecte
// initiale ET par la relance de recherche (source commune, jamais deux
// implémentations divergentes). N'est jamais construit pour un ancrage non
// résolu : l'absence de la clé signifie sans ambiguïté "aucun ancrage
// n'a été utilisé pour la dernière recherche effectuée".
export function buildGeographicAnchorRecord(anchor, resolvedAt) {
  if (!anchor?.ok) return null;
  return {
    tier: anchor.tier,
    source: anchor.source,
    region: anchor.region,
    label: anchor.label,
    coordinates: anchor.coordinates,
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
// resolveGeographicAnchor (voir plus haut), ici pour les résultats
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
// (free-diagnostic-collect/[analysisId].js, opération confirm_finalization).
// Ne modifie jamais rien ; se contente d'évaluer l'état à partir des
// données déjà persistées + de l'état live recalculé.
//   - GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS : des résultats
//     concurrentiels existent déjà mais aucun ancrage n'a jamais été
//     mémorisé pour eux (fiche antérieure à cette mission, ou recherche
//     initiale effectuée sans ancrage résolu) — jamais présenté comme "à
//     jour".
//   - GEOGRAPHIC_ANCHOR_STALE : un ancrage a été mémorisé, mais l'état
//     actuel de la fiche ne correspond plus à celui qui a produit les
//     résultats actuellement affichés (region/coordinates/tier divergents).
//   - SEARCH_QUERY_STALE : la requête actuellement affichée à
//     l'administrateur diffère de la dernière requête réellement analysée
//     (fourni uniquement quand `displayedSearchQuery` est renseigné — ce
//     signal n'existe que côté client, jamais reconstitué côté serveur).
export function evaluateGeographicAnchorReadiness({
  normalized = {}, fiche = {}, business = {}, benchmarkAverages = {}, displayedSearchQuery,
} = {}) {
  const persistedRaw = normalized?.geographic_anchor || null;
  const persisted = persistedRaw && firstNonEmpty(persistedRaw.label)
    ? {
      tier: Number.isFinite(Number(persistedRaw.tier)) ? Number(persistedRaw.tier) : null,
      source: firstNonEmpty(persistedRaw.source) || null,
      region: firstNonEmpty(persistedRaw.region) || null,
      label: firstNonEmpty(persistedRaw.label) || null,
      coordinates: firstNonEmpty(persistedRaw.coordinates) || null,
    }
    : null;
  const resultsExist = hasExistingCompetitiveResults(business, benchmarkAverages);
  const live = resolveGeographicAnchor({ normalized, fiche });
  const liveDisplay = live.ok ? { tier: live.tier, source: live.source, region: live.region, label: live.label } : null;

  if (resultsExist && !persisted) {
    return { ok: false, code: "GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS", persisted, live: liveDisplay };
  }

  if (persisted) {
    const drifted = (persisted.region || null) !== (live.ok ? live.region : null)
      || (persisted.coordinates || null) !== (live.ok ? live.coordinates : null)
      || persisted.tier !== (live.ok ? live.tier : 0);
    if (drifted) {
      return { ok: false, code: "GEOGRAPHIC_ANCHOR_STALE", persisted, live: liveDisplay };
    }
  }

  if (displayedSearchQuery !== undefined) {
    if (normalizeQueryForComparison(displayedSearchQuery) !== normalizeQueryForComparison(business?.searchQuery)) {
      return { ok: false, code: "SEARCH_QUERY_STALE", persisted, live: liveDisplay };
    }
  }

  return { ok: true, code: null, persisted, live: liveDisplay };
}

export const __test__ = { resolveRegionCode, buildLabel, COUNTRY_NAME_TO_CODE };
