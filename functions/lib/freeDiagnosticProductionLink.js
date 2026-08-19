// Charge côté serveur le contexte de l'ancien générateur gratuit. Les données
// personnelles ne doivent jamais être sérialisées dans son URL.

import { loadDiagnosticRequestContext } from "./diagnosticRequests.js";

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
    const byTask = await db.prepare(`
      SELECT o.order_id, o.email, o.first_name, o.company_name, o.city, o.google_business_url,
             o.offer_code, o.status, t.task_id
      FROM order_tasks t
      JOIN orders o ON o.order_id = t.order_id
      WHERE t.analysis_id = ?
      LIMIT 1
    `).bind(analysisId).first();
    if (byTask?.status === "paid") paidOrder = byTask;
  } catch (error) {
    console.error("freeDiagnosticProductionLink: read failed", {
      phase: "order_task",
      name: typeof error?.name === "string" ? error.name : "Error",
    });
  }

  try {
    if (paidOrder) return { diagnosticRequest, paidOrder };
    const byOrder = await db.prepare(`
      SELECT o.order_id, o.email, o.first_name, o.company_name, o.city, o.google_business_url,
             o.offer_code, o.status, t.task_id
      FROM analyses a
      JOIN orders o ON o.order_id = a.order_id
      LEFT JOIN order_tasks t ON t.order_id = o.order_id
      WHERE a.analysis_id = ?
      LIMIT 1
    `).bind(analysisId).first();
    if (byOrder?.status === "paid") paidOrder = byOrder;
  } catch (error) {
    console.error("freeDiagnosticProductionLink: read failed", {
      phase: "analysis_order",
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
    googleBusinessUrl,
  };
}
