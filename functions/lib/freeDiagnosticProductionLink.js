// Construit le lien vers l'ancien générateur gratuit (outil-score-efficia-auto-v5.html
// exact, extrait de main sans modification, servi statiquement depuis
// /admin/free-diagnostic-production/). Ce module lit les tables `orders` /
// `order_tasks` (inchangées, non modifiées par cette mission) pour retrouver
// les paramètres déjà disponibles lors de la commande, avec repli sur les
// données de l'analyse elle-même si aucune commande n'est liée.

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

/**
 * Construit la query string (sans "?") pour /admin/free-diagnostic-production/.
 * Réutilise les paramètres déjà disponibles dans la commande liée, avec repli
 * sur les données de l'analyse (business.nom, business.ville, etc.) quand
 * l'analyse n'est pas liée à une commande.
 */
export function buildFreeDiagnosticProductionQuery(analysis, orderContext) {
  const business = analysis?.business || {};
  const normalized = business.normalized || {};
  const params = new URLSearchParams();

  const set = (key, value) => {
    const text = firstNonEmpty(value);
    if (text) params.set(key, text);
  };

  set("company", firstNonEmpty(orderContext?.company_name, business.nom, business.name));
  set("city", firstNonEmpty(orderContext?.city, business.ville));
  set("firstName", orderContext?.first_name);
  set("email", orderContext?.email);
  set("offer", orderContext?.offer_code);
  set("orderId", orderContext?.order_id);
  set("taskId", orderContext?.task_id);
  set("googleBusinessUrl", firstNonEmpty(
    orderContext?.google_business_url,
    normalized.google_url,
    normalized.url,
    normalized.place_link,
    normalized.location_link,
  ));

  return params.toString();
}
