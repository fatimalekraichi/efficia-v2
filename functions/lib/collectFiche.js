// Logique de collecte Outscraper (Appel A), partagée par /api/outscraper et /api/analyze.
// Ne dépend d'AUCUN objet Request/Response : reçoit { nom, ville, apiKey }, renvoie un
// résultat structuré :
//   succès -> { ok: true, fiche: {...} }
//   erreur -> { ok: false, code: <statut HTTP suggéré>, error: "...", status?: <statut amont> }

const OUTSCRAPER_HOST = "https://api.app.outscraper.com";
const OUTSCRAPER_SEARCH_PATH = "/maps/search-v3";
const DEFAULT_TIMEOUT_MS = 25000;

function toNumberOrNull(v) {
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

// Extraction + normalisation de la première fiche (mêmes champs que la sortie publique actuelle).
function mapPlace(place) {
  const photos_sample = Array.isArray(place.photos_sample)
    ? place.photos_sample
        .slice(0, 5)
        .map((p) => {
          const src = typeof p === "string" ? p : (p && (p.photo_url || p.photo_url_big)) || "";
          return src ? { photo_url: src } : null;
        })
        .filter(Boolean)
    : [];

  let subtypes = [];
  if (Array.isArray(place.subtypes)) subtypes = place.subtypes.filter((s) => typeof s === "string" && s.trim());
  else if (typeof place.subtypes === "string" && place.subtypes.trim()) {
    subtypes = place.subtypes.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return {
    name: place.name || "",
    place_id: place.place_id || "",
    rating: toNumberOrNull(place.rating),
    reviews: toNumberOrNull(place.reviews),
    photos_count: toNumberOrNull(place.photos_count),
    description: place.description || "",
    photos_sample,
    working_hours: place.working_hours ?? null,
    subtypes,
    location_link: place.location_link || "",
    // Champs Outscraper documentés (dictionnaire Google Maps) mais jusqu'ici jamais extraits :
    // category/type (catégorie), phone (téléphone), site/website (site web), address (adresse).
    category: place.category || "",
    type: place.type || "",
    phone: place.phone || "",
    site: place.site || place.website || "",
    address: place.address || place.full_address || "",
    // Localisation : city (ville) et borough/county (repli) — permettent de déduire automatiquement
    // la ville quand elle n'a pas été saisie manuellement. Jamais utilisés pour inventer une valeur :
    // si Outscraper ne les renvoie pas, ces champs restent vides.
    city: place.city || "",
    borough: place.borough || place.county || "",
  };
}

export async function collectFiche({ nom, ville, queryOverride, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const nomTrim = (nom || "").trim();
  const villeTrim = (ville || "").trim();
  const directQuery = (queryOverride || "").trim();
  if (!directQuery && (!nomTrim || !villeTrim)) {
    return { ok: false, code: 400, error: "Missing required parameters: nom, ville." };
  }

  // .trim() : évite un 401 si le secret a été stocké avec un espace / retour ligne final.
  const key = (apiKey || "").trim();
  if (!key) {
    console.error("collectFiche: OUTSCRAPER_API_KEY manquant dans l'environnement.");
    return { ok: false, code: 500, error: "Server configuration error." };
  }

  const query = directQuery || `${nomTrim} ${villeTrim}`;
  const url = new URL(OUTSCRAPER_HOST + OUTSCRAPER_SEARCH_PATH);
  url.searchParams.set("query", query);
  url.searchParams.set("organizationsPerQueryLimit", "1");
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
    console.error("collectFiche: appel amont échoué", err && err.name);
    return { ok: false, code: 502, error: "Outscraper request failed." };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error("collectFiche: réponse amont non OK", res.status);
    return { ok: false, code: 502, error: "Outscraper returned an error.", status: res.status };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("collectFiche: réponse amont non JSON");
    return { ok: false, code: 502, error: "Invalid response from Outscraper." };
  }

  if (payload && typeof payload.status === "string" && payload.status.toLowerCase() === "pending") {
    console.error("collectFiche: réponse Pending (mode async non géré ici)");
    return { ok: false, code: 502, error: "Outscraper is processing asynchronously." };
  }

  // data est un tableau par requête, de tableaux de lieux.
  const data = payload && payload.data;
  let place = null;
  if (Array.isArray(data) && data.length) {
    const firstQuery = data[0];
    place = Array.isArray(firstQuery) ? (firstQuery[0] || null) : (firstQuery || null);
  }
  if (!place || typeof place !== "object") {
    return { ok: false, code: 404, error: "No business found." };
  }

  return { ok: true, fiche: mapPlace(place) };
}
