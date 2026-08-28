const SHORT_MAPS_HOST = "maps.app.goo.gl";
const CANONICAL_MAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.be",
  "www.google.be",
  "maps.google.be",
  "google.fr",
  "www.google.fr",
  "maps.google.fr",
  "google.nl",
  "www.google.nl",
  "maps.google.nl",
  "google.de",
  "www.google.de",
  "maps.google.de",
  "google.co.uk",
  "www.google.co.uk",
  "maps.google.co.uk",
]);

export const GOOGLE_MAPS_RESOLUTION = Object.freeze({
  INVALID_URL: "GOOGLE_MAPS_URL_INVALID",
  FORBIDDEN_REDIRECT: "GOOGLE_MAPS_REDIRECT_FORBIDDEN",
  TOO_MANY_REDIRECTS: "GOOGLE_MAPS_TOO_MANY_REDIRECTS",
  TIMEOUT: "GOOGLE_MAPS_RESOLUTION_TIMEOUT",
  FAILED: "GOOGLE_MAPS_RESOLUTION_FAILED",
});

function parseHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      ? url
      : null;
  } catch {
    return null;
  }
}

export function isCanonicalGoogleMapsUrl(value) {
  const url = value instanceof URL ? value : parseHttpsUrl(value);
  if (!url || !CANONICAL_MAPS_HOSTS.has(url.hostname.toLowerCase())) return false;
  const pathname = url.pathname.toLowerCase();
  return pathname === "/maps"
    || pathname.startsWith("/maps/")
    || (url.hostname.toLowerCase().startsWith("maps.") && (url.searchParams.has("q") || url.searchParams.has("cid")));
}

export function isShortGoogleMapsUrl(value) {
  const url = value instanceof URL ? value : parseHttpsUrl(value);
  return Boolean(url && url.hostname.toLowerCase() === SHORT_MAPS_HOST && url.pathname !== "/");
}

export function hasGoogleMapsHost(value) {
  try {
    const host = new URL(String(value || "").trim()).hostname.toLowerCase();
    return host === SHORT_MAPS_HOST || CANONICAL_MAPS_HOSTS.has(host);
  } catch {
    return false;
  }
}

function resultError(error) {
  return { ok: false, error };
}

export async function resolveGoogleMapsUrl(value, {
  fetchImpl = globalThis.fetch,
  maxRedirects = 5,
  timeoutMs = 5000,
} = {}) {
  let current = parseHttpsUrl(value);
  if (!current || (!isShortGoogleMapsUrl(current) && !isCanonicalGoogleMapsUrl(current))) {
    return resultError(GOOGLE_MAPS_RESOLUTION.INVALID_URL);
  }
  if (isCanonicalGoogleMapsUrl(current)) {
    return { ok: true, url: current.toString(), resolved: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const visited = new Set();
  try {
    for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount += 1) {
      const currentKey = current.toString();
      if (visited.has(currentKey)) return resultError(GOOGLE_MAPS_RESOLUTION.TOO_MANY_REDIRECTS);
      visited.add(currentKey);

      const response = await fetchImpl(currentKey, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html" },
      });
      if (response.status < 300 || response.status >= 400) {
        return isCanonicalGoogleMapsUrl(current)
          ? { ok: true, url: current.toString(), resolved: true }
          : resultError(GOOGLE_MAPS_RESOLUTION.FAILED);
      }

      const location = response.headers.get("Location");
      if (!location) return resultError(GOOGLE_MAPS_RESOLUTION.FAILED);
      const next = parseHttpsUrl(new URL(location, current).toString());
      if (!next || (!isShortGoogleMapsUrl(next) && !isCanonicalGoogleMapsUrl(next))) {
        return resultError(GOOGLE_MAPS_RESOLUTION.FORBIDDEN_REDIRECT);
      }
      if (isCanonicalGoogleMapsUrl(next)) {
        return { ok: true, url: next.toString(), resolved: true };
      }
      current = next;
    }
    return resultError(GOOGLE_MAPS_RESOLUTION.TOO_MANY_REDIRECTS);
  } catch (error) {
    return resultError(error?.name === "AbortError"
      ? GOOGLE_MAPS_RESOLUTION.TIMEOUT
      : GOOGLE_MAPS_RESOLUTION.FAILED);
  } finally {
    clearTimeout(timeout);
  }
}


// Extraction de coordonnées depuis un location_link Google Maps déjà connu
// (jamais un lien fourni par le client — uniquement des location_link déjà
// capturés côté serveur lors de l'identification de la fiche ou du panel
// concurrentiel). Plusieurs formats coexistent dans les URL Google Maps
// réelles ; on couvre ceux effectivement observés :
//  - "!3d{lat}!4d{lng}" : coordonnées précises de l'épingle du lieu (data=...).
//  - "@{lat},{lng},{zoom}" : centre de la carte au moment de la génération du
//    lien — moins précis que !3d/!4d (peut refléter un déplacement manuel de
//    la carte), donc utilisé seulement si le format !3d/!4d est absent.
//  - "?q={lat},{lng}" ou "&ll={lat},{lng}" : ancien format de lien de recherche.
// Aucune coordonnée n'est jamais inventée : si aucun format connu ne matche,
// la fonction renvoie null plutôt que d'extrapoler une valeur approximative.
function isPlausibleLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isPlausibleLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

const COORD_PAIR = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

export function extractCoordinatesFromLocationLink(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const bang3d4d = text.match(new RegExp(`!3d${COORD_PAIR}!4d${COORD_PAIR}`));
  if (bang3d4d) {
    const lat = Number(bang3d4d[1]);
    const lng = Number(bang3d4d[2]);
    if (isPlausibleLatitude(lat) && isPlausibleLongitude(lng)) {
      return { lat, lng, source: "location_link_pin" };
    }
  }

  const atCenter = text.match(new RegExp(`@${COORD_PAIR},${COORD_PAIR},`));
  if (atCenter) {
    const lat = Number(atCenter[1]);
    const lng = Number(atCenter[2]);
    if (isPlausibleLatitude(lat) && isPlausibleLongitude(lng)) {
      return { lat, lng, source: "location_link_map_center" };
    }
  }

  try {
    const url = new URL(text);
    const queryCoords = url.searchParams.get("q") || url.searchParams.get("ll");
    if (queryCoords && new RegExp(`^${COORD_PAIR},${COORD_PAIR}$`).test(queryCoords.trim())) {
      const [latText, lngText] = queryCoords.trim().split(",");
      const lat = Number(latText);
      const lng = Number(lngText);
      if (isPlausibleLatitude(lat) && isPlausibleLongitude(lng)) {
        return { lat, lng, source: "location_link_query_param" };
      }
    }
  } catch {
    // URL invalide : aucune coordonnée exploitable, on ne tente rien d'autre.
  }

  return null;
}

export const __test__ = { SHORT_MAPS_HOST, CANONICAL_MAPS_HOSTS, isPlausibleLatitude, isPlausibleLongitude };
