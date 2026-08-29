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
import { addSearchResultContext, collectCompetitors } from "../lib/collectCompetitors.js";
import {
  loadDiagnosticRequestByIdempotency,
  normalizeInternalDiagnosticRequest,
  persistDiagnosticRequestAtomically,
} from "../lib/diagnosticRequests.js";
import { verifyConnectorToken } from "./_auth.js";
import { SCORING_VERSION } from "../lib/score-efficia/scoreConfig.js";
// Correctif (revue "étendre le correctif d'ancrage géographique à
// /api/analyze") — cette route est le VÉRITABLE point d'entrée de la
// création manuelle d'un diagnostic gratuit ou Premium depuis le
// back-office (bouton « Nouvel audit » -> admin/audits.js -> ici, étape
// "observation" du pipeline), distinct de free-diagnostic-collect/
// [analysisId].js qui ne gère que les relances (refresh_search) et la
// collecte initiale du parcours public (diagnostic_requests). Avant ce
// correctif, la toute première recherche concurrentielle déclenchée par
// « Créer le diagnostic gratuit » n'utilisait AUCUN ancrage géographique
// (ni coordonnées, ni region) : ni le bug d'origine (coordonnées de
// l'entreprise), ni sa correction (centre géocodé de la localité) —
// simplement aucune protection du tout. Ce module utilise désormais
// EXACTEMENT le même résolveur partagé que free-diagnostic-collect/
// [analysisId].js — jamais une seconde implémentation divergente.
import { resolveGeographicAnchor, buildGeographicAnchorRecord } from "../lib/geographicAnchor.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

const jsonError = (errorCode, error, status, details = {}) => jsonResponse({
  error,
  error_code: errorCode,
  ...details,
}, status);

const d1Nullable = (value) => (value === undefined ? null : value);

