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
// Revue (2026-08-29, cas réel Computelec 604d91ab — blocage en Preview) :
// contrairement à l'hypothèse initiale, `firstResult()` traitait déjà
// correctement le format plat officiel `data: [{...}]` documenté par
// https://docs.outscraper.com/endpoints/geocoding/ (un objet, jamais un
// tableau imbriqué, en première position de `data`). La cause réelle du
// blocage était ailleurs : `validateLocalityMatch()` EXIGEAIT
// systématiquement un `country_code` dans la réponse, alors que ce champ
// N'EST PAS garanti par le contrat officiel (l'exemple de réponse documenté
// ne comporte que `country`, jamais `country_code`) — une réponse par
// ailleurs correcte (bonne ville, bon code postal, bon `country` en toutes
// lettres) était donc rejetée à tort, faute de `country_code`. Corrigé
// ci-dessous (validateLocalityMatch) par un repli explicite et normalisé sur
// le nom du pays, JAMAIS un succès par défaut si les deux sont absents, et
// JAMAIS un `country_code` incorrect rattrapé par un nom de pays correct.
// Une réponse HTTP 202 "Pending" (traitement asynchrone, `results_location`
// — voir contrat officiel) est également distinguée explicitement
// désormais (LOCALITY_CENTER_ERROR.PENDING) plutôt que noyée dans un échec
// générique "réponse vide" : voir le commentaire au point de lecture de la
// réponse ci-dessous pour la limitation assumée sur `results_location`.
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

