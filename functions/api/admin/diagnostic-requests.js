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
  ...(row.review_reason ? { reviewReason: row.review_reason, countryCode: row.country_code,
    googleBusinessUrl: row.google_business_url } : {}),
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
      a.report_type, NULL AS review_reason, NULL AS country_code, d.google_business_url
    FROM diagnostic_requests d
    INNER JOIN analyses a ON a.analysis_id = d.analysis_id
    WHERE a.report_type = 'free'
    UNION ALL
    SELECT NULL, json_extract(c.request_details_json, '$.company'), json_extract(c.request_details_json, '$.city'),
      c.first_name, c.email, COALESCE(c.submitted_at, c.created_at),
      CASE WHEN c.submitted_at IS NULL THEN 'incomplete' ELSE 'manual_review' END,
      c.mailerlite_status, NULL, c.review_reason,
      json_extract(c.request_details_json, '$.countryCode'), json_extract(c.request_details_json, '$.googleBusinessUrl')
    FROM diagnostic_lead_captures c
    WHERE NOT EXISTS (
      SELECT 1 FROM diagnostic_requests d WHERE d.idempotency_key = c.idempotency_key
    )
    ORDER BY submitted_at DESC
    LIMIT ?
  `).bind(limit).all();

  const pending = await db.prepare(`
    SELECT COUNT(*) + (SELECT COUNT(*) FROM diagnostic_lead_captures c
      WHERE NOT EXISTS (SELECT 1 FROM diagnostic_requests d
        WHERE d.idempotency_key = c.idempotency_key)) AS count
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
