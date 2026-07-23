// Cloudflare Pages Function — Connecteur Outscraper (Appel A : fiche par nom + ville)
// Route : GET /api/outscraper?nom=...&ville=...
// Auth  : Authorization: Bearer <CONNECTOR_TOKEN>
// Secrets (context.env) : OUTSCRAPER_API_KEY, CONNECTOR_TOKEN
//
// Périmètre volontairement minimal : uniquement la fiche cible (pas de concurrents,
// avis détaillés, IA, PDF, cache, D1 ni captures d'écran).

const OUTSCRAPER_HOST = "https://api.app.outscraper.com";
const OUTSCRAPER_SEARCH_PATH = "/maps/search-v3";
const REQUEST_TIMEOUT_MS = 25000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  },
});

// Préflight CORS (l'en-tête Authorization déclenche un OPTIONS côté navigateur).
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // 1 & 2. Authentification par Bearer token.
  if (!env.CONNECTOR_TOKEN) {
    console.error("outscraper: CONNECTOR_TOKEN manquant dans l'environnement.");
    return jsonResponse({ success: false, error: "Server configuration error." }, 500);
  }
  const authHeader = request.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer || bearer !== env.CONNECTOR_TOKEN) {
    return jsonResponse({ success: false, error: "Unauthorized." }, 401);
  }

  // 3. Lire les paramètres.
  const url = new URL(request.url);
  const nom = (url.searchParams.get("nom") || "").trim();
  const ville = (url.searchParams.get("ville") || "").trim();
  if (!nom || !ville) {
    return jsonResponse({ success: false, error: "Missing required parameters: nom, ville." }, 400);
  }

  // .trim() : évite un 401 si le secret a été stocké avec un espace / retour ligne final.
  const apiKey = (env.OUTSCRAPER_API_KEY || "").trim();
  if (!apiKey) {
    console.error("outscraper: OUTSCRAPER_API_KEY manquant dans l'environnement.");
    return jsonResponse({ success: false, error: "Server configuration error." }, 500);
  }

  // 4. Construire la requête.
  const query = `${nom} ${ville}`;

  // 5 & 6. Appel Google Maps Search (v3) d'Outscraper, en mode synchrone, 1 résultat.
  const outscraperUrl = new URL(OUTSCRAPER_HOST + OUTSCRAPER_SEARCH_PATH);
  outscraperUrl.searchParams.set("query", query);
  outscraperUrl.searchParams.set("organizationsPerQueryLimit", "1");
  outscraperUrl.searchParams.set("async", "false");
  outscraperUrl.searchParams.set("language", "fr");

  // --- LOG TEMPORAIRE (diagnostic 401) — À RETIRER ensuite. Ne loggue jamais la clé. ---
  console.log("[outscraper][debug] method=GET url=" + outscraperUrl.toString() + " body=none apiKeyLen=" + apiKey.length);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let outscraperResponse;
  let bodyText;
  try {
    outscraperResponse = await fetch(outscraperUrl.toString(), {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    bodyText = await outscraperResponse.text();
  } catch (err) {
    console.error("outscraper: appel amont échoué", err && err.name);
    return jsonResponse({ success: false, error: "Outscraper request failed." }, 502);
  } finally {
    clearTimeout(timeout);
  }

  // --- LOG TEMPORAIRE (diagnostic 401) — À RETIRER ensuite. ---
  console.log("[outscraper][debug] status=" + outscraperResponse.status + " body=" + (bodyText || "").slice(0, 800));

  if (!outscraperResponse.ok) {
    console.error("outscraper: réponse amont non OK", outscraperResponse.status);
    return jsonResponse({ success: false, error: "Outscraper returned an error.", status: outscraperResponse.status }, 502);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error("outscraper: réponse amont non JSON");
    return jsonResponse({ success: false, error: "Invalid response from Outscraper." }, 502);
  }

  // La réponse synchrone d'Outscraper a la forme { status, id, data: [ [ {place}, ... ] ] }.
  // Si le service a mis la requête en file (Pending), on ne poll pas ici (hors périmètre).
  if (payload && typeof payload.status === "string" && payload.status.toLowerCase() === "pending") {
    console.error("outscraper: réponse Pending (mode async non géré ici)");
    return jsonResponse({ success: false, error: "Outscraper is processing asynchronously." }, 502);
  }

  // 7. Extraire le premier établissement (data est un tableau par requête, de tableaux de lieux).
  const data = payload && payload.data;
  let place = null;
  if (Array.isArray(data) && data.length) {
    const firstQuery = data[0];
    place = Array.isArray(firstQuery) ? (firstQuery[0] || null) : (firstQuery || null);
  }
  if (!place || typeof place !== "object") {
    return jsonResponse({ success: false, error: "No business found." }, 404);
  }

  // 8. Mapper vers le JSON de sortie (adapté aux noms réels Outscraper).
  const toNumberOrNull = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

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

  const fiche = {
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
  };

  return jsonResponse({ success: true, fiche });
}
