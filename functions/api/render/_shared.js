import {
  CORS_HEADERS,
  isValidAnalysisId,
  jsonResponse,
  loadAnalysisById,
  loadLatestAnalysis,
} from "../analysis/_shared.js";
import { renderAnalysisHtml } from "../../lib/renderAnalysisHtml.js";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  ...CORS_HEADERS,
};

export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: HTML_HEADERS,
  });
}

function getReadDatabase(context) {
  const db = context.env.ORDERS_DB;
  if (!db) {
    console.error("analysis-render: binding ORDERS_DB indisponible.");
    return null;
  }
  return db;
}

export async function renderAnalysisById(context, analysisId) {
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const db = getReadDatabase(context);
  if (!db) return jsonResponse({ success: false, error: "Server configuration error." }, 500);

  const analysis = await loadAnalysisById(db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return htmlResponse(renderAnalysisHtml(analysis));
}

export async function renderLatestAnalysis(context) {
  const db = getReadDatabase(context);
  if (!db) return jsonResponse({ success: false, error: "Server configuration error." }, 500);

  const analysis = await loadLatestAnalysis(db);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return htmlResponse(renderAnalysisHtml(analysis));
}

export { CORS_HEADERS };
