import { jsonResponse, requireAdminSession, requireOrdersDb } from "../../admin/_shared.js";
import { formatAuditCommercialLabel } from "../../lib/auditCreationMetadata.js";

const MAX_SNAPSHOTS = 100;

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const db = requireOrdersDb(context.env);
  const result = await db.prepare(`
    SELECT
      s.snapshot_id,
      s.analysis_id,
      s.report_type,
      s.answers_version,
      s.pdf_filename,
      s.finalized_at,
      a.nom,
      a.ville,
      a.status,
      m.creation_source,
      m.billing_status,
      CASE WHEN o.status = 'paid' AND (
        o.offer_code IN ('audit', 'visibility', 'performance') OR EXISTS (
          SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id
            AND oi.offer_code IN ('audit', 'visibility', 'performance')
        )
      ) THEN 1 ELSE 0 END AS paid_order
    FROM audit_questionnaire_snapshots s
    JOIN analyses a ON a.analysis_id = s.analysis_id
    LEFT JOIN audit_creation_metadata m ON m.analysis_id = s.analysis_id AND m.request_status = 'completed'
    LEFT JOIN orders o ON o.order_id = a.order_id
    ORDER BY s.finalized_at DESC
    LIMIT ?
  `).bind(MAX_SNAPSHOTS).all();

  return jsonResponse({
    success: true,
    audits: (result?.results || []).map((row) => ({
      snapshotId: row.snapshot_id,
      analysisId: row.analysis_id,
      reportType: row.report_type,
      auditLabel: formatAuditCommercialLabel(row),
      creationSource: row.creation_source || null,
      billingStatus: row.billing_status || null,
      answersVersion: row.answers_version,
      pdfFilename: row.pdf_filename || null,
      finalizedAt: row.finalized_at,
      company: row.nom || null,
      city: row.ville || null,
      status: row.status || "pdf_generated",
    })),
  });
}
