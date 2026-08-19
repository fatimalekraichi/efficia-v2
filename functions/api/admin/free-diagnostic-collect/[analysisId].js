import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import { collectFiche } from "../../../lib/collectFiche.js";
import { collectCompetitors } from "../../../lib/collectCompetitors.js";
import { buildFreeDiagnosticCollectionState } from "../../../lib/freeDiagnosticProductionLink.js";

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
    observed_fields: Array.isArray(fiche.observed_fields) ? fiche.observed_fields : [],
    ...(Array.isArray(fiche.observed_fields) && fiche.observed_fields.includes("services")
      ? { services: Array.isArray(fiche.services) ? fiche.services : [] }
      : {}),
  };
}

function safeFailure(errorCode, status = 502) {
  return jsonResponse({
    success: false,
    error: errorCode,
    message: "La collecte n’a pas pu être terminée. Réessayez dans quelques instants.",
  }, status, { "Cache-Control": "no-store" });
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
  if (analysis.status !== "awaiting_review") {
    return jsonResponse({ success: false, error: "DIAGNOSTIC_NOT_AWAITING_REVIEW" }, 409);
  }

  const diagnosticRequest = await db.prepare(`
    SELECT company_name, city, google_business_url
    FROM diagnostic_requests
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
  if (!diagnosticRequest) {
    return jsonResponse({ success: false, error: "DIAGNOSTIC_REQUEST_REQUIRED" }, 403);
  }

  let payload = {};
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  }
  const manualActivity = normalizeText(payload?.activity).slice(0, 160);
  const googleBusinessUrl = normalizeText(diagnosticRequest.google_business_url);
  const requestedCompany = usableText(diagnosticRequest.company_name)
    || usableText(analysis.business?.name)
    || usableText(analysis.business?.nom);
  const requestedCity = usableText(diagnosticRequest.city)
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
    console.error("free-diagnostic-collect: failed", {
      phase: "business_collection",
      error_code: notFound ? "GOOGLE_BUSINESS_NOT_FOUND" : "BUSINESS_COLLECTION_FAILED",
    });
    if (notFound) {
      try {
        await clearFailedCollection(db, analysisId, {
          company: requestedCompany,
          city: requestedCity,
          activity: manualActivity,
        });
      } catch (error) {
        console.error("free-diagnostic-collect: failed", {
          phase: "analysis_cleanup",
          error_code: "ANALYSIS_UPDATE_FAILED",
          name: typeof error?.name === "string" ? error.name : "Error",
        });
        return safeFailure("ANALYSIS_UPDATE_FAILED", 500);
      }
      return businessNotFoundFailure();
    }
    return safeFailure("BUSINESS_COLLECTION_FAILED", 502);
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
      console.error("free-diagnostic-collect: failed", {
        phase: "analysis_cleanup",
        error_code: "ANALYSIS_UPDATE_FAILED",
        name: typeof error?.name === "string" ? error.name : "Error",
      });
      return safeFailure("ANALYSIS_UPDATE_FAILED", 500);
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

  let competitorData = { requete: "", position: null, concurrents: [] };
  if (activity && city) {
    const competitorResult = await collectCompetitors({
      activite: activity,
      ville: city,
      placeIdCible: normalized.place_id,
      cidCible: normalized.cid,
      urlCible: normalized.location_link,
      apiKey: context.env.OUTSCRAPER_API_KEY,
      suppressSensitiveLogs: true,
    });
    if (competitorResult.ok) {
      competitorData = {
        requete: competitorResult.requete,
        position: competitorResult.position,
        concurrents: competitorResult.concurrents,
      };
    }
  }

  const updatedAt = new Date().toISOString();
  try {
    await db.prepare(`
      UPDATE analyses
      SET nom = ?, ville = ?, place_id = ?, name = ?, rating = ?, reviews = ?,
          photos_count = ?, description_length = ?, activity = ?, search_query = ?,
          local_position = ?, competitors_json = ?, fiche_json = ?, normalized_json = ?,
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
      JSON.stringify(competitorData.concurrents),
      JSON.stringify(fiche),
      JSON.stringify(normalized),
      updatedAt,
      analysisId,
    ).run();
  } catch (error) {
    console.error("free-diagnostic-collect: failed", {
      phase: "analysis_update",
      error_code: "ANALYSIS_UPDATE_FAILED",
      name: typeof error?.name === "string" ? error.name : "Error",
    });
    return safeFailure("ANALYSIS_UPDATE_FAILED", 500);
  }

  let updatedAnalysis = null;
  try {
    updatedAnalysis = await loadAnalysisById(db, analysisId);
  } catch (error) {
    console.error("free-diagnostic-collect: failed", {
      phase: "analysis_reload",
      error_code: "ANALYSIS_READ_FAILED",
      name: typeof error?.name === "string" ? error.name : "Error",
    });
    return safeFailure("ANALYSIS_READ_FAILED", 500);
  }
  const collectionState = buildFreeDiagnosticCollectionState(updatedAnalysis);
  if (!collectionState) return safeFailure("ANALYSIS_UPDATE_FAILED", 500);

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

export const __test__ = { normalizeFiche, usableText, isCollectedFiche };
