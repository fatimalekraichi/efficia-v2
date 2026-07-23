// Collecte concurrentielle locale Outscraper (Appel B).
// Reçoit { activite, ville, placeIdCible, apiKey }, renvoie :
//   succès -> { ok: true, requete, position, concurrents }
//   erreur -> { ok: false, code, error, status? }

const OUTSCRAPER_HOST = "https://api.app.outscraper.com";
const OUTSCRAPER_SEARCH_PATH = "/maps/search-v3";
const DEFAULT_TIMEOUT_MS = 25000;

function toNumberOrNull(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function firstPhotoUrl(place) {
  if (!place || typeof place !== "object") return "";
  if (typeof place.photo === "string" && place.photo) return place.photo;
  if (typeof place.photo_url === "string" && place.photo_url) return place.photo_url;
  if (typeof place.photo_url_big === "string" && place.photo_url_big) return place.photo_url_big;

  const collections = [place.photos_sample, place.photos, place.images].filter(Array.isArray);
  for (const collection of collections) {
    for (const item of collection) {
      if (typeof item === "string" && item) return item;
      if (item && typeof item === "object") {
        const src = item.photo_url || item.photo_url_big || item.url || item.src;
        if (typeof src === "string" && src) return src;
      }
    }
  }

  return "";
}

function mapCompetitor(place) {
  return {
    name: place.name || "",
    place_id: place.place_id || "",
    rating: toNumberOrNull(place.rating),
    reviews: toNumberOrNull(place.reviews),
    photos_count: toNumberOrNull(place.photos_count),
    photo: firstPhotoUrl(place),
  };
}

function extractPlaces(payload) {
  const data = payload && payload.data;
  if (!Array.isArray(data) || !data.length) return [];
  const firstQuery = data[0];
  if (Array.isArray(firstQuery)) return firstQuery.filter(item => item && typeof item === "object");
  return firstQuery && typeof firstQuery === "object" ? [firstQuery] : [];
}

export async function collectCompetitors({ activite, ville, placeIdCible, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const activiteTrim = (activite || "").trim();
  const villeTrim = (ville || "").trim();
  if (!activiteTrim || !villeTrim) {
    return { ok: false, code: 400, error: "Missing required parameters: activite, ville." };
  }

  const key = (apiKey || "").trim();
  if (!key) {
    console.error("collectCompetitors: OUTSCRAPER_API_KEY manquant dans l'environnement.");
    return { ok: false, code: 500, error: "Server configuration error." };
  }

  const requete = `${activiteTrim} ${villeTrim}`;
  const url = new URL(OUTSCRAPER_HOST + OUTSCRAPER_SEARCH_PATH);
  url.searchParams.set("query", requete);
  url.searchParams.set("organizationsPerQueryLimit", "10");
  url.searchParams.set("async", "false");
  url.searchParams.set("language", "fr");

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
    console.error("collectCompetitors: appel amont échoué", err && err.name);
    return { ok: false, code: 502, error: "Outscraper request failed." };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error("collectCompetitors: réponse amont non OK", res.status);
    return { ok: false, code: 502, error: "Outscraper returned an error.", status: res.status };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("collectCompetitors: réponse amont non JSON");
    return { ok: false, code: 502, error: "Invalid response from Outscraper." };
  }

  if (payload && typeof payload.status === "string" && payload.status.toLowerCase() === "pending") {
    console.error("collectCompetitors: réponse Pending (mode async non géré ici)");
    return { ok: false, code: 502, error: "Outscraper is processing asynchronously." };
  }

  const places = extractPlaces(payload);
  const targetPlaceId = (placeIdCible || "").trim();
  const targetIndex = targetPlaceId ? places.findIndex(place => place.place_id === targetPlaceId) : -1;
  const position = targetIndex >= 0 ? targetIndex + 1 : 0;
  const concurrents = places
    .filter(place => !targetPlaceId || place.place_id !== targetPlaceId)
    .slice(0, 3)
    .map(mapCompetitor);

  return { ok: true, requete, position, concurrents };
}
