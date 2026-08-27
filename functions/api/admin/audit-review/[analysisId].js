import { isValidAnalysisId, loadAnalysisById } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, onOptions, requireAdminSession, requireOrdersDb, requireSameOriginMutation } from "../../../admin/_shared.js";
import { buildReviewedData } from "../../../lib/manualReview.js";
import { buildScoreCatalog, buildScorePrefill } from "../../../lib/score-efficia/scoreCatalog.js";
import { runScoreEfficia } from "../../../lib/score-efficia/scoreEngine.js";
import { resolveScoringVersion } from "../../../lib/score-efficia/scoreConfig.js";
import { incompleteQuestionnaireFields } from "../../../lib/score-efficia/questionnaireRules.js";
import { confirmReadyExecutionPlanReview, executionPlanApprovalIssues, rebuildDuplicatedExecutionPlanReview } from "../../../lib/executionPlanBuilder.js";
import { buildDocumentModelFromAnalysis } from "../../../lib/documentModelFromAnalysis.js";
import { resolveReportCity } from "../../../lib/auditComposition.js";
import { loadAdminPremiumAuthorization } from "../../../lib/premiumAuthorization.js";
import { finalizeQuestionnaireSnapshot, loadQuestionnaireSnapshot } from "../../../lib/auditQuestionnaireSnapshots.js";

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

