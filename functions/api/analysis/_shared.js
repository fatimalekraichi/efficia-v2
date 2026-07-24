import { verifyConnectorToken } from "../_auth.js";
import { ANALYSIS_SELECT, formatAnalysisRow } from "../../lib/analysisReader.js";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

export function verifyAnalysisRequest(context) {
  const auth = verifyConnectorToken(context);
  if (!auth.ok) return { ok: false, response: jsonResponse({ success: false, error: auth.error }, auth.status) };

  const db = context.env.ORDERS_DB;
  if (!db) {
    console.error("analysis-read: binding ORDERS_DB indisponible.");
    return { ok: false, response: jsonResponse({ success: false, error: "Server configuration error." }, 500) };
  }

  return { ok: true, db };
}

export function isValidAnalysisId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value.trim());
}

export async function loadAnalysisById(db, analysisId) {
  const row = await db.prepare(`
    ${ANALYSIS_SELECT}
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();

  return formatAnalysisRow(row);
}

export async function loadLatestAnalysis(db) {
  const row = await db.prepare(`
    ${ANALYSIS_SELECT}
    ORDER BY created_at DESC
    LIMIT 1
  `).first();

  return formatAnalysisRow(row);
}
