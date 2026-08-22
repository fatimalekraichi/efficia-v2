import { jsonResponse, requireAdminSession, requireOrdersDb } from "../../admin/_shared.js";
import { formatAuditCommercialLabel } from "../../lib/auditCreationMetadata.js";

const MAX_DRAFTS = 100;

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const db = requireOrdersDb(context.env);
  const result = await db.prepare(`
    SELECT
      d.draft_id,
      d.analysis_id,
      d.status,
      d.report_type,
      d.answers_version,
      d.current_step,
      d.created_at,
      d.updated_at,
      a.nom,
      COALESCE(
        NULLIF(json_extract(d.answers_json, '$.confirmedCity'), ''),
        NULLIF(json_extract(d.answers_json, '$.fields.p-ville'), ''),
        a.ville
      ) AS ville,
      m.creation_source,
      m.billing_status,
      CASE WHEN o.status = 'paid' AND (
        o.offer_code IN ('audit', 'visibility', 'performance') OR EXISTS (
          SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id
            AND oi.offer_code IN ('audit', 'visibility', 'performance')
        )
      ) THEN 1 ELSE 0 END AS paid_order
    FROM audit_drafts d
    JOIN analyses a ON a.analysis_id = d.analysis_id
    LEFT JOIN audit_creation_metadata m ON m.analysis_id = d.analysis_id AND m.request_status = 'completed'
    LEFT JOIN orders o ON o.order_id = a.order_id
    LEFT JOIN audit_questionnaire_snapshots s ON s.analysis_id = d.analysis_id
    WHERE d.status = 'draft'
      AND s.analysis_id IS NULL
    ORDER BY d.updated_at DESC
    LIMIT ?
  `).bind(MAX_DRAFTS).all();

  return jsonResponse({
    success: true,
    drafts: (result?.results || []).map((row) => ({
      draftId: row.draft_id,
      analysisId: row.analysis_id,
      status: row.status,
      reportType: row.report_type,
      auditLabel: formatAuditCommercialLabel(row),
      creationSource: row.creation_source || null,
      billingStatus: row.billing_status || null,
      answersVersion: row.answers_version,
      currentStep: row.current_step,
      company: row.nom || null,
      city: row.ville || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}
