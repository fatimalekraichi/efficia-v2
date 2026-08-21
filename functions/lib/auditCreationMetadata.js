const MANUAL_SOURCES = new Set(["admin_manual", "duplicate_manual"]);

export const manualBillingStatus = (auditType) => (
  auditType === "premium" ? "manual_unpaid" : "not_applicable"
);

export function formatAuditCommercialLabel({ report_type, creation_source, billing_status, paid_order } = {}) {
  const reportType = report_type === "free" ? "free" : "premium";
  const manual = MANUAL_SOURCES.has(creation_source);
  if (manual && reportType === "free") return "Gratuit manuel";
  if (manual && reportType === "premium" && billing_status === "manual_unpaid") return "Premium manuel";
  if (reportType === "premium" && Number(paid_order) === 1) return "Premium payé";
  return reportType === "free" ? "Diagnostic gratuit" : "Audit Premium";
}

export async function loadManualAuditMetadata(db, analysisId) {
  if (!analysisId) return null;
  return db.prepare(`
    SELECT analysis_id, creation_source, audit_type, billing_status, request_status
    FROM audit_creation_metadata
    WHERE analysis_id = ? AND request_status = 'completed'
    LIMIT 1
  `).bind(analysisId).first();
}

export async function reserveManualAuditCreation(db, { idempotencyKey, auditType }) {
  const now = new Date().toISOString();
  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES (?, NULL, 'admin_manual', ?, ?, 'pending', ?, ?)
  `).bind(idempotencyKey, auditType, manualBillingStatus(auditType), now, now).run();

  if (!inserted?.meta || Number(inserted.meta.changes || 0) === 1) return { acquired: true, analysisId: null };

  const existing = await db.prepare(`
    SELECT analysis_id, audit_type, request_status
    FROM audit_creation_metadata
    WHERE idempotency_key = ?
    LIMIT 1
  `).bind(idempotencyKey).first();
  if (!existing || existing.audit_type !== auditType) return { acquired: false, conflict: true };
  if (existing.request_status === "completed" && existing.analysis_id) {
    return { acquired: false, completed: true, analysisId: existing.analysis_id };
  }
  if (existing.request_status === "pending") return { acquired: false, pending: true };

  const retried = await db.prepare(`
    UPDATE audit_creation_metadata
    SET request_status = 'pending', analysis_id = NULL, updated_at = ?
    WHERE idempotency_key = ? AND request_status = 'failed'
  `).bind(now, idempotencyKey).run();
  return { acquired: Number(retried?.meta?.changes || 0) === 1, analysisId: null };
}

export async function completeManualAuditCreation(db, { idempotencyKey, analysisId }) {
  const result = await db.prepare(`
    UPDATE audit_creation_metadata
    SET analysis_id = ?, request_status = 'completed', updated_at = ?
    WHERE idempotency_key = ? AND request_status = 'pending'
  `).bind(analysisId, new Date().toISOString(), idempotencyKey).run();
  return !result?.meta || Number(result.meta.changes || 0) === 1;
}

export async function failManualAuditCreation(db, idempotencyKey) {
  await db.prepare(`
    UPDATE audit_creation_metadata
    SET request_status = 'failed', updated_at = ?
    WHERE idempotency_key = ? AND request_status = 'pending'
  `).bind(new Date().toISOString(), idempotencyKey).run();
}
