// Cloudflare Pages Function — /api/analyze
// 1) valide le corps JSON reçu par POST ; 2) appelle directement le module partagé
// collectFiche ; 3) normalise ; 4) enregistre dans D1 (ORDERS_DB) avec un
// analysisId ; 5) retourne l'identifiant opaque et le statut de l'analyse.
//
// Méthode : POST  (crée une analyse)
// Auth    : Authorization: Bearer <CONNECTOR_TOKEN>
// Entrée  : { "nom": "...", "ville": "...", "activite": "...", "observationQuery": "..." }
//           dans un corps JSON valide.
// Secrets : CONNECTOR_TOKEN et OUTSCRAPER_API_KEY utilisés par les modules partagés.
// D1      : binding ORDERS_DB, table `analyses` (migration 0003_analyses.sql)

import { collectFiche } from "../lib/collectFiche.js";
import { collectCompetitors } from "../lib/collectCompetitors.js";
import {
  loadDiagnosticRequestByIdempotency,
  normalizeInternalDiagnosticRequest,
  persistDiagnosticRequestAtomically,
} from "../lib/diagnosticRequests.js";
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
    cid: fiche.cid || "",
    // Passage direct des champs collectés par collectFiche() (déjà nettoyés côté Outscraper).
    category: fiche.category || "",
    type: fiche.type || "",
    phone: fiche.phone || "",
    site: fiche.site || "",
    address: fiche.address || "",
    city: fiche.city || "",
    borough: fiche.borough || "",
  };
}

