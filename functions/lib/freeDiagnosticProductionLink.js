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
  try {
    const diagnosticRequest = await loadDiagnosticRequestContext(db, analysisId);
    if (diagnosticRequest) return diagnosticRequest;
  } catch (error) {
    console.error("freeDiagnosticProductionLink: lecture diagnostic_requests impossible", error);
  }

  try {
    const byTask = await db.prepare(`
      SELECT o.order_id, o.email, o.first_name, o.company_name, o.city, o.google_business_url, o.offer_code, t.task_id
      FROM order_tasks t
      JOIN orders o ON o.order_id = t.order_id
      WHERE t.analysis_id = ?
      LIMIT 1
    `).bind(analysisId).first();
    if (byTask) return byTask;
  } catch (error) {
    console.error("freeDiagnosticProductionLink: lecture order_tasks impossible", error);
  }

  try {
    const byOrder = await db.prepare(`
      SELECT o.order_id, o.email, o.first_name, o.company_name, o.city, o.google_business_url, o.offer_code, t.task_id
      FROM analyses a
      JOIN orders o ON o.order_id = a.order_id
      LEFT JOIN order_tasks t ON t.order_id = o.order_id
      WHERE a.analysis_id = ?
      LIMIT 1
    `).bind(analysisId).first();
    return byOrder || null;
  } catch (error) {
    console.error("freeDiagnosticProductionLink: lecture analyses/orders impossible", error);
    return null;
  }
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

  return {
    company: firstNonEmpty(orderContext?.company_name, business.nom, business.name),
    city: firstNonEmpty(orderContext?.city, business.ville),
    firstName: firstNonEmpty(orderContext?.first_name),
    email: firstNonEmpty(orderContext?.email),
    offer: firstNonEmpty(orderContext?.offer_code),
    orderId: firstNonEmpty(orderContext?.order_id),
    taskId: firstNonEmpty(orderContext?.task_id),
    googleBusinessUrl: firstNonEmpty(
      orderContext?.google_business_url,
      normalized.google_url,
      normalized.url,
      normalized.place_link,
      normalized.location_link,
    ),
  };
}
