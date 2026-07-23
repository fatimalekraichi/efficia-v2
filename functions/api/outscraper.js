// Cloudflare Pages Function — Connecteur Outscraper (Appel A : fiche par nom + ville)
// Route : GET /api/outscraper?nom=...&ville=...
// Auth  : Authorization: Bearer <CONNECTOR_TOKEN>
// La logique de collecte vit dans ../lib/collectFiche.js (partagée avec /api/analyze).

import { collectFiche } from "../lib/collectFiche.js";
import { verifyConnectorToken } from "./_auth.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

// Préflight CORS (l'en-tête Authorization déclenche un OPTIONS côté navigateur).
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Authentification par Bearer token.
  const auth = verifyConnectorToken(context);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  // Paramètres.
  const url = new URL(request.url);
  const nom = (url.searchParams.get("nom") || "").trim();
  const ville = (url.searchParams.get("ville") || "").trim();

  // Collecte (module partagé). Les codes d'erreur (400/404/500/502) proviennent de collectFiche.
  const result = await collectFiche({ nom, ville, apiKey: env.OUTSCRAPER_API_KEY });
  if (!result.ok) {
    const body = { success: false, error: result.error };
    if (result.status) body.status = result.status;
    return jsonResponse(body, result.code);
  }

  return jsonResponse({ success: true, fiche: result.fiche });
}
