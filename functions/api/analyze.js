// Cloudflare Pages Function — /api/analyze
// 1) appelle /api/outscraper (Appel A) ; 2) normalise ; 3) enregistre dans D1 (ORDERS_DB)
// avec un analysisId ; 4) retourne { analysisId, status: "collected" }.
//
// Méthode : POST  (crée une analyse)
// Auth    : Authorization: Bearer <CONNECTOR_TOKEN>
// Entrée  : { "nom": "...", "ville": "...", "activite": "..." } (JSON body ; à défaut, paramètres ?nom=&ville=&activite=)
// Secrets : CONNECTOR_TOKEN (+ OUTSCRAPER_API_KEY utilisé par /api/outscraper)
// D1      : binding ORDERS_DB, table `analyses` (migration 0003_analyses.sql)

import { collectFiche } from "../lib/collectFiche.js";
import { collectCompetitors } from "../lib/collectCompetitors.js";
import { verifyConnectorToken } from "./_auth.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Normalisation de la fiche Outscraper vers une forme propre et typée.
function normaliserFiche(fiche) {
  const num = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  const description = typeof fiche.description === "string" ? fiche.description : "";
  const photos = Array.isArray(fiche.photos_sample)
    ? fiche.photos_sample
        .map((p) => (p && typeof p.photo_url === "string" ? { photo_url: p.photo_url } : null))
        .filter(Boolean)
    : [];
  const subtypes = Array.isArray(fiche.subtypes) ? fiche.subtypes.filter((s) => typeof s === "string" && s.trim()) : [];
  return {
    name: fiche.name || "",
    place_id: fiche.place_id || "",
    rating: num(fiche.rating),
    reviews: num(fiche.reviews),
    photos_count: num(fiche.photos_count),
    description,
    description_length: description.length,
    photos_sample: photos,
    photos_sample_count: photos.length,
    working_hours: fiche.working_hours ?? null,
    subtypes,
    location_link: fiche.location_link || "",
  };
}

export async function onRequestPost(context) {
  try {
  console.log("analyze:start");
  const { request, env } = context;

  // Auth Bearer.
  const auth = verifyConnectorToken(context);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  // Base D1.
  const db = env.ORDERS_DB;
  if (!db) {
    console.error("analyze: binding ORDERS_DB indisponible.");
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  // Entrée : body JSON, sinon paramètres d'URL.
  let nom = "";
  let ville = "";
  let activite = "";
  try {
    const payload = await request.json();
    nom = typeof payload?.nom === "string" ? payload.nom.trim() : "";
    ville = typeof payload?.ville === "string" ? payload.ville.trim() : "";
    activite = typeof payload?.activite === "string" ? payload.activite.trim() : "";
  } catch {
    // pas de body JSON : on tentera les paramètres d'URL
  }
  const url = new URL(request.url);
  nom = nom || (url.searchParams.get("nom") || "").trim();
  ville = ville || (url.searchParams.get("ville") || "").trim();
  activite = activite || (url.searchParams.get("activite") || "").trim();
  if (!nom || !ville) {
    return jsonResponse({ error: "Missing required parameters: nom, ville." }, 400);
  }

  // 1) Collecte directe via le module partagé (plus d'auto-appel HTTP vers /api/outscraper).
  console.log("analyze:calling-outscraper");
  const result = await collectFiche({ nom, ville, apiKey: env.OUTSCRAPER_API_KEY });
  if (!result.ok) {
    if (result.code === 404) {
      return jsonResponse({ error: "No business found." }, 404);
    }
    console.error("analyze: collecte échouée", result.code, result.error);
    return jsonResponse({ error: "Collection failed." }, 502);
  }

  // 2) Normalisation.
  console.log("analyze:normalizing");
  const fiche = result.fiche;
  const normalized = normaliserFiche(fiche);
  let competitorData = {
    requete: activite ? `${activite} ${ville}` : "",
    position: null,
    concurrents: [],
  };
  if (activite) {
    console.log("analyze:calling-competitors");
    const competitorsResult = await collectCompetitors({
      activite,
      ville,
      placeIdCible: normalized.place_id,
      apiKey: env.OUTSCRAPER_API_KEY,
    });
    if (competitorsResult.ok) {
      competitorData = {
        requete: competitorsResult.requete,
        position: competitorsResult.position,
        concurrents: competitorsResult.concurrents,
      };
    } else {
      console.error("analyze: collecte concurrents échouée", competitorsResult.code, competitorsResult.error);
    }
  }

  // 3) Enregistrement en D1.
  const analysisId = crypto.randomUUID();
  const now = new Date().toISOString();
  const query = `${nom} ${ville}`;

  console.log("analyze:saving-d1");
  try {
    await db.prepare(`
      INSERT INTO analyses (
        analysis_id, nom, ville, query, place_id, name,
        rating, reviews, photos_count, description_length,
        activity, search_query, local_position, competitors_json,
        status, fiche_json, normalized_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'collected', ?, ?, ?, ?)
    `).bind(
      analysisId,
      nom,
      ville,
      query,
      normalized.place_id || null,
      normalized.name || null,
      normalized.rating,
      normalized.reviews,
      normalized.photos_count,
      normalized.description_length,
      activite || null,
      competitorData.requete || null,
      competitorData.position,
      JSON.stringify(competitorData.concurrents || []),
      JSON.stringify(fiche),
      JSON.stringify(normalized),
      now,
      now,
    ).run();
  } catch (err) {
    console.error("analyze: écriture D1 échouée", err && err.message);
    return jsonResponse({ error: "Storage failed." }, 500);
  }

  // 4) Réponse.
  console.log("analyze:returning-success");
  return jsonResponse({ analysisId, status: "collected" });
  } catch (err) {
    console.error(err);
    return Response.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