async function loadDuplicationSource(db, analysisId) {
  return db.prepare(`
    SELECT source_analysis_id
    FROM audit_questionnaire_duplications
    WHERE new_analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
}

async function rebuildDuplicatedExecutionPlan({ db, row, analysisId, payload }) {
  const duplication = await loadDuplicationSource(db, analysisId);
  if (!duplication?.source_analysis_id) return null;

  const scoringVersion = resolveScoringVersion(row.scoring_version || payload.scoringVersion, { historicalFallback: true });
  const cleanPayload = { ...payload, scoringVersion, executionPlan: {} };
  const { manualReview, reviewedObservation, reviewedBenchmark } = buildReviewedData(row, cleanPayload);
  manualReview.scoringVersion = scoringVersion;
  const { scoreInputs, reviewedScore } = runScoreEfficia({ manualReview, scoringVersion });
  const current = await loadAnalysisById(db, analysisId);
  if (!current) return { ok: false, error: "ANALYSIS_NOT_FOUND" };

  const reconstructionContext = {
    ...current,
    manualReview: { ...manualReview, executionPlan: {} },
    scoreInputs,
    reviewedScore,
    business: { ...current.business, reviewed: reviewedObservation },
    benchmark: { ...current.benchmark, reviewed: reviewedBenchmark },
  };
  const freshPlan = buildDocumentModelFromAnalysis(reconstructionContext).executionPlan;
  if (!freshPlan) return { ok: false, error: "EXECUTION_PLAN_REBUILD_FAILED" };

  return {
    ok: true,
    sourceAnalysisId: duplication.source_analysis_id,
    review: rebuildDuplicatedExecutionPlanReview(freshPlan, payload.executionPlan, { analysisId }),
  };
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
  const scoringVersion = resolveScoringVersion(analysis.scoringVersion, { historicalFallback: true });
  return {
    ...analysis,
    effectiveScoringVersion: scoringVersion,
    scoreCatalog: buildScoreCatalog(scoringVersion),
    scorePrefill: buildScorePrefill(analysis, { scoringVersion }),
  };
}

function technicalFailureResponse({
  analysisId,
  stage,
  code,
  status = 500,
  publicError = "AUDIT_PREVIEW_PREPARATION_FAILED",
  message = "Une erreur technique a interrompu la préparation de l’aperçu.",
}) {
  const reference = crypto.randomUUID();
  console.error(JSON.stringify({
    message: "audit review mutation failed",
    reference,
    analysis_id: analysisId,
    stage,
    code,
  }));
  return jsonResponse({
    success: false,
    error: publicError,
    message,
    reference,
  }, status);
}

function executionPlanBlockingResponse(blockers = []) {
  const first = blockers[0] || {
    section: "Plan d’exécution",
    reason: "Une intervention reste nécessaire.",
    code: "confirmation_required",
  };
  return jsonResponse({
    success: false,
    error: "EXECUTION_PLAN_CONFIRMATION_REQUIRED",
    message: `${first.section} : ${first.reason}`,
    missing: [...new Set(blockers.map((item) => item.section).filter(Boolean))],
    blockers,
  }, 409);
}

async function callStage({ origin, connectorToken, cookie }, stage, analysisId) {
  const response = await fetch(`${origin}/api/${stage}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connectorToken}`,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
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
  const stageConfig = {
    origin,
    connectorToken,
    cookie: context.request.headers.get("Cookie") || "",
  };
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

  const scoringVersion = resolveScoringVersion(row.scoring_version || payload?.scoringVersion, { historicalFallback: true });
  let effectivePayload = { ...(payload || {}), scoringVersion };
  let confirmedContentCount = 0;
  let reviewedData = buildReviewedData(row, effectivePayload);
  let incompleteFields = incompleteQuestionnaireFields(reviewedData.manualReview);
  if (incompleteFields.length) {
    return jsonResponse({
      success: false,
      error: "INCOMPLETE_QUESTIONNAIRE",
      missing: incompleteFields,
    }, 409);
  }
  if (reviewedData.manualReview.reportType === "premium") {
    const reliableCity = resolveReportCity({
      manualReview: reviewedData.manualReview,
      business: { reviewed: reviewedData.reviewedObservation, ville: row.ville },
      draft: { answers: effectivePayload },
    });
    if (!reliableCity) {
      return executionPlanBlockingResponse([{
        section: "Ville confirmée",
        reason: "Une ville fiable doit être confirmée avant de générer les contenus.",
        code: "reliable_city_missing",
        field: "confirmedCity",
      }]);
    }
    const authorization = await loadAdminPremiumAuthorization(db, analysisId);
    if (!authorization.allowed) {
      return jsonResponse({ success: false, error: "PREMIUM_NOT_AUTHORIZED" }, 403);
    }
  }

  if (payload?.confirmAll === true) {
    const rebuilt = await rebuildDuplicatedExecutionPlan({ db, row, analysisId, payload });
    if (rebuilt && !rebuilt.ok) {
      return technicalFailureResponse({
        analysisId,
        stage: "execution_plan_rebuild",
        code: rebuilt.error,
        publicError: "EXECUTION_PLAN_REBUILD_FAILED",
        message: "Les contenus de la nouvelle version n’ont pas pu être reconstruits.",
      });
    }
    const executionPlanReview = rebuilt?.review || payload.executionPlan;
    const confirmation = confirmReadyExecutionPlanReview(executionPlanReview, { analysisId });
    if (confirmation.blocking.length) {
      return executionPlanBlockingResponse(confirmation.blockingDetails);
    }
    confirmedContentCount = confirmation.confirmedCount;
    effectivePayload = { ...payload, scoringVersion, executionPlan: confirmation.review };
    reviewedData = buildReviewedData(row, effectivePayload);
  }

  const { manualReview, reviewedObservation, reviewedBenchmark } = reviewedData;
  manualReview.scoringVersion = scoringVersion;
  const { scoreInputs, reviewedScore } = runScoreEfficia({ manualReview, scoringVersion });
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
    return technicalFailureResponse({
      analysisId,
      stage: pipeline.stage || "pipeline",
      code: pipeline.body?.error || pipeline.error || "POST_REVIEW_PIPELINE_FAILED",
      status: 502,
    });
  }

  const refreshed = await loadAnalysisById(db, analysisId);
  return jsonResponse({
    success: true,
    status: "preview_ready",
    analysisId,
    stages: pipeline.stages,
    confirmedContentCount,
    analysis: withScoreReviewData(refreshed),
    links: {
      preview: `/api/render/${encodeURIComponent(analysisId)}`,
      data: `/api/analysis/${encodeURIComponent(analysisId)}`,
      pdf: `/api/pdf/${encodeURIComponent(analysisId)}`,
    },
  });
}

async function approveAnalysis(db, analysisId) {
  const row = await loadRawAnalysis(db, analysisId);
  if (!row) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  const isPremium = row.report_type !== "free";
  let snapshotCreated = false;
  if (isPremium) {
    const authorization = await loadAdminPremiumAuthorization(db, analysisId);
    if (!authorization.allowed) {
      const reference = crypto.randomUUID();
      console.error(JSON.stringify({ message: "audit approval refused", reference, analysis_id: analysisId, error: "PREMIUM_NOT_AUTHORIZED" }));
      return jsonResponse({ success: false, error: "PREMIUM_NOT_AUTHORIZED", reference }, 403);
    }
  }
  if (["approved", "pdf_generated"].includes(row.status)) {
    let completed = !isPremium;
    if (isPremium) {
      const existingSnapshot = await loadQuestionnaireSnapshot(db, analysisId);
      completed = Boolean(existingSnapshot);
    }
    return jsonResponse({
      success: true,
      status: row.status,
      analysisId,
      approvedAt: row.approved_at || null,
      idempotent: true,
      completed,
      snapshotCreated,
    });
  }
  let manualReview = null;
  try { manualReview = JSON.parse(row?.manual_review_json || "null"); } catch { manualReview = null; }
  const incompleteFields = incompleteQuestionnaireFields(manualReview || {});
  if (incompleteFields.length) {
    const reference = crypto.randomUUID();
    console.error(JSON.stringify({ message: "audit approval refused", reference, analysis_id: analysisId, error: "INCOMPLETE_QUESTIONNAIRE" }));
    return jsonResponse({ success: false, error: "INCOMPLETE_QUESTIONNAIRE", reference }, 409);
  }
  const fullAnalysis = row?.report_type === "premium" ? await loadAnalysisById(db, analysisId) : null;
  const executionPlan = fullAnalysis ? buildDocumentModelFromAnalysis(fullAnalysis).executionPlan : null;
  const executionIssues = row?.report_type === "premium" ? executionPlanApprovalIssues(executionPlan, manualReview?.executionPlan) : [];
  if (executionIssues.length) {
    const reference = crypto.randomUUID();
    console.error(JSON.stringify({ message: "audit approval refused", reference, analysis_id: analysisId, error: "EXECUTION_PLAN_CONFIRMATION_REQUIRED" }));
    return jsonResponse({
      success: false,
      error: "EXECUTION_PLAN_CONFIRMATION_REQUIRED",
      message: "Validez, corrigez ou marquez non applicables tous les éléments du plan d’exécution et ses livrables avant d’approuver le rapport.",
      missing: executionIssues,
      reference,
    }, 409);
  }
  const now = new Date().toISOString();
  if (isPremium) {
    const finalization = await finalizeQuestionnaireSnapshot(db, analysisId, {
      completion: "approved",
      approvedAt: now,
    });
    if (!finalization.ok) {
      return jsonResponse({
        success: false,
        error: finalization.error,
        message: "Le questionnaire sauvegardé est requis pour terminer cet audit.",
      }, 409);
    }
    snapshotCreated = finalization.created;
  } else {
    await db.prepare(`
      UPDATE analyses
      SET status = 'approved', approved_at = ?, updated_at = ?
      WHERE analysis_id = ?
    `).bind(now, now, analysisId).run();
  }

  return jsonResponse({
    success: true,
    status: "approved",
    analysisId,
    approvedAt: now,
    completed: isPremium,
    snapshotCreated,
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

  const sameOrigin = requireSameOriginMutation(context.request);
  if (!sameOrigin.ok) return sameOrigin.response;

  const analysisId = normalizeText(context.params.analysisId);
  if (!isValidAnalysisId(analysisId)) {
    return jsonResponse({ success: false, error: "INVALID_ANALYSIS_ID" }, 400);
  }

  const payload = await readPayload(context.request);
  if (!payload) return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);

  const payloadAnalysisId = normalizeText(payload.analysisId);
  if ((payload.confirmAll === true && payloadAnalysisId !== analysisId)
    || (payloadAnalysisId && payloadAnalysisId !== analysisId)) {
    return jsonResponse({ success: false, error: "ANALYSIS_ID_MISMATCH" }, 409);
  }

  const db = requireOrdersDb(context.env);
  const existing = await loadRawAnalysis(db, analysisId);
  if (!existing) {
    return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  }

  const action = normalizeText(payload.action || "complete_review");
  if (action === "complete_review") {
    try {
      return await saveManualReview({ context, db, analysisId, payload });
    } catch (error) {
      return technicalFailureResponse({
        analysisId,
        stage: "complete_review",
        code: error?.name || "UNEXPECTED_ERROR",
      });
    }
  }
  if (action === "approve") {
    try {
      return await approveAnalysis(db, analysisId);
    } catch (error) {
      return technicalFailureResponse({
        analysisId,
        stage: "approve",
        code: error?.name || "UNEXPECTED_ERROR",
        publicError: "AUDIT_APPROVAL_FAILED",
      });
    }
  }

  return jsonResponse({ success: false, error: "INVALID_ACTION" }, 400);
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

export const __test__ = {
  loadRawAnalysis,
  loadDuplicationSource,
  rebuildDuplicatedExecutionPlan,
  runPostReviewPipeline,
  saveManualReview,
  approveAnalysis,
};
