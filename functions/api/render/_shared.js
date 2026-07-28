import {
  CORS_HEADERS,
  isValidAnalysisId,
  jsonResponse,
  loadAnalysisById,
  loadLatestAnalysis,
  verifyAnalysisRequest,
} from "../analysis/_shared.js";
import { renderAnalysisHtml } from "../../lib/renderAnalysisHtml.js";
import { buildDocumentModelFromAnalysis } from "../../lib/documentModelFromAnalysis.js";
import { addPdfPrintStyles, addPreviewToolbar } from "../../lib/pdfRenderer.js";

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
  const verified = await verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(verified.db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }
  if (analysis.status === "awaiting_review") {
    return jsonResponse({
      success: false,
      error: "MANUAL_REVIEW_REQUIRED",
      message: "La validation humaine est obligatoire avant de préparer l’aperçu du rapport.",
      reviewUrl: `/admin/audit-review/${encodeURIComponent(analysis.analysisId)}`,
    }, 409);
  }

  const documentModel = buildDocumentModelFromAnalysis(analysis);
  const html = addPreviewToolbar(addPdfPrintStyles(renderAnalysisHtml(documentModel)), analysis.analysisId, analysis.status);
  return htmlResponse(html);
}

export async function renderLatestAnalysis(context) {
  const verified = await verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  const analysis = await loadLatestAnalysis(verified.db);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }
  if (analysis.status === "awaiting_review") {
    return jsonResponse({
      success: false,
      error: "MANUAL_REVIEW_REQUIRED",
      message: "La validation humaine est obligatoire avant de préparer l’aperçu du rapport.",
      reviewUrl: `/admin/audit-review/${encodeURIComponent(analysis.analysisId)}`,
    }, 409);
  }

  const documentModel = buildDocumentModelFromAnalysis(analysis);
  const html = addPreviewToolbar(addPdfPrintStyles(renderAnalysisHtml(documentModel)), analysis.analysisId, analysis.status);
  return htmlResponse(html);
}

export { CORS_HEADERS };
