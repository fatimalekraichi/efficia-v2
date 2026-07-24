import {
  CORS_HEADERS,
  isValidAnalysisId,
  jsonResponse,
  loadAnalysisById,
  loadLatestAnalysis,
  verifyAnalysisRequest,
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

export async function renderAnalysisById(context, analysisId) {
  const verified = verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(verified.db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return htmlResponse(renderAnalysisHtml(analysis));
}

export async function renderLatestAnalysis(context) {
  const verified = verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  const analysis = await loadLatestAnalysis(verified.db);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return htmlResponse(renderAnalysisHtml(analysis));
}

export { CORS_HEADERS };