function logD1Error(error, fallbackPhase) {
  const details = {
    phase: typeof error?.phase === "string" ? error.phase : fallbackPhase,
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : "D1 persistence failed.",
  };
  if (typeof error?.cause?.message === "string") {
    details.cause_message = error.cause.message;
  }
  console.error("analyze: D1 persistence failed", details);
}

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
    observed_fields: Array.isArray(fiche.observed_fields) ? fiche.observed_fields : [],
    action_links_status: fiche.action_links_status === "available" ? "available" : "unavailable",
    action_links: Array.isArray(fiche.action_links) ? fiche.action_links : [],
    ...(Array.isArray(fiche.observed_fields) && fiche.observed_fields.includes("services")
      ? { services: Array.isArray(fiche.services) ? fiche.services : [] }
      : {}),
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
  if (!auth.ok) {
    return jsonError(
      auth.status === 401 ? "ANALYZE_UNAUTHORIZED" : "CONNECTOR_CONFIGURATION_ERROR",
      auth.error,
      auth.status,
    );
  }

  // Base D1.
  const db = env.ORDERS_DB;
  if (!db) {
    console.error("analyze: binding ORDERS_DB indisponible.");
    return jsonError("D1_BINDING_MISSING", "Server configuration error.", 500);
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
        return jsonError("INVALID_DIAGNOSTIC_REQUEST", "Invalid diagnostic request.", 400);
      }
      diagnosticRequest = normalizedDiagnosticRequest.data;
    }
  } catch {
    return jsonError("INVALID_JSON", "Invalid JSON body.", 400);
  }
  if (!observationQuery && !googleBusinessUrl && (!nom || !ville)) {
    return jsonError("MISSING_ANALYSIS_INPUT", "Missing required parameters: nom, ville or observationQuery.", 400);
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
      return jsonError("DIAGNOSTIC_LOOKUP_FAILED", "Storage configuration error.", 500);
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
      return jsonError("AMBIGUOUS_CANDIDATES", "AMBIGUOUS_CANDIDATES", 409, {
        message: result.message,
        candidates: result.candidates || [],
      });
    }
    // Le candidat choisi manuellement n'a pas pu être retrouvé (résultats
    // Outscraper changés entre les deux requêtes) — pas plus d'écriture D1.
    if (result.error === "SELECTED_CANDIDATE_NOT_FOUND") {
      return jsonError("SELECTED_CANDIDATE_NOT_FOUND", "SELECTED_CANDIDATE_NOT_FOUND", 409, {
        message: result.message,
      });
    }
    if (result.code === 404) {
      // collectFiche() distingue "aucun résultat brut" (message par défaut)
      // d'"un résultat existe mais aucun n'est assez fiable" (Objectif 3,
      // result.message = "Aucune entreprise fiable trouvée.") : on relaie ce
      // message précis plutôt que de l'écraser, sans changer le code HTTP ni
      // la forme de la réponse existante.
      return jsonError("BUSINESS_NOT_FOUND", result.message || "No business found.", 404);
    }
    console.error("analyze: collecte échouée", result.code, result.error);
    return jsonError("COLLECTION_FAILED", "Collection failed.", 502);
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

  // Ancrage géographique — point de mesure du classement local, jamais
  // l'entreprise analysée elle-même (voir geographicAnchor.js). `fiche` (la
  // fiche brute renvoyée par collectFiche(), avant normaliserFiche() qui ne
  // recopie pas postal_code/country/country_code) porte les champs de
  // localité réels ; `resolveGeographicAnchorLocality` retombe dessus
  // automatiquement si `normalized` ne les a pas — mêmes règles que
  // free-diagnostic-collect/[analysisId].js, jamais une variante.
  const geoAnchor = await resolveGeographicAnchor({ normalized, fiche, apiKey: env.OUTSCRAPER_API_KEY });

  // Correctif — requete par défaut vide (jamais pré-remplie avec
  // "<activité> <ville>" avant que la recherche n'ait réellement eu lieu) :
  // même règle conservatrice que free-diagnostic-collect/[analysisId].js.
  // Sans cela, un ancrage indisponible ou un échec fournisseur laisserait
  // malgré tout une "recherche testée" enregistrée en base alors qu'aucun
  // appel concurrentiel n'a eu lieu — une donnée de classement trompeuse.
  let competitorData = {
    requete: "",
    position: null,
    concurrents: [],
  };
  // Correctif — recherche concurrentielle strictement bloquée sans ancrage
  // fiable, exactement comme la relance et la collecte initiale de
  // free-diagnostic-collect/[analysisId].js : jamais un appel « à
  // l'aveugle » (sans coordinates/region), jamais un repli sur les
  // coordonnées de l'entreprise. L'identification de la fiche reste
  // néanmoins enregistrée ci-dessous (utile pour la validation manuelle et
  // une relance ultérieure, elle-même bloquée tant que le centre de la
  // localité n'est pas confirmé) — seule la recherche concurrentielle est
  // omise.
  if (resolvedActivite && resolvedVille && geoAnchor.ok) {
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
      // Point neutre de la localité — jamais les coordonnées de
      // l'entreprise analysée, jamais un simple paramètre "region" en
      // repli (ce repli n'existe plus, voir localityGeocoder.js).
      coordinates: geoAnchor.coordinates,
      region: geoAnchor.region,
      apiKey: env.OUTSCRAPER_API_KEY,
      suppressSensitiveLogs: Boolean(diagnosticRequest),
    });
    if (competitorsResult.ok) {
      competitorData = {
        requete: competitorsResult.requete,
        position: competitorsResult.position,
        concurrents: competitorsResult.concurrents,
        positionKind: competitorsResult.positionKind,
        sponsoredResultsExcluded: competitorsResult.sponsoredResultsExcluded,
        rankEvidence: competitorsResult.rankEvidence,
      };
    } else {
      console.error("analyze: collecte concurrents échouée", competitorsResult.code, competitorsResult.error);
    }
  } else if (resolvedActivite && resolvedVille && !geoAnchor.ok) {
    console.error("analyze: ancrage géographique indisponible, recherche concurrentielle omise", {
      code: geoAnchor.code,
    });
  }

  // 3) Enregistrement en D1.
  const analysisId = crypto.randomUUID();
  const now = new Date().toISOString();
  const storedNom = nom || normalized.name || googleBusinessUrl;
  const storedVille = resolvedVille || VILLE_PLACEHOLDER;
  const query = observationQuery || googleBusinessUrl || `${storedNom} ${storedVille}`;
  // Ancrage mémorisé uniquement quand une recherche a réellement été lancée
  // avec ce centre géocodé (geoAnchor.ok && competitorData.requete) —
  // jamais persisté "au cas où", jamais pour une recherche qui n'a pas eu
  // lieu ou a échoué (même règle que free-diagnostic-collect/
  // [analysisId].js::normalizedWithConfirmedActivity).
  const normalizedWithAnchor = {
    ...normalized,
    ...(geoAnchor.ok && competitorData.requete
      ? { geographic_anchor: buildGeographicAnchorRecord(geoAnchor, now) }
      : {}),
  };
  const normalizedForStorage = addSearchResultContext(normalizedWithAnchor, competitorData);

  if (![storedNom, storedVille, query].every((value) => typeof value === "string" && value.trim())) {
    return jsonError("INSUFFICIENT_BUSINESS_DATA", "Insufficient business data for storage.", 422);
  }

  console.log("analyze:saving-d1");
  try {
    const analysisStatement = db.prepare(`
      INSERT INTO analyses (
        analysis_id, nom, ville, query, place_id, name,
        rating, reviews, photos_count, description_length,
        activity, search_query, local_position, competitors_json,
        status, fiche_json, normalized_json, created_at, updated_at, report_type,
        scoring_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      analysisId,
      storedNom,
      storedVille,
      query,
      d1Nullable(normalized.place_id || null),
      d1Nullable(normalized.name || null),
      d1Nullable(normalized.rating),
      d1Nullable(normalized.reviews),
      d1Nullable(normalized.photos_count),
      normalized.description_length,
      d1Nullable(resolvedActivite || null),
      d1Nullable(competitorData.requete || null),
      d1Nullable(competitorData.position),
      JSON.stringify(competitorData.concurrents || []),
      diagnosticRequest ? "awaiting_review" : "collected",
      JSON.stringify(fiche),
      JSON.stringify(normalizedForStorage),
      now,
      now,
      diagnosticRequest ? "free" : null,
      SCORING_VERSION,
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
    logD1Error(err, "analysis_insert");
    return jsonError("D1_PERSISTENCE_FAILED", "Storage failed.", 500);
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
    console.error("analyze: request processing failed", {
      phase: "request_processing",
      name: typeof err?.name === "string" ? err.name : "Error",
    });
    return jsonError("ANALYZE_INTERNAL_ERROR", "Internal server error.", 500);
  }
}
