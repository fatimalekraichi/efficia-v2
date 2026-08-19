// Cloudflare Pages Function — /api/composer
// Produit et persiste le documentModel final après Reasoning.

import { verifyConnectorToken } from "./_auth.js";
import { isValidAnalysisId, loadAnalysisById } from "./analysis/_shared.js";
import { runComposerForAnalysis } from "../lib/auditComposition.js";
import { requirePremiumAnalysisAuthorization } from "../lib/premiumAuthorization.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

async function readAnalysisId(request) {
  try {
    const payload = await request.json();
    return typeof payload?.analysisId === "string" ? payload.analysisId.trim() : "";
  } catch {
    return "";
  }
}

function getDb(context) {
  const db = context.env.ORDERS_DB;
  if (!db) {
    console.error("composer: binding ORDERS_DB indisponible.");
    return null;
  }
  return db;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const auth = verifyConnectorToken(context);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  const db = getDb(context);
  if (!db) return jsonResponse({ success: false, error: "Server configuration error." }, 500);

  const analysisId = await readAnalysisId(context.request);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }
  if (!analysis.knowledge) {
    return jsonResponse({ success: false, error: "Knowledge not completed." }, 409);
  }
  if (!analysis.reasoning) {
    return jsonResponse({ success: false, error: "Reasoning not completed." }, 409);
  }

  const premiumAuthorization = await requirePremiumAnalysisAuthorization(context, db, analysis);
  if (!premiumAuthorization.ok) {
    return jsonResponse({ success: false, error: premiumAuthorization.error }, premiumAuthorization.status);
  }

  const { output } = runComposerForAnalysis(analysis, analysis.reasoning);
  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE analyses
    SET
      document_model_json = ?,
      composer_completed_at = ?,
      updated_at = ?
    WHERE analysis_id = ?
  `).bind(
    JSON.stringify(output),
    now,
    now,
    analysisId,
  ).run();

  return jsonResponse({
    analysisId,
    status: "completed",
    documentModel: output,
  });
}
