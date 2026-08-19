// Charge côté serveur le contexte de l'ancien générateur gratuit. Les données
// personnelles ne doivent jamais être sérialisées dans son URL.

import { loadDiagnosticRequestContext } from "./diagnosticRequests.js";
import { loadPremiumAuthorization } from "./premiumAuthorization.js";
import { buildScorePrefill } from "./score-efficia/scoreCatalog.js";

/**
 * Recherche la commande et la tâche liées à une analyse.
 * Deux chemins possibles, sans jamais modifier le schéma D1 :
 *  1. order_tasks.analysis_id = analysisId (lien direct tâche → analyse) ;
 *  2. analyses.order_id → orders.order_id (lien direct analyse → commande),
 *     avec tâche associée si elle existe.
 * Retourne null si aucune commande n'est liée (analyse créée hors tunnel de
 * commande) : le lien utilisera alors uniquement les données de l'analyse.
 */
export async function loadOrderContextForAnalysis(db, analysisId) {
  let diagnosticRequest = null;
  try {
    diagnosticRequest = await loadDiagnosticRequestContext(db, analysisId);
  } catch (error) {
    console.error("freeDiagnosticProductionLink: read failed", {
      phase: "diagnostic_request",
      name: typeof error?.name === "string" ? error.name : "Error",
    });
  }

  let paidOrder = null;
  try {
    const authorization = await loadPremiumAuthorization(db, analysisId);
    paidOrder = authorization.allowed ? authorization.order : null;
  } catch (error) {
    console.error("freeDiagnosticProductionLink: read failed", {
      phase: "premium_authorization",
      name: typeof error?.name === "string" ? error.name : "Error",
    });
  }

  return { diagnosticRequest, paidOrder };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value);
  }
  return "";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function analysisWithCollectedBenchmark(analysis) {
  const competitors = Array.isArray(analysis?.business?.competitors) ? analysis.business.competitors : [];
  if (!competitors.length) return analysis;

  const average = (key) => {
    const values = competitors.map((item) => numberOrNull(item?.[key])).filter((value) => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const averages = {
    rating: numberOrNull(analysis?.benchmark?.averages?.rating) ?? average("rating"),
    reviews: numberOrNull(analysis?.benchmark?.averages?.reviews) ?? average("reviews"),
    photos: numberOrNull(analysis?.benchmark?.averages?.photos) ?? average("photos_count"),
  };
  const gap = (businessValue, averageValue, savedGap) => {
    const existing = numberOrNull(savedGap);
    if (existing !== null) return existing;
    const observed = numberOrNull(businessValue);
    return observed !== null && averageValue !== null ? observed - averageValue : null;
  };

  return {
    ...analysis,
    benchmark: {
      ...(analysis.benchmark || {}),
      averages,
      gaps: {
        rating: gap(analysis.business?.rating, averages.rating, analysis?.benchmark?.gaps?.rating),
        reviews: gap(analysis.business?.reviews, averages.reviews, analysis?.benchmark?.gaps?.reviews),
        photos: gap(analysis.business?.photosCount, averages.photos, analysis?.benchmark?.gaps?.photos),
      },
    },
  };
}

export function buildFreeDiagnosticCollectionState(analysis) {
  const business = analysis?.business || {};
  const normalized = business.normalized || {};
  const fiche = business.fiche || {};
  const company = firstNonEmpty(business.name, normalized.name, fiche.name, business.nom);
  const placeId = firstNonEmpty(business.placeId, normalized.place_id, fiche.place_id);
  const validPlaceId = Boolean(placeId && !/^__[^_]+(?:_[^_]+)*__$/.test(placeId));
  if (!company || !validPlaceId) return null;

  // Le moteur historique attend un benchmark (moyennes + écarts). Le parcours
  // gratuit persiste déjà le panel brut : on adapte ces données au contrat du
  // moteur, sans relancer le fournisseur et sans créer une seconde formule.
  const scorePrefill = buildScorePrefill(analysisWithCollectedBenchmark(analysis));

  return {
    business: {
      company,
      city: firstNonEmpty(normalized.city, normalized.borough, fiche.city, fiche.borough, business.ville),
      activity: firstNonEmpty(normalized.category, normalized.type, fiche.category, fiche.type, business.activity),
      activitySource: firstNonEmpty(normalized.category, normalized.type, fiche.category, fiche.type) ? "detected" : "manual",
      rating: numberOrNull(business.rating),
      reviews: numberOrNull(business.reviews),
      photosCount: numberOrNull(business.photosCount),
      descriptionLength: numberOrNull(business.descriptionLength),
      localPosition: numberOrNull(business.localPosition),
      searchQuery: firstNonEmpty(business.searchQuery),
      competitors: (Array.isArray(business.competitors) ? business.competitors : []).map((competitor) => ({
        name: firstNonEmpty(competitor?.name),
        rating: numberOrNull(competitor?.rating),
        reviews: numberOrNull(competitor?.reviews),
        photos_count: numberOrNull(competitor?.photos_count),
      })),
    },
    scorePrefill,
  };
}

export function buildFreeDiagnosticProductionContext(analysis, orderContext) {
  const business = analysis?.business || {};
  const normalized = business.normalized || {};
  const fiche = business.fiche || {};
  const diagnosticRequest = orderContext?.diagnosticRequest || {};
  const paidOrder = orderContext?.paidOrder || null;
  const isUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
  const usableText = (...values) => firstNonEmpty(...values.filter((value) => (
    value !== "Non renseignée" && !isUrl(value)
  )));

  const detectedCompany = usableText(business.name, normalized.name, fiche.name, business.nom);
  const providedCompany = usableText(diagnosticRequest.company_name);
  const googleBusinessUrl = firstNonEmpty(
    diagnosticRequest.google_business_url,
    paidOrder?.google_business_url,
    normalized.google_url,
    normalized.url,
    normalized.place_link,
    normalized.location_link,
  );
  const company = detectedCompany || providedCompany || (googleBusinessUrl ? "Fiche Google transmise" : "");
  const placeId = firstNonEmpty(business.placeId, normalized.place_id, fiche.place_id);
  const validPlaceId = Boolean(placeId && !/^__[^_]+(?:_[^_]+)*__$/.test(placeId));
  const collectionAvailable = Boolean(detectedCompany && validPlaceId);
  const city = usableText(
    normalized.city,
    normalized.borough,
    fiche.city,
    fiche.borough,
    diagnosticRequest.city,
    business.ville,
  );
  const activity = usableText(
    normalized.category,
    normalized.type,
    fiche.category,
    fiche.type,
  );
  const premiumAllowed = Boolean(paidOrder?.status === "paid");
  const collectionState = buildFreeDiagnosticCollectionState(analysis);

  return {
    requestType: "free_diagnostic",
    company,
    companySource: detectedCompany ? "detected" : (providedCompany ? "provided" : "google_url"),
    city,
    citySource: city && (normalized.city || normalized.borough || fiche.city || fiche.borough)
      ? "detected"
      : (city ? "provided" : "missing"),
    activity,
    activitySource: activity ? "detected" : "missing",
    firstName: firstNonEmpty(diagnosticRequest.first_name, paidOrder?.first_name),
    email: firstNonEmpty(diagnosticRequest.email, paidOrder?.email),
    offer: premiumAllowed ? firstNonEmpty(paidOrder?.offer_code) : "free",
    orderId: premiumAllowed ? firstNonEmpty(paidOrder?.order_id) : "",
    taskId: premiumAllowed ? firstNonEmpty(paidOrder?.task_id) : "",
    premiumAllowed,
    collectionAvailable,
    ...(collectionState ? {
      collection: collectionState.business,
      scorePrefill: collectionState.scorePrefill,
    } : {}),
  };
}
