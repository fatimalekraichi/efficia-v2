import { isAdminSessionValid } from "../admin/_shared.js";
import { loadManualAuditMetadata } from "./auditCreationMetadata.js";

export const PREMIUM_AUDIT_OFFERS = new Set(["audit", "visibility", "performance"]);

const normalizeCode = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

export function isPremiumAuditOffer(value) {
  return PREMIUM_AUDIT_OFFERS.has(normalizeCode(value));
}

function rowIsAuthorized(row) {
  return row?.status === "paid"
    && (isPremiumAuditOffer(row.offer_code) || Number(row.has_authorized_item) === 1);
}

async function findByAnalysisOrder(db, analysisId) {
  return db.prepare(`
    SELECT o.order_id, o.status, o.offer_code, o.email, o.first_name,
           o.company_name, o.city, o.google_business_url, t.task_id,
           EXISTS (
             SELECT 1
             FROM order_items oi
             WHERE oi.order_id = o.order_id
               AND oi.offer_code IN ('audit', 'visibility', 'performance')
           ) AS has_authorized_item
    FROM analyses a
    JOIN orders o ON o.order_id = a.order_id
    LEFT JOIN order_tasks t
      ON t.order_id = o.order_id
     AND t.analysis_id = a.analysis_id
    WHERE a.analysis_id = ?
      AND o.status = 'paid'
      AND (
        o.offer_code IN ('audit', 'visibility', 'performance')
        OR EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.order_id = o.order_id
            AND oi.offer_code IN ('audit', 'visibility', 'performance')
        )
      )
    LIMIT 1
  `).bind(analysisId).first();
}

async function findByAnalysisTask(db, analysisId) {
  return db.prepare(`
    SELECT o.order_id, o.status, o.offer_code, o.email, o.first_name,
           o.company_name, o.city, o.google_business_url, t.task_id,
           EXISTS (
             SELECT 1
             FROM order_items oi
             WHERE oi.order_id = o.order_id
               AND oi.offer_code IN ('audit', 'visibility', 'performance')
           ) AS has_authorized_item
    FROM order_tasks t
    JOIN orders o ON o.order_id = t.order_id
    WHERE t.analysis_id = ?
      AND o.status = 'paid'
      AND (
        o.offer_code IN ('audit', 'visibility', 'performance')
        OR EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.order_id = o.order_id
            AND oi.offer_code IN ('audit', 'visibility', 'performance')
        )
      )
    ORDER BY o.created_at DESC
    LIMIT 1
  `).bind(analysisId).first();
}

/**
 * Une autorisation Premium exige une liaison D1 explicite avec l'analyse,
 * une commande payée et une offre qui comprend réellement l'audit.
 * Toute donnée absente, inconnue ou incohérente produit un refus fermé.
 */
export async function loadPremiumAuthorization(db, analysisId) {
  const byAnalysis = await findByAnalysisOrder(db, analysisId);
  if (rowIsAuthorized(byAnalysis)) return { allowed: true, order: byAnalysis };

  const byTask = await findByAnalysisTask(db, analysisId);
  if (rowIsAuthorized(byTask)) return { allowed: true, order: byTask };

  return { allowed: false, order: null };
}

export async function loadAdminPremiumAuthorization(db, analysisId) {
  const paid = await loadPremiumAuthorization(db, analysisId);
  if (paid.allowed) return { ...paid, authorizationType: "paid" };
  const metadata = await loadManualAuditMetadata(db, analysisId);
  const manualAllowed = metadata?.audit_type === "premium"
    && metadata?.billing_status === "manual_unpaid";
  return manualAllowed
    ? { allowed: true, order: null, authorizationType: "admin_manual" }
    : { allowed: false, order: null, authorizationType: null };
}

export async function loadPaidPremiumOrder(db, orderId) {
  if (!orderId) return null;
  const row = await db.prepare(`
    SELECT o.order_id, o.status, o.offer_code,
           EXISTS (
             SELECT 1
             FROM order_items oi
             WHERE oi.order_id = o.order_id
               AND oi.offer_code IN ('audit', 'visibility', 'performance')
           ) AS has_authorized_item
    FROM orders o
    WHERE o.order_id = ?
    LIMIT 1
  `).bind(orderId).first();
  return rowIsAuthorized(row) ? row : null;
}

export async function requirePremiumAnalysisAuthorization(context, db, analysis) {
  if (analysis?.reportType === "free" || analysis?.report_type === "free") {
    return { ok: true, premium: false, order: null };
  }

  if (!await isAdminSessionValid(context.request, context.env)) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const authorization = await loadAdminPremiumAuthorization(
    db,
    analysis?.analysisId || analysis?.analysis_id || "",
  );
  if (!authorization.allowed) {
    return { ok: false, status: 403, error: "PREMIUM_NOT_AUTHORIZED" };
  }

  return { ok: true, premium: true, order: authorization.order };
}
