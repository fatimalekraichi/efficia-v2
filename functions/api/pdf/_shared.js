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
import {
  buildAuditPdfFilename,
  renderPdfWithCloudflareBrowserRun,
} from "../../lib/pdfRenderer.js";

const PDF_HEADERS = {
  "Content-Type": "application/pdf",
  ...CORS_HEADERS,
};

function pdfResponse(pdf, filename) {
  return new Response(pdf, {
    status: 200,
    headers: {
      ...PDF_HEADERS,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function pdfErrorResponse(result) {
  const status = result.error === "PDF_RENDERER_NOT_CONFIGURED" ? 501 : 502;
  return jsonResponse({
    success: false,
    error: result.error,
    message: result.message,
  }, status);
}

async function renderAnalysisPdf(context, analysis) {
  const documentModel = buildDocumentModelFromAnalysis(analysis);
  const html = renderAnalysisHtml(documentModel);
  const result = await renderPdfWithCloudflareBrowserRun({ html, env: context.env });
  if (!result.ok) return pdfErrorResponse(result);

  const filename = buildAuditPdfFilename(analysis);
  return pdfResponse(result.pdf, filename);
}

export async function renderPdfById(context, analysisId) {
  const verified = verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(verified.db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return renderAnalysisPdf(context, analysis);
}

export async function renderLatestPdf(context) {
  const verified = verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  const analysis = await loadLatestAnalysis(verified.db);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return renderAnalysisPdf(context, analysis);
}

export { CORS_HEADERS };