// Codes techniques précis (mission "corriger le geocodeur de localité") —
// un code par cause distincte, jamais un code générique unique pour
// plusieurs causes différentes. Ne révèlent et ne dérivent jamais une clé
// API, un en-tête d'authentification, un secret Cloudflare, ni le corps brut
// complet d'une erreur fournisseur (voir les points de journalisation
// ci-dessous : uniquement un statut HTTP, un nom d'erreur JS, ou une raison
// de validation déjà connue côté serveur).
export const LOCALITY_CENTER_ERROR = Object.freeze({
  MISSING_LOCALITY: "GEOCODING_MISSING_LOCALITY",
  MISSING_API_KEY: "GEOCODING_MISSING_API_KEY",
  HTTP_ERROR: "GEOCODING_HTTP_ERROR",
  TIMEOUT: "GEOCODING_TIMEOUT",
  INVALID_RESPONSE: "GEOCODING_INVALID_RESPONSE",
  EMPTY_RESULT: "GEOCODING_EMPTY_RESULT",
  NOT_FOUND: "GEOCODING_NOT_FOUND",
  PENDING: "GEOCODING_PENDING",
  COUNTRY_MISMATCH: "GEOCODING_COUNTRY_MISMATCH",
  CITY_MISMATCH: "GEOCODING_CITY_MISMATCH",
  POSTAL_CODE_MISMATCH: "GEOCODING_POSTAL_CODE_MISMATCH",
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

// Normalisation du NOM de pays — casse, espaces et accents uniquement (pas
// de table de correspondance ici : la table pays->code vit dans
// geographicAnchor.js et sert à résoudre le country_code ATTENDU en amont ;
// ici on compare deux noms déjà en toutes lettres, celui attendu et celui
// renvoyé par le fournisseur).
function normalizeCountryName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
// révisée le 2026-08-29 suite au blocage réel Computelec 604d91ab) — le
// résultat du geocoder doit provenir SANS AMBIGUÏTÉ de la localité
// demandée, jamais d'une entreprise ou d'une localité homonyme :
//  - PAYS (obligatoire, jamais un succès par défaut si tout est absent) :
//    · si la réponse fournit un country_code, il DOIT correspondre
//      exactement au pays attendu — un country_code incorrect n'est JAMAIS
//      rattrapé par un nom de pays par ailleurs correct (c'est précisément
//      ce qui distingue Neufchâteau Belgique de Neufchâteau France) ;
//    · country_code N'EST PAS garanti par le contrat officiel Outscraper
//      (docs.outscraper.com/endpoints/geocoding/ — l'exemple de réponse
//      documenté ne comporte que `country` en toutes lettres). Quand il est
//      absent, on retombe explicitement sur `country` (nom), normalisé
//      uniquement en casse/espaces/accents — jamais une simple
//      inclusion/troncature ;
//    · si country_code ET country (nom) sont tous deux absents -> rejet ;
//  - city de la réponse compatible avec la ville attendue (obligatoire —
//    absente ou différente -> rejet, jamais une coïncidence supposée) ;
//  - postal_code de la réponse compatible avec le code postal attendu
//    LORSQUE les deux sont disponibles (réponse ET requête) — un
//    fournisseur ne renvoyant jamais ce champ ne doit pas bloquer
//    indéfiniment une localité par ailleurs confirmée par ville+pays, mais
//    un code postal renvoyé ET différent de celui attendu est un rejet net.
function validateLocalityMatch(result, expected) {
  const responseCountryCode = String(result?.country_code || "").trim().toUpperCase();
  const expectedCountryCode = String(expected?.countryCode || "").trim().toUpperCase();
  if (responseCountryCode) {
    if (!expectedCountryCode || responseCountryCode !== expectedCountryCode) {
      return { ok: false, reason: "country_code_mismatch" };
    }
  } else {
    const responseCountryName = normalizeCountryName(result?.country);
    const expectedCountryName = normalizeCountryName(expected?.countryName);
    if (!responseCountryName || !expectedCountryName || responseCountryName !== expectedCountryName) {
      return { ok: false, reason: "country_name_mismatch" };
    }
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

// Un seul point de correspondance raison -> code technique précis, pour
// éviter que deux causes distinctes (pays vs ville vs code postal) ne soient
// jamais confondues sous un unique code générique "incohérent".
const VALIDATION_REASON_TO_CODE = Object.freeze({
  country_code_mismatch: "COUNTRY_MISMATCH",
  country_name_mismatch: "COUNTRY_MISMATCH",
  city_missing: "CITY_MISMATCH",
  city_mismatch: "CITY_MISMATCH",
  postal_code_mismatch: "POSTAL_CODE_MISMATCH",
});

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
    // Jamais le message brut de l'erreur réseau (peut contenir l'URL avec la
    // clé API en clair côté certains runtimes) — uniquement son nom (ex.
    // "TypeError"), jamais son contenu.
    console.error("resolveLocalityCenter: appel amont échoué", err && err.name);
    return { ok: false, code: LOCALITY_CENTER_ERROR.HTTP_ERROR };
  } finally {
    clearTimeout(timeout);
  }

  // HTTP 202 Accepted — traitement asynchrone en cours côté fournisseur
  // (contrat officiel : `results_location` fourni pour interroger le
  // résultat plus tard). Distingué explicitement d'un échec générique.
  // Limitation assumée et documentée : ce module ne relance jamais un appel
  // de geocoding pour la même localité, et n'interroge jamais
  // `results_location` — implémenter un polling borné et sûr (nombre de
  // lectures limité, délai total borné, URL HTTPS revalidée sur l'hôte et le
  // chemin Outscraper autorisés explicitement, même authentification
  // serveur, aucune URL de tiers suivie aveuglément) dépasse le temps
  // d'exécution raisonnable d'une Cloudflare Pages Function et le périmètre
  // de cette correction. Tant que ce mode n'est pas implémenté, une réponse
  // Pending est un échec explicite et borné (jamais un succès deviné,
  // jamais une seconde tentative automatique).
  if (res.status === 202) {
    console.error("resolveLocalityCenter: réponse fournisseur en attente (202 Pending)");
    return { ok: false, code: LOCALITY_CENTER_ERROR.PENDING };
  }

  if (!res.ok) {
    console.error("resolveLocalityCenter: réponse amont non OK", res.status);
    return { ok: false, code: LOCALITY_CENTER_ERROR.HTTP_ERROR };
  }

  if (!bodyText || !bodyText.trim()) {
    console.error("resolveLocalityCenter: réponse amont vide");
    return { ok: false, code: LOCALITY_CENTER_ERROR.EMPTY_RESULT };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("resolveLocalityCenter: réponse amont non JSON");
    return { ok: false, code: LOCALITY_CENTER_ERROR.INVALID_RESPONSE };
  }

  // Défense supplémentaire : certains statuts "Pending" sont documentés côté
  // fournisseur avec un code HTTP 200 mais un champ `status` explicite dans
  // le corps — jamais interprété comme "aucun résultat" (EMPTY_RESULT),
  // toujours comme PENDING.
  if (typeof payload?.status === "string" && payload.status.trim().toLowerCase() === "pending") {
    console.error("resolveLocalityCenter: réponse fournisseur en attente (status Pending)");
    return { ok: false, code: LOCALITY_CENTER_ERROR.PENDING };
  }

  const result = firstResult(payload);
  if (!result) {
    return { ok: false, code: LOCALITY_CENTER_ERROR.EMPTY_RESULT };
  }

  const point = extractLatLng(result);
  if (!point) {
    return { ok: false, code: LOCALITY_CENTER_ERROR.NOT_FOUND };
  }

  const validation = validateLocalityMatch(result, { city, postalCode, countryCode: regionTrim, countryName });
  if (!validation.ok) {
    console.error("resolveLocalityCenter: réponse incohérente avec la localité attendue", validation.reason);
    const specificCode = VALIDATION_REASON_TO_CODE[validation.reason];
    return { ok: false, code: LOCALITY_CENTER_ERROR[specificCode] || LOCALITY_CENTER_ERROR.CITY_MISMATCH };
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
