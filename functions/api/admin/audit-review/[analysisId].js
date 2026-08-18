import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import { buildReviewedData } from "../../../lib/manualReview.js";
import { buildScoreCatalog, buildScorePrefill } from "../../../lib/score-efficia/scoreCatalog.js";
import { runScoreEfficia } from "../../../lib/score-efficia/scoreEngine.js";
import { executionPlanApprovalIssues } from "../../../lib/executionPlanBuilder.js";
import { buildDocumentModelFromAnalysis } from "../../../lib/documentModelFromAnalysis.js";

async function readPayload(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function loadRawAnalysis(db, analysisId) {
  return db.prepare(`
    SELECT *
    FROM analyses
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function withScoreReviewData(analysis) {
  if (!analysis) return analysis;
  return {
    ...analysis,
    scoreCatalog: buildScoreCatalog(),
    scorePrefill: buildScorePrefill(analysis),
  };
}

async function callStage({ origin, connectorToken }, stage, analysisId) {
  const response = await fetch(`${origin}/api/${stage}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connectorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ analysisId }),
  });

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body,
    };
  }
  return { ok: true, body };
}

async function runPostReviewPipeline({ context, analysisId }) {
  const connectorToken = normalizeText(context.env.CONNECTOR_TOKEN);
  if (!connectorToken) {
    console.error("audit-review: CONNECTOR_TOKEN manquant dans l'environnement.");
    return {
      ok: false,
      stage: "configuration",
      status: 500,
      error: "SERVER_CONFIGURATION_ERROR",
    };
  }

  const origin = new URL(context.request.url).origin;
  const stageConfig = { origin, connectorToken };
  const stages = {};

  for (const stage of ["knowledge", "reasoning", "composer"]) {
    console.log(`audit-review:${stage}:start`, { analysis_id: analysisId });
    const result = await callStage(stageConfig, stage, analysisId);
    if (!result.ok) {
      stages[stage] = "failed";
      console.error(`audit-review:${stage}:failed`, {
        analysis_id: analysisId,
        status: result.status,
        error: result.body?.error || null,
      });
      return {
        ok: false,
        stage,
        status: result.status,
        body: result.body,
        stages,
      };
    }
    stages[stage] = "ok";
    console.log(`audit-review:${stage}:done`, { analysis_id: analysisId });
  }

  return { ok: true, stages };
}

async function saveManualReview({ context, db, analysisId, payload }) {
  const row = await loadRawAnalysis(db, analysisId);
  if (!row) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);

  const { manualReview, reviewedObservation, reviewedBenchmark } = buildReviewedData(row, payload || {});
  const { scoreInputs, reviewedScore } = runScoreEfficia({ manualReview });
  const now = new Date().toISOString();

  try {
    await db.prepare(`
      UPDATE analyses
      SET
        report_type = ?,
        manual_review_json = ?,
        reviewed_observation_json = ?,
        reviewed_benchmark_json = ?,
        score_inputs_json = ?,
        reviewed_score_json = ?,
        scoring_version = ?,
        review_completed_at = ?,
        status = 'preview_ready',
        knowledge_json = NULL,
        reasoning_json = NULL,
        document_model_json = NULL,
        knowledge_completed_at = NULL,
        reasoning_completed_at = NULL,
        composer_completed_at = NULL,
        approved_at = NULL,
        pdf_generated_at = NULL,
        updated_at = ?
      WHERE analysis_id = ?
    `).bind(
      manualReview.reportType || "premium",
      JSON.stringify(manualReview),
      JSON.stringify(reviewedObservation),
      JSON.stringify(reviewedBenchmark),
      JSON.stringify(scoreInputs),
      JSON.stringify(reviewedScore),
      reviewedScore.scoringVersion,
      now,
      now,
      analysisId,
    ).run();
  } catch (error) {
    if (String(error?.message || error).includes("score_inputs_json")) {
      return jsonResponse({
        success: false,
        error: "MISSING_SCORE_COLUMNS",
        message: "La base locale n’est pas à jour. Appliquez la migration 0011_score_efficia_historical.sql, puis relancez l’audit.",
      }, 500);
    }
    throw error;
  }

  const pipeline = await runPostReviewPipeline({ context, analysisId });
  if (!pipeline.ok) {
    return jsonResponse({
      success: false,
      error: "POST_REVIEW_PIPELINE_FAILED",
      stage: pipeline.stage,
      stages: pipeline.stages,
      detail: pipeline.body?.error || pipeline.error || null,
    }, 502);
  }

  const refreshed = await loadAnalysisById(db, analysisId);
  return jsonResponse({
    success: true,
    status: "preview_ready",
    analysisId,
    stages: pipeline.stages,
    analysis: await withFreeDiagnosticQuery(db, analysisId, withScoreReviewData(refreshed)),
    links: {
      preview: `/api/render/${encodeURIComponent(analysisId)}`,
      data: `/api/analysis/${encodeURIComponent(analysisId)}`,
      pdf: `/api/pdf/${encodeURIComponent(analysisId)}`,
    },
  });
}

async function approveAnalysis(db, analysisId) {
  const row = await loadRawAnalysis(db, analysisId);
  let manualReview = null;
  try { manualReview = JSON.parse(row?.manual_review_json || "null"); } catch { manualReview = null; }
  const fullAnalysis = row?.report_type === "premium" ? await loadAnalysisById(db, analysisId) : null;
  const executionPlan = fullAnalysis ? buildDocumentModelFromAnalysis(fullAnalysis).executionPlan : null;
  const executionIssues = row?.report_type === "premium" ? executionPlanApprovalIssues(executionPlan, manualReview?.executionPlan) : [];
  if (executionIssues.length) {
    return jsonResponse({
      success: false,
      error: "EXECUTION_PLAN_CONFIRMATION_REQUIRED",
      message: "Validez, corrigez ou marquez non applicables tous les éléments du plan d’exécution et ses livrables avant d’approuver le rapport.",
      missing: executionIssues,
    }, 409);
  }
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE analyses
    SET status = 'approved', approved_at = ?, updated_at = ?
    WHERE analysis_id = ?
  `).bind(now, now, analysisId).run();

  return jsonResponse({
    success: true,
    status: "approved",
    analysisId,
    approvedAt: now,
  });
}

export const onRequestOptions = () => onOptions();

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  }

  const db = requireOrdersDb(context.env);
  const analysis = await loadAnalysisById(db, analysisId);
  if (!analysis) {
    return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  }

  return jsonResponse({
    success: true,
    analysis: withScoreReviewData(analysis),
  });
}

export async function onRequestPatch(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  }

  const payload = await readPayload(context.request);
  if (!payload) return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);

  const db = requireOrdersDb(context.env);
  const existing = await loadRawAnalysis(db, analysisId);
  if (!existing) {
    return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  }

  const action = normalizeText(payload.action || "complete_review");
  if (action === "complete_review") {
    return saveManualReview({ context, db, analysisId, payload });
  }
  if (action === "approve") {
    return approveAnalysis(db, analysisId);
  }

  return jsonResponse({ success: false, error: "INVALID_ACTION" }, 400);
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

export const __test__ = {
  loadRawAnalysis,
  runPostReviewPipeline,
  saveManualReview,
  approveAnalysis,
};
