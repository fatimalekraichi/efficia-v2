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

function canGeneratePdf(analysis) {
  return analysis?.status === "approved" || analysis?.status === "pdf_generated";
}

async function markPdfGenerated(db, analysisId) {
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE analyses
    SET status = 'pdf_generated', pdf_generated_at = ?, updated_at = ?
    WHERE analysis_id = ?
  `).bind(now, now, analysisId).run();
}

async function renderAnalysisPdf(context, db, analysis) {
  if (!canGeneratePdf(analysis)) {
    return jsonResponse({
      success: false,
      error: "REPORT_NOT_APPROVED",
      message: "Le rapport doit être approuvé avant de générer le PDF.",
    }, 409);
  }

  const documentModel = buildDocumentModelFromAnalysis(analysis);
  const html = renderAnalysisHtml(documentModel);
  const result = await renderPdfWithCloudflareBrowserRun({ html, env: context.env });
  if (!result.ok) return pdfErrorResponse(result);

  await markPdfGenerated(db, analysis.analysisId);
  const filename = buildAuditPdfFilename(analysis);
  return pdfResponse(result.pdf, filename);
}

export async function renderPdfById(context, analysisId) {
  const verified = await verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(verified.db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return renderAnalysisPdf(context, verified.db, analysis);
}

export async function renderLatestPdf(context) {
  const verified = await verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  const analysis = await loadLatestAnalysis(verified.db);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  return renderAnalysisPdf(context, verified.db, analysis);
}

export { CORS_HEADERS };
export const __test__ = {
  canGeneratePdf,
  markPdfGenerated,
};
