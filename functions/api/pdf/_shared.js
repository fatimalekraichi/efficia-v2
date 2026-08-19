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
  renderFreeDiagnosticPdf,
} from "../../lib/pdfRenderer.js";
import { requirePremiumAnalysisAuthorization } from "../../lib/premiumAuthorization.js";

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
  // Débordement de mise en page détecté avant génération (Diagnostic gratuit
  // uniquement — voir renderFreeDiagnosticPdf / validateFreeDiagnosticLayout).
  if (result.error === "FREE_DIAGNOSTIC_LAYOUT_OVERFLOW") {
    return jsonResponse({
      success: false,
      error: result.error,
      reason: result.reason,
      message: result.message,
      pages: result.pages || [],
      ...(result.expectedPages !== undefined
        ? { expectedPages: result.expectedPages, actualPages: result.actualPages }
        : {}),
    }, 422);
  }

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

  // Routage : le Diagnostic gratuit utilise le chemin dédié capture page par
  // page (voir functions/lib/pdfRenderer.js). Le premium (ou tout reportType
  // absent/inconnu) continue d'utiliser exactement le même appel qu'avant —
  // renderPdfWithCloudflareBrowserRun n'est ni modifié ni contourné ici.
  const result = documentModel?.reportType === "free"
    ? await renderFreeDiagnosticPdf({ html, env: context.env })
    : await renderPdfWithCloudflareBrowserRun({ html, env: context.env });
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

  const premiumAuthorization = await requirePremiumAnalysisAuthorization(context, verified.db, analysis);
  if (!premiumAuthorization.ok) {
    return jsonResponse({ success: false, error: premiumAuthorization.error }, premiumAuthorization.status);
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

  const premiumAuthorization = await requirePremiumAnalysisAuthorization(context, verified.db, analysis);
  if (!premiumAuthorization.ok) {
    return jsonResponse({ success: false, error: premiumAuthorization.error }, premiumAuthorization.status);
  }

  return renderAnalysisPdf(context, verified.db, analysis);
}

// Route dédiée /api/pdf/free-diagnostic/:analysisId — force le chemin de
// capture page par page quel que soit documentModel.reportType. Indépendante
// de renderAnalysisPdf (chemin premium) : ne le modifie ni ne l'appelle.
export async function renderFreeDiagnosticPdfById(context, analysisId) {
  const verified = await verifyAnalysisRequest(context);
  if (!verified.ok) return verified.response;

  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "Invalid analysisId." }, 400);
  }

  const analysis = await loadAnalysisById(verified.db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "Analysis not found." }, 404);
  }

  if (!canGeneratePdf(analysis)) {
    return jsonResponse({
      success: false,
      error: "REPORT_NOT_APPROVED",
      message: "Le rapport doit être approuvé avant de générer le PDF.",
    }, 409);
  }

  const documentModel = buildDocumentModelFromAnalysis(analysis);
  const html = renderAnalysisHtml(documentModel);
  const result = await renderFreeDiagnosticPdf({ html, env: context.env });
  if (!result.ok) return pdfErrorResponse(result);

  await markPdfGenerated(verified.db, analysis.analysisId);
  const filename = buildAuditPdfFilename(analysis);
  return pdfResponse(result.pdf, filename);
}

export { CORS_HEADERS };
export const __test__ = {
  canGeneratePdf,
  markPdfGenerated,
};
