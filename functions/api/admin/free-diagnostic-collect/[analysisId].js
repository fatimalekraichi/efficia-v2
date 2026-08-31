import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import { collectFiche } from "../../../lib/collectFiche.js";
import { addSearchResultContext, collectCompetitors } from "../../../lib/collectCompetitors.js";
import { markReportNarrativeOverridesForCurrentContext } from "../../../lib/reportNarrativeOverrides.js";
import {
  buildFreeDiagnosticCollectionState,
  isRefreshableFreeDiagnosticStatus,
} from "../../../lib/freeDiagnosticProductionLink.js";
import { isManualCreationSource, loadManualAuditMetadata } from "../../../lib/auditCreationMetadata.js";
import { benchmarkEngine } from "../../../lib/benchmarkEngine.js";
import {
  buildGeographicAnchorRecord, normalizeConfirmedSearchZone,
  resolveGeographicAnchor,
} from "../../../lib/geographicAnchor.js";

const VILLE_PLACEHOLDER = "Non renseignée";

const numberOrNull = (value) => (
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null
);

const usableText = (value) => {
  const clean = normalizeText(value);
  if (!clean || clean === VILLE_PLACEHOLDER || /^https?:\/\//i.test(clean)) return "";
  return clean;
};

function normalizeFiche(fiche = {}) {
  const description = typeof fiche.description === "string" ? fiche.description : "";
  return {
    name: normalizeText(fiche.name),
    place_id: normalizeText(fiche.place_id),
    rating: numberOrNull(fiche.rating),
    reviews: numberOrNull(fiche.reviews),
    photos_count: numberOrNull(fiche.photos_count),
    description,
    description_length: description.length,
    photos_sample: Array.isArray(fiche.photos_sample) ? fiche.photos_sample : [],
    working_hours: fiche.working_hours ?? null,
    subtypes: Array.isArray(fiche.subtypes) ? fiche.subtypes : [],
    location_link: normalizeText(fiche.location_link),
    cid: normalizeText(fiche.cid),
    category: normalizeText(fiche.category),
    type: normalizeText(fiche.type),
    phone: normalizeText(fiche.phone),
    site: normalizeText(fiche.site),
    address: normalizeText(fiche.address),
    city: normalizeText(fiche.city),
    borough: normalizeText(fiche.borough),
    // Ancrage géographique automatique : champs additifs capturés depuis la
    // fiche Outscraper (voir collectFiche.js), jamais recalculés ici.
    latitude: numberOrNull(fiche.latitude),
    longitude: numberOrNull(fiche.longitude),
    postal_code: normalizeText(fiche.postal_code),
    country: normalizeText(fiche.country),
    country_code: normalizeText(fiche.country_code),
    observed_fields: Array.isArray(fiche.observed_fields) ? fiche.observed_fields : [],
    action_links_status: fiche.action_links_status === "available" ? "available" : "unavailable",
    action_links: Array.isArray(fiche.action_links) ? fiche.action_links : [],
    ...(Array.isArray(fiche.observed_fields) && fiche.observed_fields.includes("services")
      ? { services: Array.isArray(fiche.services) ? fiche.services : [] }
      : {}),
  };
}

function safeFailure(errorCode, status = 502, trackingId = crypto.randomUUID()) {
  return jsonResponse({
    success: false,
    error: errorCode,
    message: "La collecte n’a pas pu être terminée. Réessayez dans quelques instants.",
    trackingId,
  }, status, { "Cache-Control": "no-store" });
}

function technicalFailure({ errorCode, phase, status = 502, error = null }) {
  const trackingId = crypto.randomUUID();
  console.error("free-diagnostic-collect: failed", {
    tracking_id: trackingId,
    phase,
    error_code: errorCode,
    ...(error ? { name: typeof error?.name === "string" ? error.name : "Error" } : {}),
  });
  return safeFailure(errorCode, status, trackingId);
}

function businessNotFoundFailure() {
  return jsonResponse({
    success: false,
    error: "GOOGLE_BUSINESS_NOT_FOUND",
    message: "Fiche Google introuvable. Vérifiez le lien transmis ou recherchez l’entreprise par son nom et sa ville.",
  }, 404, { "Cache-Control": "no-store" });
}

function isCollectedFiche(fiche) {
  const name = usableText(fiche?.name);
  const placeId = normalizeText(fiche?.place_id);
  const validPlaceId = Boolean(placeId && !/^__[^_]+(?:_[^_]+)*__$/.test(placeId));
  return Boolean(name && validPlaceId);
}

function normalizeSearchRefreshPayload(payload) {
  if (payload?.operation !== "refresh_search") return null;
  const searchQuery = normalizeText(payload.searchQuery).slice(0, 240);
  const activity = normalizeText(payload.activity).slice(0, 160);
  const city = normalizeText(payload.city).slice(0, 160);
  const company = normalizeText(payload.company).slice(0, 200);
  if (!searchQuery || !activity || !city || !company) return false;
  const rawSearchZone = payload?.searchZone && typeof payload.searchZone === "object"
    ? payload.searchZone
    : null;
  const confirmedSearchZone = rawSearchZone
    ? normalizeConfirmedSearchZone({
      city: normalizeText(rawSearchZone.city).slice(0, 160),
      postalCode: normalizeText(rawSearchZone.postalCode).slice(0, 32),
      countryCode: normalizeText(rawSearchZone.countryCode).slice(0, 2),
      countryName: normalizeText(rawSearchZone.countryName).slice(0, 80),
      source: normalizeText(rawSearchZone.city).localeCompare(city, "fr", { sensitivity: "base" }) === 0
        ? "admin_confirmed_city"
        : "admin_confirmed_search_zone",
    })
    : null;
  return {
    searchQuery, activity, city, company,
    confirmedSearchZone,
    confirmedSearchZoneProvided: Boolean(rawSearchZone),
  };
}

function mergeCategoryObservation(base, observation, confirmedActivity) {
  const next = { ...(base && typeof base === "object" ? base : {}) };
  const observedFields = new Set(Array.isArray(next.observed_fields) ? next.observed_fields : []);
  next.confirmed_activity = confirmedActivity;
  if (normalizeText(observation?.primaryCategory)) {
    next.category = normalizeText(observation.primaryCategory);
    observedFields.add("category");
  }
  if (observation?.secondaryCategoriesStatus === "available") {
    next.subtypes = Array.isArray(observation.secondaryCategories)
      ? observation.secondaryCategories.map(normalizeText).filter(Boolean)
      : [];
    observedFields.add("subtypes");
  }
  if (observation?.actionLinksStatus === "available") {
    next.action_links_status = "available";
    next.action_links = Array.isArray(observation.actionLinks) ? observation.actionLinks : [];
    observedFields.add("action_links");
  }
  if (normalizeText(observation?.locationLink)) next.location_link = normalizeText(observation.locationLink);
  if (normalizeText(observation?.placeId)) next.place_id = normalizeText(observation.placeId);
  if (normalizeText(observation?.cid)) next.cid = normalizeText(observation.cid);
  next.observed_fields = [...observedFields];
  return next;
}

function geographicAnchorUnavailableFailure({ confirmedSearchZoneProvided = false, anchor = null } = {}) {
  const confirmedButUnverified = confirmedSearchZoneProvided && anchor?.code !== "GEOGRAPHIC_ANCHOR_LOCALITY_UNKNOWN";
  return jsonResponse({
    success: false,
    error: "GEOGRAPHIC_ANCHOR_UNAVAILABLE",
    message: confirmedButUnverified
      ? "La zone géographique confirmée n’a pas pu être vérifiée. Vérifiez la ville et le pays avant de relancer l’analyse."
      : "Confirmez la zone géographique utilisée pour la recherche Google et son pays avant de relancer l’analyse.",
    missing: confirmedButUnverified ? [] : ["searchZone.city", "searchZone.countryCode"],
  }, 409, { "Cache-Control": "no-store" });
}

function identifierFromBusiness(normalized = {}, fiche = {}) {
  return normalizeText(normalized.location_link || fiche.location_link)
    || normalizeText(normalized.place_id || fiche.place_id)
    || normalizeText(normalized.cid || fiche.cid);
}

function sameGoogleBusiness(expected = {}, recovered = {}) {
  const expectedPlaceId = normalizeText(expected.place_id);
  const recoveredPlaceId = normalizeText(recovered.place_id);
  if (expectedPlaceId && recoveredPlaceId) return expectedPlaceId === recoveredPlaceId;
  const expectedCid = normalizeText(expected.cid);
  const recoveredCid = normalizeText(recovered.cid);
  return Boolean(expectedCid && recoveredCid && expectedCid === recoveredCid);
}

function mergeRecoveredGeography(base = {}, recovered = {}) {
  const next = { ...(base && typeof base === "object" ? base : {}) };
  for (const key of ["city", "borough", "postal_code", "country", "country_code", "location_link", "place_id", "cid"]) {
    if (!normalizeText(next[key]) && normalizeText(recovered[key])) next[key] = normalizeText(recovered[key]);
  }
  for (const key of ["latitude", "longitude"]) {
    if (numberOrNull(next[key]) === null && numberOrNull(recovered[key]) !== null) next[key] = numberOrNull(recovered[key]);
  }
  return next;
}

async function recoverGeographyFromIdentifier({ normalized, fiche, apiKey }) {
  const queryOverride = identifierFromBusiness(normalized, fiche);
  if (!queryOverride) return null;
  const result = await collectFiche({
    nom: "",
    ville: "",
    queryOverride,
    apiKey,
    suppressSensitiveLogs: true,
  });
  const recovered = result?.ok ? normalizeFiche(result.fiche || {}) : null;
  const expectedIdentity = {
    place_id: normalized.place_id || fiche.place_id,
    cid: normalized.cid || fiche.cid,
  };
  if (!recovered || !sameGoogleBusiness(expectedIdentity, recovered)) return null;
  return recovered;
}

function competitiveResultChanged(analysis, result, benchmark) {
  const before = JSON.stringify({
    query: analysis.business?.searchQuery || null,
    position: numberOrNull(analysis.business?.localPosition),
    competitors: analysis.business?.competitors || [],
    averages: analysis.benchmark?.averages || {},
  });
  const after = JSON.stringify({
    query: result.requete || null,
    position: numberOrNull(result.position),
    competitors: result.concurrents || [],
    averages: {
      rating: numberOrNull(benchmark.avg_rating),
      reviews: numberOrNull(benchmark.avg_reviews),
      photos: numberOrNull(benchmark.avg_photos),
    },
  });
  return before !== after;
}

async function refreshSearchAnalysis({ context, db, analysis, analysisId, payload }) {
  const normalized = analysis.business?.normalized || {};
  const fiche = analysis.business?.fiche || {};
  // Ancrage géographique automatique (mission "ancrage géographique",
  // corrigée pour ne plus jamais mesurer depuis les coordonnées de
  // l'entreprise analysée — voir geographicAnchor.js/localityGeocoder.js) :
  // résolu ici d'abord à partir de données déjà vérifiées côté serveur
  // (normalized/fiche). Si elles sont incomplètes, le serveur tente une
  // récupération par l'identifiant Google persisté, puis accepte uniquement
  // la zone + le pays explicitement confirmés dans le champ dédié du
  // back-office. En l’absence d’ancrage fiable (localité inconnue ou centre
  // de localité non géocodable), on n’appelle jamais le collecteur
  // concurrentiel avec une recherche ambiguë ni avec les coordonnées de
  // l'entreprise en secours : on s’arrête ici, sans toucher aux anciennes
  // données (aucune écriture DB avant ce point).
  let resolvedNormalized = normalized;
  let resolvedFiche = fiche;
  let anchor = await resolveGeographicAnchor({ normalized, fiche, apiKey: context.env.OUTSCRAPER_API_KEY });

  // Deuxième niveau : réinterroger la fiche par son identifiant Google déjà
  // persisté. Les coordonnées propres à l'entreprise ne deviennent jamais
  // le point de mesure ; seules les données de localité récupérées servent à
  // résoudre ensuite le même centre neutre que dans le chemin historique.
  if (!anchor.ok && anchor.code === "GEOGRAPHIC_ANCHOR_LOCALITY_UNKNOWN") {
    const recovered = await recoverGeographyFromIdentifier({
      normalized,
      fiche,
      apiKey: context.env.OUTSCRAPER_API_KEY,
    });
    if (recovered) {
      resolvedNormalized = mergeRecoveredGeography(normalized, recovered);
      resolvedFiche = mergeRecoveredGeography(fiche, recovered);
      anchor = await resolveGeographicAnchor({
        normalized: resolvedNormalized,
        fiche: resolvedFiche,
        apiKey: context.env.OUTSCRAPER_API_KEY,
      });
      if (anchor.ok) anchor = { ...anchor, localitySource: "google_business_identifier" };
    }
  }

  // Troisième niveau : zone et pays explicitement confirmés par
  // l'administratrice dans le champ dédié. Une ville seule ne suffit jamais.
  if (!anchor.ok && payload.confirmedSearchZone) {
    anchor = await resolveGeographicAnchor({
      normalized: resolvedNormalized,
      fiche: resolvedFiche,
      confirmedSearchZone: payload.confirmedSearchZone,
      apiKey: context.env.OUTSCRAPER_API_KEY,
    });
  }
  if (!anchor.ok) {
    console.error("free-diagnostic-collect: geographic anchor unavailable", {
      phase: "geographic_anchor",
      analysis_id: analysisId,
      reason: anchor.centerErrorCode || anchor.code || null,
    });
    return geographicAnchorUnavailableFailure({
      confirmedSearchZoneProvided: payload.confirmedSearchZoneProvided,
      anchor,
    });
  }
  const result = await collectCompetitors({
    requete: payload.searchQuery,
    activite: payload.activity,
    ville: payload.city,
    placeIdCible: analysis.business?.placeId || normalized.place_id || fiche.place_id,
    cidCible: normalized.cid || fiche.cid,
    urlCible: normalized.location_link || fiche.location_link,
    coordinates: anchor.coordinates,
    region: anchor.region,
    apiKey: context.env.OUTSCRAPER_API_KEY,
    suppressSensitiveLogs: true,
  });
  if (!result.ok) {
    return technicalFailure({
      phase: "competitor_refresh",
      errorCode: "SEARCH_REFRESH_FAILED",
      status: 502,
    });
  }

  const competitorsJson = JSON.stringify(result.concurrents);
  const benchmark = benchmarkEngine({
    rating: analysis.business?.rating,
    reviews: analysis.business?.reviews,
    photos_count: analysis.business?.photosCount,
    competitors_json: competitorsJson,
  });
  const updatedAt = new Date().toISOString();
  const normalizedWithCategories = mergeCategoryObservation(resolvedNormalized, result.targetObservation, payload.activity);
  const ficheWithCategories = mergeCategoryObservation(resolvedFiche, result.targetObservation, payload.activity);
  // Séparation obligatoire : l’ancrage réellement utilisé est tracé à part,
  // distinct de `result.requete` (requête affichée/saisie par l’administrateur,
  // jamais modifiée par cet ancrage — voir collectCompetitors.js).
  // "L'ancrage analysé" (mémorisé) est distinct de "l'ancrage actuellement
  // détecté" (recalculé à la volée par buildFreeDiagnosticCollectionState à
  // partir de l'état courant de la fiche) : on fige ici un instantané complet
  // — coordonnées incluses, jamais exposées au navigateur telles quelles —
  // pour que toute divergence future (fiche mise à jour autrement) puisse
  // être détectée sans jamais présenter une ancienne analyse comme
  // correspondant à de nouvelles coordonnées.
  const normalizedWithAnchor = {
    ...normalizedWithCategories,
    ...(anchor.localitySource === "admin_confirmed_city" || anchor.localitySource === "admin_confirmed_search_zone"
      ? { confirmed_search_zone: payload.confirmedSearchZone }
      : {}),
    geographic_anchor: buildGeographicAnchorRecord(anchor, updatedAt),
  };
  const normalizedWithContext = addSearchResultContext(normalizedWithAnchor, result);
  const state = buildFreeDiagnosticCollectionState({
    ...analysis,
    business: {
      ...analysis.business,
      searchQuery: result.requete,
      localPosition: result.position,
      positionKind: result.positionKind,
      sponsoredResultsExcluded: result.sponsoredResultsExcluded,
      rankEvidence: result.rankEvidence,
      competitors: result.concurrents,
      normalized: normalizedWithContext,
      fiche: ficheWithCategories,
    },
    benchmark: {
      ...analysis.benchmark,
      score: benchmark.benchmark_score,
      averages: { rating: benchmark.avg_rating, reviews: benchmark.avg_reviews, photos: benchmark.avg_photos },
      gaps: { rating: benchmark.rating_gap, reviews: benchmark.reviews_gap, photos: benchmark.photos_gap },
      percentiles: { rating: benchmark.rating_percentile, reviews: benchmark.reviews_percentile, photos: benchmark.photos_percentile },
      topCompetitor: {
        name: benchmark.top_competitor_name,
        rating: benchmark.top_competitor_rating,
        reviews: benchmark.top_competitor_reviews,
      },
      completedAt: updatedAt,
    },
    timestamps: { ...analysis.timestamps, updatedAt, benchmarkCompletedAt: updatedAt },
  });
  if (!state) {
    return technicalFailure({
      phase: "search_refresh_validation",
      errorCode: "ANALYSIS_READ_FAILED",
      status: 500,
    });
  }
  const competitiveDataChanged = competitiveResultChanged(analysis, result, benchmark);
  try {
    const analysisUpdate = db.prepare(`
      UPDATE analyses
      SET search_query = ?, local_position = ?, competitors_json = ?, normalized_json = ?, fiche_json = ?,
          benchmark_score = ?, avg_rating = ?, avg_reviews = ?, avg_photos = ?,
          rating_gap = ?, reviews_gap = ?, photos_gap = ?, rating_percentile = ?,
          reviews_percentile = ?, photos_percentile = ?, top_competitor_name = ?,
          top_competitor_rating = ?, top_competitor_reviews = ?, benchmark_completed_at = ?,
          updated_at = ?
      WHERE analysis_id = ? AND report_type = 'free' AND status = ?
    `).bind(
      result.requete,
      result.position,
      competitorsJson,
      JSON.stringify(normalizedWithContext),
      JSON.stringify(ficheWithCategories),
      benchmark.benchmark_score,
      benchmark.avg_rating,
      benchmark.avg_reviews,
      benchmark.avg_photos,
      benchmark.rating_gap,
      benchmark.reviews_gap,
      benchmark.photos_gap,
      benchmark.rating_percentile,
      benchmark.reviews_percentile,
      benchmark.photos_percentile,
      benchmark.top_competitor_name,
      benchmark.top_competitor_rating,
      benchmark.top_competitor_reviews,
      updatedAt,
      updatedAt,
      analysisId,
      analysis.status,
    );
    if (competitiveDataChanged && typeof db.batch === "function") {
      // D1 exécute batch() transactionnellement : les nouveaux résultats et
      // le drapeau éditorial deviennent visibles ensemble, jamais à moitié.
      const narrativeReviewUpdate = db.prepare(`
        UPDATE report_narrative_overrides
        SET needs_review = 1
        WHERE analysis_id = ?
      `).bind(analysisId);
      await db.batch([analysisUpdate, narrativeReviewUpdate]);
    } else {
      await analysisUpdate.run();
      // Adaptateur de tests/anciens environnements sans batch(). La
      // Production D1 suit toujours le chemin transactionnel ci-dessus.
      if (competitiveDataChanged) await markReportNarrativeOverridesForCurrentContext(db, analysisId);
    }
  } catch (error) {
    return technicalFailure({
      phase: "search_refresh_update",
      errorCode: "ANALYSIS_UPDATE_FAILED",
      status: 500,
      error,
    });
  }

  return jsonResponse({
    success: true,
    analysisId,
    status: analysis.status,
    reportType: "free",
    operation: "refresh_search",
    competitiveDataChanged,
    searchAnalyzedAt: updatedAt,
    ...state,
  }, 200, { "Cache-Control": "no-store" });
}

async function clearFailedCollection(db, analysisId, { company, city, activity }) {
  await db.prepare(`
    UPDATE analyses
    SET nom = ?, ville = ?, place_id = NULL, name = NULL, rating = NULL, reviews = NULL,
        photos_count = NULL, description_length = NULL, activity = ?, search_query = NULL,
        local_position = NULL, competitors_json = '[]', fiche_json = NULL,
        normalized_json = NULL, updated_at = ?
    WHERE analysis_id = ? AND report_type = 'free' AND status = 'awaiting_review'
  `).bind(
    company || "Fiche Google transmise",
    city || VILLE_PLACEHOLDER,
    activity || null,
    new Date().toISOString(),
    analysisId,
  ).run();
}

export const onRequestOptions = () => onOptions();

export async function onRequestPost(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  }

  const db = requireOrdersDb(context.env);
  const analysis = await loadAnalysisById(db, analysisId);
  if (!analysis) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  if (analysis.reportType !== "free") {
    return jsonResponse({ success: false, error: "FREE_DIAGNOSTIC_REQUIRED" }, 409);
  }
  let payload = {};
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  }
  const searchRefresh = normalizeSearchRefreshPayload(payload);
  if (searchRefresh === false) {
    return jsonResponse({ success: false, error: "INVALID_SEARCH_REFRESH" }, 400);
  }
  const allowedStatus = searchRefresh
    ? isRefreshableFreeDiagnosticStatus(analysis.status)
    : analysis.status === "awaiting_review";
  if (!allowedStatus) {
    return jsonResponse({ success: false, error: "DIAGNOSTIC_NOT_AWAITING_REVIEW" }, 409);
  }

  const diagnosticRequest = await db.prepare(`
    SELECT company_name, city, google_business_url
    FROM diagnostic_requests
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
  const manualMetadata = diagnosticRequest ? null : await loadManualAuditMetadata(db, analysisId);
  // Accepte les brouillons gratuits créés manuellement par un admin
  // (admin_manual) ET ceux créés par duplication d'un questionnaire déjà
  // finalisé (duplicate_manual) — les deux sont des créations manuelles
  // légitimes au sens de auditCreationMetadata.js. Ne jamais recopier ici
  // la liste des sources : passer par isManualCreationSource().
  const isManualFree = isManualCreationSource(manualMetadata?.creation_source)
    && manualMetadata?.audit_type === "free";
  if (!diagnosticRequest && !isManualFree) {
    return jsonResponse({ success: false, error: "DIAGNOSTIC_REQUEST_REQUIRED" }, 403);
  }
  if (searchRefresh) {
    if (!buildFreeDiagnosticCollectionState(analysis)) {
      return jsonResponse({ success: false, error: "INITIAL_COLLECTION_REQUIRED" }, 409);
    }
    return refreshSearchAnalysis({ context, db, analysis, analysisId, payload: searchRefresh });
  }

  // La création administrative passe déjà par /api/analyze puis /api/benchmark.
  // Si ces données sont exploitables, le bouton de l'ancien questionnaire ne
  // doit ni rappeler le fournisseur, ni réécrire l'analyse. Ce court-circuit
  // rend aussi les retries et doubles clics séquentiels idempotents.
  const existingCollectionState = buildFreeDiagnosticCollectionState(analysis);
  if (existingCollectionState) {
    return jsonResponse({
      success: true,
      analysisId,
      status: analysis.status,
      reportType: "free",
      alreadyCollected: true,
      ...existingCollectionState,
    }, 200, { "Cache-Control": "no-store" });
  }

  const manualActivity = normalizeText(payload?.activity).slice(0, 160);
  const googleBusinessUrl = normalizeText(diagnosticRequest?.google_business_url);
  const requestedCompany = usableText(diagnosticRequest?.company_name)
    || usableText(analysis.business?.name)
    || usableText(analysis.business?.nom);
  const requestedCity = usableText(diagnosticRequest?.city)
    || usableText(analysis.business?.ville);

  const ficheResult = await collectFiche({
    nom: googleBusinessUrl ? "" : requestedCompany,
    ville: googleBusinessUrl ? "" : requestedCity,
    queryOverride: googleBusinessUrl || "",
    apiKey: context.env.OUTSCRAPER_API_KEY,
    suppressSensitiveLogs: true,
  });
  if (!ficheResult.ok) {
    const notFound = ficheResult.code === 404;
    if (notFound) {
      console.error("free-diagnostic-collect: failed", {
        phase: "business_collection",
        error_code: "GOOGLE_BUSINESS_NOT_FOUND",
      });
      try {
        await clearFailedCollection(db, analysisId, {
          company: requestedCompany,
          city: requestedCity,
          activity: manualActivity,
        });
      } catch (error) {
        return technicalFailure({
          phase: "analysis_cleanup",
          errorCode: "ANALYSIS_UPDATE_FAILED",
          status: 500,
          error,
        });
      }
      return businessNotFoundFailure();
    }
    return technicalFailure({
      phase: "business_collection",
      errorCode: "BUSINESS_COLLECTION_FAILED",
      status: 502,
    });
  }

  const fiche = ficheResult.fiche || {};
  const normalized = normalizeFiche(fiche);
  if (!isCollectedFiche(normalized)) {
    console.error("free-diagnostic-collect: failed", {
      phase: "business_validation",
      error_code: "GOOGLE_BUSINESS_NOT_FOUND",
    });
    try {
      await clearFailedCollection(db, analysisId, {
        company: requestedCompany,
        city: requestedCity,
        activity: manualActivity,
      });
    } catch (error) {
      return technicalFailure({
        phase: "analysis_cleanup",
        errorCode: "ANALYSIS_UPDATE_FAILED",
        status: 500,
        error,
      });
    }
    return businessNotFoundFailure();
  }
  const company = usableText(normalized.name) || requestedCompany || "Fiche Google transmise";
  const city = usableText(normalized.city)
    || usableText(normalized.borough)
    || requestedCity;
  const activity = usableText(normalized.category)
    || usableText(normalized.type)
    || manualActivity;

  // Source commune (mission "ancrage géographique") : la collecte
  // automatique initiale utilise exactement le même résolveur et les mêmes
  // paramètres que la relance (refreshSearchAnalysis ci-dessus) — jamais une
  // seconde implémentation divergente. Comme pour la relance, `activity`
  // (jamais réécrite) n'est pas modifiée par cet ancrage.
  //
  // Correctif (revue "corriger la méthode d'ancrage géographique", point 1) :
  // la recherche concurrentielle initiale est désormais strictement bloquée
  // en l'absence d'ancrage fiable, exactement comme la relance — plus
  // jamais de recherche "à l'aveugle" ni, a fortiori, un repli sur les
  // coordonnées de l'entreprise analysée ou sur un simple paramètre
  // "region" (ce repli n'existe structurellement plus, voir
  // geographicAnchor.js/localityGeocoder.js). Sans ancrage résolu,
  // l'identification de la fiche reste créée (utile pour la validation
  // manuelle), mais aucun appel concurrentiel n'a lieu, aucune position ni
  // aucun concurrent n'est écrit, et aucun `geographic_anchor` n'est
  // mémorisé — ce qui signale correctement (voir Point 1 /
  // hasExistingCompetitiveResults) que la recherche devra être (re)lancée
  // via une relance, elle-même bloquée tant que le centre de la localité
  // n'est pas confirmé, et que la finalisation
  // (GEOGRAPHIC_ANCHOR_MISSING_FOR_EXISTING_RESULTS) reste bloquée tant que
  // cette relance n'a pas eu lieu.
  const initialAnchor = await resolveGeographicAnchor({ normalized, fiche, apiKey: context.env.OUTSCRAPER_API_KEY });
  const updatedAt = new Date().toISOString();

  let competitorData = { requete: "", position: null, concurrents: [] };
  if (activity && city && initialAnchor.ok) {
    const competitorResult = await collectCompetitors({
      activite: activity,
      ville: city,
      placeIdCible: normalized.place_id,
      cidCible: normalized.cid,
      urlCible: normalized.location_link,
      coordinates: initialAnchor.coordinates,
      region: initialAnchor.region,
      apiKey: context.env.OUTSCRAPER_API_KEY,
      suppressSensitiveLogs: true,
    });
    if (competitorResult.ok) {
      competitorData = {
        requete: competitorResult.requete,
        position: competitorResult.position,
        concurrents: competitorResult.concurrents,
        positionKind: competitorResult.positionKind,
        sponsoredResultsExcluded: competitorResult.sponsoredResultsExcluded,
        rankEvidence: competitorResult.rankEvidence,
      };
    }
  }

  const normalizedWithConfirmedActivity = {
    ...normalized,
    ...(manualActivity ? { confirmed_activity: manualActivity } : {}),
    // Ancrage mémorisé uniquement quand une recherche a réellement été
    // lancée avec cet ancrage (activity && city && competitorResult.ok) —
    // jamais persisté "au cas où", jamais pour une recherche qui n'a pas eu
    // lieu ou a échoué.
    ...(initialAnchor.ok && competitorData.requete
      ? { geographic_anchor: buildGeographicAnchorRecord(initialAnchor, updatedAt) }
      : {}),
  };
  const competitorsJson = JSON.stringify(competitorData.concurrents);
  const benchmark = benchmarkEngine({
    rating: normalized.rating,
    reviews: normalized.reviews,
    photos_count: normalized.photos_count,
    competitors_json: competitorsJson,
  });
  try {
    await db.prepare(`
      UPDATE analyses
      SET nom = ?, ville = ?, place_id = ?, name = ?, rating = ?, reviews = ?,
          photos_count = ?, description_length = ?, activity = ?, search_query = ?,
          local_position = ?, competitors_json = ?, fiche_json = ?, normalized_json = ?,
          benchmark_score = ?, avg_rating = ?, avg_reviews = ?, avg_photos = ?,
          rating_gap = ?, reviews_gap = ?, photos_gap = ?, rating_percentile = ?,
          reviews_percentile = ?, photos_percentile = ?, top_competitor_name = ?,
          top_competitor_rating = ?, top_competitor_reviews = ?, benchmark_completed_at = ?,
          updated_at = ?
      WHERE analysis_id = ? AND report_type = 'free' AND status = 'awaiting_review'
    `).bind(
      company,
      city,
      normalized.place_id || null,
      normalized.name || null,
      normalized.rating,
      normalized.reviews,
      normalized.photos_count,
      normalized.description_length,
      activity || null,
      competitorData.requete || null,
      competitorData.position,
      competitorsJson,
      JSON.stringify(fiche),
      JSON.stringify(addSearchResultContext(normalizedWithConfirmedActivity, competitorData)),
      benchmark.benchmark_score,
      benchmark.avg_rating,
      benchmark.avg_reviews,
      benchmark.avg_photos,
      benchmark.rating_gap,
      benchmark.reviews_gap,
      benchmark.photos_gap,
      benchmark.rating_percentile,
      benchmark.reviews_percentile,
      benchmark.photos_percentile,
      benchmark.top_competitor_name,
      benchmark.top_competitor_rating,
      benchmark.top_competitor_reviews,
      updatedAt,
      updatedAt,
      analysisId,
    ).run();
    await markReportNarrativeOverridesForCurrentContext(db, analysisId);
  } catch (error) {
    return technicalFailure({
      phase: "analysis_update",
      errorCode: "ANALYSIS_UPDATE_FAILED",
      status: 500,
      error,
    });
  }

  let updatedAnalysis = null;
  try {
    updatedAnalysis = await loadAnalysisById(db, analysisId);
  } catch (error) {
    return technicalFailure({
      phase: "analysis_reload",
      errorCode: "ANALYSIS_READ_FAILED",
      status: 500,
      error,
    });
  }
  const collectionState = buildFreeDiagnosticCollectionState(updatedAnalysis);
  if (!collectionState) {
    return technicalFailure({
      phase: "analysis_validation",
      errorCode: "ANALYSIS_UPDATE_FAILED",
      status: 500,
    });
  }

  return jsonResponse({
    success: true,
    analysisId,
    status: analysis.status,
    reportType: "free",
    ...collectionState,
  }, 200, { "Cache-Control": "no-store" });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

export const __test__ = {
  normalizeFiche, usableText, isCollectedFiche, mergeCategoryObservation,
  geographicAnchorUnavailableFailure,
};