// Espace réservé au fallback d'activité généré par admin/audits.js quand aucune ville/activité
// réelle n'est fournie (cf. buildPipelineInput). Ce n'est pas une vraie activité : dès qu'une
// catégorie réelle est détectée côté Outscraper, elle doit primer sur ce texte générique.
const GENERIC_ACTIVITY_PLACEHOLDER = "entreprise locale";
const VILLE_PLACEHOLDER = "Non renseignée";

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
  let googleBusinessUrl = "";
  let observationQuery = "";
  let selectedPlaceId = "";
  let selectedCandidate = null;
  let diagnosticRequest = null;
  try {
    const payload = await request.json();
    nom = typeof payload?.nom === "string" ? payload.nom.trim() : "";
    ville = typeof payload?.ville === "string" ? payload.ville.trim() : "";
    activite = typeof payload?.activite === "string" ? payload.activite.trim() : "";
    googleBusinessUrl = typeof payload?.googleBusinessUrl === "string"
      ? payload.googleBusinessUrl.trim()
      : (typeof payload?.google_business_url === "string" ? payload.google_business_url.trim() : "");
    observationQuery = typeof payload?.observationQuery === "string"
      ? payload.observationQuery.trim()
      : (typeof payload?.queryOverride === "string" ? payload.queryOverride.trim() : "");
    // Objectif 2 (mission "rendre l'identification suffisamment robuste") —
    // l'administrateur a déjà choisi un candidat parmi une liste ambiguë
    // présentée précédemment par cette même route (voir plus bas).
    selectedPlaceId = typeof payload?.selectedPlaceId === "string" ? payload.selectedPlaceId.trim() : "";
    // Mission "logique métier déterministe" — Objectif 5 : le candidat
    // COMPLET (renvoyé tel quel par cette même route dans le champ `raw` de
    // la réponse AMBIGUOUS_CANDIDATES) est transmis directement à
    // collectFiche(), qui l'utilise sans rappeler Outscraper — élimine la
    // cause du bug SELECTED_CANDIDATE_NOT_FOUND (non-déterminisme
    // d'Outscraper entre deux appels identiques consécutifs).
    selectedCandidate = payload?.selectedCandidate && typeof payload.selectedCandidate === "object"
      ? payload.selectedCandidate
      : null;
    if (payload?.diagnosticRequest !== undefined) {
      const normalizedDiagnosticRequest = normalizeInternalDiagnosticRequest(payload.diagnosticRequest);
      if (!normalizedDiagnosticRequest.ok) {
        return jsonResponse({ error: "Invalid diagnostic request." }, 400);
      }
      diagnosticRequest = normalizedDiagnosticRequest.data;
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (!observationQuery && !googleBusinessUrl && (!nom || !ville)) {
    return jsonResponse({ error: "Missing required parameters: nom, ville or observationQuery." }, 400);
  }

  if (diagnosticRequest) {
    try {
      const existing = await loadDiagnosticRequestByIdempotency(db, diagnosticRequest.idempotencyKey);
      if (existing?.analysis_id) {
        return jsonResponse({
          analysisId: existing.analysis_id,
          status: existing.status || "awaiting_review",
          mailerLiteStatus: existing.mailerlite_status || "pending",
          idempotent: true,
        });
      }
    } catch (error) {
      console.error("analyze: diagnostic request lookup failed", { migration_required: true });
      return jsonResponse({ error: "Storage configuration error." }, 500);
    }
  }

  // 1) Collecte directe via le module partagé (plus d'auto-appel HTTP vers /api/outscraper).
  console.log("analyze:calling-outscraper");
  const result = await collectFiche({
    nom,
    ville,
    queryOverride: observationQuery || googleBusinessUrl,
    apiKey: env.OUTSCRAPER_API_KEY,
    selectedPlaceId: selectedPlaceId || undefined,
    selectedCandidate: selectedCandidate || undefined,
    suppressSensitiveLogs: Boolean(diagnosticRequest),
  });
  if (!result.ok) {
    // Objectif 2 — plusieurs candidats plausibles, aucun ne dépasse le seuil
    // de sélection automatique : on ne crée AUCUNE analyse tant qu'un
    // administrateur n'a pas tranché. Aucune écriture D1 dans cette branche.
    if (result.error === "AMBIGUOUS_CANDIDATES") {
      console.log("analyze:ambiguous-candidates", { count: result.candidates?.length || 0 });
      return jsonResponse({
        error: "AMBIGUOUS_CANDIDATES",
        message: result.message,
        candidates: result.candidates || [],
      }, 409);
    }
    // Le candidat choisi manuellement n'a pas pu être retrouvé (résultats
    // Outscraper changés entre les deux requêtes) — pas plus d'écriture D1.
    if (result.error === "SELECTED_CANDIDATE_NOT_FOUND") {
      return jsonResponse({ error: "SELECTED_CANDIDATE_NOT_FOUND", message: result.message }, 409);
    }
    if (result.code === 404) {
      // collectFiche() distingue "aucun résultat brut" (message par défaut)
      // d'"un résultat existe mais aucun n'est assez fiable" (Objectif 3,
      // result.message = "Aucune entreprise fiable trouvée.") : on relaie ce
      // message précis plutôt que de l'écraser, sans changer le code HTTP ni
      // la forme de la réponse existante.
      return jsonResponse({ error: result.message || "No business found." }, 404);
    }
    console.error("analyze: collecte échouée", result.code, result.error);
    return jsonResponse({ error: "Collection failed." }, 502);
  }

  // 2) Normalisation.
  console.log("analyze:normalizing");
  const fiche = result.fiche;
  const normalized = normaliserFiche(fiche);

  // Ville : priorité absolue à la saisie manuelle. À défaut, ville détectée par Outscraper
  // (city, puis borough/county en repli). Jamais inventée : si ni l'une ni l'autre n'existe,
  // le champ reste vide (le placeholder "Non renseignée" n'est appliqué qu'au moment du stockage).
  const villeSaisie = ville && ville !== VILLE_PLACEHOLDER ? ville : "";
  const villeDetectee = normalized.city || normalized.borough || "";
  const resolvedVille = villeSaisie || villeDetectee;

  // Activité de benchmark : priorité à une activité réellement saisie. Le fallback générique
  // "entreprise locale" (posé par admin/audits.js quand rien n'est connu) ne compte pas comme une
  // activité réelle, et NI le nom de l'entreprise (admin/audits.js utilise aussi companyName comme
  // "activite" quand seuls Nom+Ville sont fournis, sans réelle catégorie — bug corrigé ici : le
  // champ "Catégorie principale" affichait alors le nom de l'entreprise au lieu de sa catégorie
  // Google). Dans les deux cas, la catégorie principale détectée par Outscraper (category, puis
  // type) prime.
  const activiteSaisieBrute = (activite || "").trim().toLowerCase();
  const nomTrimLower = (nom || "").trim().toLowerCase();
  const estUnFauxSemblantDeNom = Boolean(nomTrimLower) && activiteSaisieBrute === nomTrimLower;
  const activiteSaisie = activite && activiteSaisieBrute !== GENERIC_ACTIVITY_PLACEHOLDER && !estUnFauxSemblantDeNom
    ? activite
    : "";
  const categorieDetectee = normalized.category || normalized.type || "";
  const resolvedActivite = activiteSaisie || categorieDetectee;

  if (!diagnosticRequest) {
    console.log("analyze:location-resolution", {
      ville_saisie: Boolean(villeSaisie),
      ville_detectee: villeDetectee || null,
      activite_saisie: Boolean(activiteSaisie),
      categorie_detectee: categorieDetectee || null,
    });
  }

  let competitorData = {
    requete: resolvedActivite && resolvedVille ? `${resolvedActivite} ${resolvedVille}` : "",
    position: null,
    concurrents: [],
  };
  if (resolvedActivite && resolvedVille) {
    if (!diagnosticRequest) {
      console.log("analyze:calling-competitors", { activite: resolvedActivite, ville: resolvedVille });
    }
    const competitorsResult = await collectCompetitors({
      activite: resolvedActivite,
      ville: resolvedVille,
      // Bug corrigé — la fiche analysée ne doit jamais apparaître dans ses propres concurrents.
      // On transmet tous les identifiants uniques disponibles pour cette fiche (place_id, CID,
      // URL Google) : collectCompetitors() exclut toute correspondance sur l'un ou l'autre.
      placeIdCible: normalized.place_id,
      cidCible: normalized.cid,
      urlCible: normalized.location_link,
      apiKey: env.OUTSCRAPER_API_KEY,
      suppressSensitiveLogs: Boolean(diagnosticRequest),
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
  const storedNom = nom || normalized.name || googleBusinessUrl;
  const storedVille = resolvedVille || VILLE_PLACEHOLDER;
  const query = observationQuery || googleBusinessUrl || `${storedNom} ${storedVille}`;

  console.log("analyze:saving-d1");
  try {
    const analysisStatement = db.prepare(`
      INSERT INTO analyses (
        analysis_id, nom, ville, query, place_id, name,
        rating, reviews, photos_count, description_length,
        activity, search_query, local_position, competitors_json,
        status, fiche_json, normalized_json, created_at, updated_at, report_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      analysisId,
      storedNom,
      storedVille,
      query,
      normalized.place_id || null,
      normalized.name || null,
      normalized.rating,
      normalized.reviews,
      normalized.photos_count,
      normalized.description_length,
      resolvedActivite || null,
      competitorData.requete || null,
      competitorData.position,
      JSON.stringify(competitorData.concurrents || []),
      diagnosticRequest ? "awaiting_review" : "collected",
      JSON.stringify(fiche),
      JSON.stringify(normalized),
      now,
      now,
      diagnosticRequest ? "free" : null,
    );

    if (diagnosticRequest) {
      const persisted = await persistDiagnosticRequestAtomically(db, {
        analysisStatement,
        request: {
          ...diagnosticRequest,
          analysisId,
          createdAt: now,
        },
      });
      return jsonResponse({
        analysisId: persisted.analysisId,
        status: persisted.status,
        mailerLiteStatus: persisted.mailerLiteStatus,
        idempotent: persisted.idempotent,
        identificationConfidence: result.confidence ?? null,
        identificationTier: result.tier ?? null,
      });
    }

    await analysisStatement.run();
  } catch (err) {
    console.error("analyze: écriture D1 échouée", err && err.message);
    return jsonResponse({ error: "Storage failed." }, 500);
  }

  // 4) Réponse.
  // Objectif 7 (mission "rendre l'identification suffisamment robuste") —
  // remonter le score de confiance et le palier de décision jusqu'à
  // l'appelant (admin/audits.js, puis le script de campagne), uniquement
  // dans la réponse JSON : aucune colonne D1 n'est ajoutée, l'INSERT
  // ci-dessus reste strictement inchangé.
  console.log("analyze:returning-success");
  return jsonResponse({
    analysisId,
    status: "collected",
    identificationConfidence: result.confidence ?? null,
    identificationTier: result.tier ?? null,
  });
  } catch (err) {
    console.error(err);
    return Response.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
