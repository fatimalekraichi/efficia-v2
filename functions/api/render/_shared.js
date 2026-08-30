import {
  CORS_HEADERS,
  isValidAnalysisId,
  jsonResponse,
  loadAnalysisById,
  loadLatestAnalysis,
  verifyAnalysisRequest,
} from "../analysis/_shared.js";
import { renderAnalysisHtml } from "../../lib/renderAnalysisHtml.js";
import { buildEffectiveDocumentModelFromAnalysis } from "../../lib/documentModelFromAnalysis.js";
import { addPdfPrintStyles, addPreviewToolbar, buildAuditPdfFilename, buildControlPdfTitle } from "../../lib/pdfRenderer.js";
import { requirePremiumAnalysisAuthorization } from "../../lib/premiumAuthorization.js";
import { applyReportCommercialPolicy, resolveReportCommercialPolicy } from "../../lib/reportCommercialPolicy.js";

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

// Course Knowledge → Reasoning → Composer : pendant saveManualReview(), les
// colonnes knowledge_json/reasoning_json/document_model_json sont remises à null
// AVANT que runPostReviewPipeline() ne les recalcule séquentiellement. Si /api/render
// est appelé dans cette fenêtre, buildDocumentModelFromAnalysis() retomberait sur un
// recalcul à partir de analysis.knowledge = {} (Knowledge absent) et produirait un
// document vide/appauvri, silencieusement.
//
// Détection : documentModel absent ET knowledge absent = la génération n'a même
// pas encore produit son premier étage ; on ne calcule alors rien et on le dit
// explicitement, plutôt que de laisser buildDocumentModelFromAnalysis recomputer
// avec des données vides.
//
// Si knowledge est présent mais reasoning/documentModel ne le sont pas encore
// (recalcul à la volée à partir d'un knowledge réel), le résultat reste correct et
// non vide : ce cas n'est donc pas bloqué ici.
function isGenerationInProgress(analysis) {
  return !analysis.documentModel && !analysis.knowledge;
}

function generationInProgressResponse() {
  return jsonResponse({
    success: false,
    error: "GENERATION_IN_PROGRESS",
    message: "La génération du rapport (Knowledge → Reasoning → Composer) est encore en cours. Réessayez dans quelques secondes.",
  }, 202);
}

async function buildEffectiveDocumentModel(db, analysis, authorizationType) {
  return applyReportCommercialPolicy(
    await buildEffectiveDocumentModelFromAnalysis(db, analysis),
    resolveReportCommercialPolicy(analysis.reportType, authorizationType),
  );
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
  if (analysis.analysisId !== analysisId) {
    return jsonResponse({ success: false, error: "ANALYSIS_ID_MISMATCH" }, 409);
  }
  const premiumAuthorization = await requirePremiumAnalysisAuthorization(context, verified.db, analysis);
  if (!premiumAuthorization.ok) {
    return jsonResponse({ success: false, error: premiumAuthorization.error }, premiumAuthorization.status);
  }
  if (analysis.status === "awaiting_review") {
    return jsonResponse({
      success: false,
      error: "MANUAL_REVIEW_REQUIRED",
      message: "La validation humaine est obligatoire avant de préparer l’aperçu du rapport.",
      reviewUrl: `/admin/audit-review/${encodeURIComponent(analysis.analysisId)}`,
    }, 409);
  }
  if (isGenerationInProgress(analysis)) {
    return generationInProgressResponse();
  }

  const documentModel = await buildEffectiveDocumentModel(verified.db, analysis, premiumAuthorization.authorizationType);
  const html = addPreviewToolbar(
    addPdfPrintStyles(renderAnalysisHtml(documentModel)),
    analysis.analysisId,
    analysis.status,
    {
      reportType: analysis.reportType,
      requestedAnalysisId: analysisId,
      controlPdfTitle: buildControlPdfTitle(analysis),
      finalPdfTitle: buildAuditPdfFilename(analysis),
    },
  );
  return htmlResponse(html);
}

export async function renderLatestAnalysis(context) {
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
  if (analysis.status === "awaiting_review") {
    return jsonResponse({
      success: false,
      error: "MANUAL_REVIEW_REQUIRED",
      message: "La validation humaine est obligatoire avant de préparer l’aperçu du rapport.",
      reviewUrl: `/admin/audit-review/${encodeURIComponent(analysis.analysisId)}`,
    }, 409);
  }
  if (isGenerationInProgress(analysis)) {
    return generationInProgressResponse();
  }

  const documentModel = await buildEffectiveDocumentModel(verified.db, analysis, premiumAuthorization.authorizationType);
  const html = addPreviewToolbar(
    addPdfPrintStyles(renderAnalysisHtml(documentModel)),
    analysis.analysisId,
    analysis.status,
    { reportType: analysis.reportType, finalPdfTitle: buildAuditPdfFilename(analysis) },
  );
  return htmlResponse(html);
}

export { CORS_HEADERS };
export const __test__ = { buildEffectiveDocumentModel };
