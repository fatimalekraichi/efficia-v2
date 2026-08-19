import {
  jsonResponse,
  onOptions,
  requireAdminSession,
  requireOrdersDb,
} from "../../admin/_shared.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

const mapDiagnosticRequest = (row) => ({
  analysisId: row.analysis_id,
  company: row.company,
  city: row.city,
  firstName: row.first_name,
  email: row.email,
  submittedAt: row.submitted_at,
  status: row.status,
  mailerLiteStatus: row.mailerlite_status,
  reportType: row.report_type,
});

export const onRequestOptions = () => onOptions();

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const db = requireOrdersDb(context.env);
  const limit = normalizeLimit(new URL(context.request.url).searchParams.get("limit"));
  const rows = await db.prepare(`
    SELECT
      d.analysis_id,
      COALESCE(NULLIF(d.company_name, ''), NULLIF(a.name, ''), a.nom) AS company,
      COALESCE(NULLIF(d.city, ''), NULLIF(a.ville, ''), '') AS city,
      d.first_name,
      d.email,
      d.created_at AS submitted_at,
      d.status,
      d.mailerlite_status,
      a.report_type
    FROM diagnostic_requests d
    INNER JOIN analyses a ON a.analysis_id = d.analysis_id
    WHERE a.report_type = 'free'
    ORDER BY d.created_at DESC
    LIMIT ?
  `).bind(limit).all();

  const pending = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM diagnostic_requests d
    INNER JOIN analyses a ON a.analysis_id = d.analysis_id
    WHERE a.report_type = 'free'
      AND d.status <> 'completed'
  `).first();

  return jsonResponse({
    success: true,
    diagnostics: (rows.results || []).map(mapDiagnosticRequest),
    pendingCount: Number(pending?.count || 0),
    limit,
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
