// Résolution du "point neutre" de mesure du classement local — mission
// "corriger la méthode d'ancrage géographique de la recherche
// concurrentielle" (suite de la mission "ancrage géographique automatique",
// voir geographicAnchor.js).
//
// Cause exacte du bug observé sur Computelec (position automatique 3e alors
// qu'une recherche manuelle affiche 7e) : l'ancrage précédent utilisait les
// coordonnées EXACTES de l'entreprise analysée comme point de mesure du
// classement Outscraper/Google. Correctif : le point de mesure est
// désormais TOUJOURS le centre géocodé de la LOCALITÉ (ville/code postal/
// pays déjà capturés côté serveur) — jamais une adresse précise, jamais un
// nom d'entreprise, et jamais un repli silencieux si ce geocoding échoue ou
// renvoie un résultat qui ne correspond pas à la localité demandée.
//
// Revue (2026-08-29) — deux corrections critiques :
//  1. Endpoint réel vérifié (docs.outscraper.com / outscraper.com/geocoding-api) :
//     GET https://api.outscraper.com/geocoding — hôte ET chemin différents
//     de ceux utilisés par erreur dans la version précédente
//     (api.app.outscraper.com/maps/geocoding, qui n'existe pas pour ce
//     service). Ne jamais supposer qu'un endpoint construit différemment
//     fonctionne : cette constante est la SEULE source de vérité.
//  2. Aucun repli "region seul" : si le geocoding échoue OU si sa réponse
//     ne valide pas strictement (ville/code postal/pays incohérents,
//     coordonnées absentes ou implausibles), la fonction renvoie
//     { ok:false } — jamais une coordonnée, jamais un simple paramètre
//     "region" transmis au fournisseur en remplacement. L'appelant
//     (geographicAnchor.js) bloque alors entièrement la recherche.
//
// Déterminisme (deux entreprises différentes de la même localité utilisent
// exactement le même point) : la requête de géocodage est construite
// UNIQUEMENT à partir de l'identité de la localité (code postal + ville +
// pays) — jamais du nom, de l'adresse précise ou de l'identifiant de
// l'entreprise analysée.

// Endpoint officiel Outscraper Geocoding — voir
// https://outscraper.com/geocoding-api/ (démo de réponse : query/name/
// full_address/borough/street/postal_code/country_code/city/state/
// plus_code/latitude/longitude/...). Host et chemin exacts, jamais déduits.
const OUTSCRAPER_GEOCODING_URL = "https://api.outscraper.com/geocoding";
const DEFAULT_TIMEOUT_MS = 15000;

export const LOCALITY_CENTER_ERROR = Object.freeze({
  MISSING_LOCALITY: "LOCALITY_CENTER_MISSING_LOCALITY",
  MISSING_API_KEY: "LOCALITY_CENTER_MISSING_API_KEY",
  REQUEST_FAILED: "LOCALITY_CENTER_REQUEST_FAILED",
  TIMEOUT: "LOCALITY_CENTER_TIMEOUT",
  INVALID_RESPONSE: "LOCALITY_CENTER_INVALID_RESPONSE",
  EMPTY_RESPONSE: "LOCALITY_CENTER_EMPTY_RESPONSE",
  NOT_FOUND: "LOCALITY_CENTER_NOT_FOUND",
  LOCALITY_MISMATCH: "LOCALITY_CENTER_MISMATCH",
});

function isPlausibleLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}
function isPlausibleLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function normalizePostal(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

// Requête déterministe et reproductible : uniquement postalCode + city +
// countryName — jamais une adresse, un nom d'entreprise ou un identifiant.
// Le même triplet (postalCode, city, countryName) produit toujours
// exactement la même chaîne, quelle que soit l'entreprise analysée.
export function buildLocalityGeocodingQuery({ postalCode, city, countryName } = {}) {
  return [postalCode, city, countryName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

// La réponse Outscraper Geocoding documentée est un objet plat unique par
// requête (voir démo officielle) ; on tolère aussi, par défense, le même
// enveloppement "data: [[...]]" que les autres endpoints Outscraper déjà
// intégrés (search-v3) si le fournisseur l'utilisait malgré tout.
function firstResult(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.latitude !== undefined || payload.city !== undefined) return payload;
  const data = payload.data;
  if (!Array.isArray(data) || !data.length) return null;
  const firstQuery = data[0];
  if (Array.isArray(firstQuery)) {
    return firstQuery.find((item) => item && typeof item === "object") || null;
  }
  return firstQuery && typeof firstQuery === "object" ? firstQuery : null;
}

function extractLatLng(result) {
  if (!result || typeof result !== "object") return null;
  const candidates = [
    [result.latitude, result.longitude],
    [result.lat, result.lng],
    [result.geometry?.location?.lat, result.geometry?.location?.lng],
  ];
  for (const [rawLat, rawLng] of candidates) {
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (isPlausibleLatitude(lat) && isPlausibleLongitude(lng)) return { lat, lng };
  }
  return null;
}

// Validation stricte (mission "corriger la méthode d'ancrage géographique",
// point 2) — le résultat du geocoder doit provenir SANS AMBIGUÏTÉ de la
// localité demandée, jamais d'une entreprise ou d'une localité homonyme :
//  - country_code de la réponse identique au pays attendu (obligatoire —
//    aucune réponse sans country_code, ou avec un country_code différent,
//    n'est jamais acceptée : c'est précisément ce qui distingue Neufchâteau
//    Belgique de Neufchâteau France) ;
//  - city de la réponse compatible avec la ville attendue (obligatoire —
//    absente ou différente -> rejet, jamais une coïncidence supposée) ;
//  - postal_code de la réponse compatible avec le code postal attendu
//    LORSQUE les deux sont disponibles (réponse ET requête) — un
//    fournisseur ne renvoyant jamais ce champ ne doit pas bloquer
//    indéfiniment une localité par ailleurs confirmée par ville+pays, mais
//    un code postal renvoyé ET différent de celui attendu est un rejet net.
function validateLocalityMatch(result, expected) {
  const responseCountry = String(result?.country_code || "").trim().toUpperCase();
  const expectedCountry = String(expected?.countryCode || "").trim().toUpperCase();
  if (!responseCountry || !expectedCountry || responseCountry !== expectedCountry) {
    return { ok: false, reason: "country_code" };
  }

  const responseCity = normalizeKey(result?.city);
  const expectedCity = normalizeKey(expected?.city);
  if (!responseCity || !expectedCity) return { ok: false, reason: "city_missing" };
  const cityMatches = responseCity === expectedCity
    || responseCity.includes(expectedCity)
    || expectedCity.includes(responseCity);
  if (!cityMatches) return { ok: false, reason: "city_mismatch" };

  const responsePostal = normalizePostal(result?.postal_code);
  const expectedPostal = normalizePostal(expected?.postalCode);
  if (responsePostal && expectedPostal && responsePostal !== expectedPostal) {
    return { ok: false, reason: "postal_code_mismatch" };
  }

  return { ok: true };
}

/**
 * Résout le point neutre (centre géographique) d'une localité déjà
 * identifiée côté serveur (postalCode/city/countryName/countryCode) — ne
 * reçoit et n'utilise JAMAIS de coordonnées, d'adresse précise ou
 * d'identifiant propres à une entreprise. Renvoie { ok:false, code } plutôt
 * que d'inventer une position quand la localité ne peut pas être géocodée
 * avec certitude, ou quand la réponse du fournisseur ne correspond pas
 * strictement à la localité demandée — jamais un repli silencieux vers
 * autre chose (ni les coordonnées de l'entreprise, ni un simple "region").
 */
export async function resolveLocalityCenter({
  postalCode, city, countryName, countryCode, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const cityTrim = String(city || "").trim();
  const regionTrim = String(countryCode || "").trim().toUpperCase();
  const query = buildLocalityGeocodingQuery({ postalCode, city, countryName });
  if (!query || !cityTrim || !/^[A-Z]{2}$/.test(regionTrim)) {
    return { ok: false, code: LOCALITY_CENTER_ERROR.MISSING_LOCALITY };
  }

  const key = String(apiKey || "").trim();
  if (!key) {
    console.error("resolveLocalityCenter: OUTSCRAPER_API_KEY manquant dans l'environnement.");
    return { ok: false, code: LOCALITY_CENTER_ERROR.MISSING_API_KEY };
  }

  const url = new URL(OUTSCRAPER_GEOCODING_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("region", regionTrim);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  let bodyText;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-API-KEY": key, "Accept": "application/json" },
      signal: controller.signal,
    });
    bodyText = await res.text();
  } catch (err) {
    if (err?.name === "AbortError") {
      console.error("resolveLocalityCenter: délai dépassé");
      return { ok: false, code: LOCALITY_CENTER_ERROR.TIMEOUT };
    }
    console.error("resolveLocalityCenter: appel amont échoué", err && err.name);
    return { ok: false, code: LOCALITY_CENTER_ERROR.REQUEST_FAILED };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error("resolveLocalityCenter: réponse amont non OK", res.status);
    return { ok: false, code: LOCALITY_CENTER_ERROR.REQUEST_FAILED };
  }

  if (!bodyText || !bodyText.trim()) {
    console.error("resolveLocalityCenter: réponse amont vide");
    return { ok: false, code: LOCALITY_CENTER_ERROR.EMPTY_RESPONSE };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("resolveLocalityCenter: réponse amont non JSON");
    return { ok: false, code: LOCALITY_CENTER_ERROR.INVALID_RESPONSE };
  }

  const result = firstResult(payload);
  if (!result) {
    return { ok: false, code: LOCALITY_CENTER_ERROR.EMPTY_RESPONSE };
  }

  const point = extractLatLng(result);
  if (!point) {
    return { ok: false, code: LOCALITY_CENTER_ERROR.NOT_FOUND };
  }

  const validation = validateLocalityMatch(result, { city, postalCode, countryCode });
  if (!validation.ok) {
    console.error("resolveLocalityCenter: réponse incohérente avec la localité attendue", validation.reason);
    return { ok: false, code: LOCALITY_CENTER_ERROR.LOCALITY_MISMATCH };
  }

  return {
    ok: true,
    lat: point.lat,
    lng: point.lng,
    query,
    source: "outscraper_geocoding",
  };
}

export const __test__ = { buildLocalityGeocodingQuery, extractLatLng, firstResult, validateLocalityMatch };
