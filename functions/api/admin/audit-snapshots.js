import { jsonResponse, requireAdminSession, requireOrdersDb } from "../../admin/_shared.js";

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
      a.status
    FROM audit_questionnaire_snapshots s
    JOIN analyses a ON a.analysis_id = s.analysis_id
    ORDER BY s.finalized_at DESC
    LIMIT ?
  `).bind(MAX_SNAPSHOTS).all();

  return jsonResponse({
    success: true,
    audits: (result?.results || []).map((row) => ({
      snapshotId: row.snapshot_id,
      analysisId: row.analysis_id,
      reportType: row.report_type,
      answersVersion: row.answers_version,
      pdfFilename: row.pdf_filename || null,
      finalizedAt: row.finalized_at,
      company: row.nom || null,
      city: row.ville || null,
      status: row.status || "pdf_generated",
    })),
  });
}
