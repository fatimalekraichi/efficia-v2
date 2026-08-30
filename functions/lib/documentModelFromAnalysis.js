import {
  buildReasoningInputFromAnalysis,
  runComposerForAnalysis,
} from "./auditComposition.js";
import { runReasoningEngine } from "./reasoning-engine/reasoningEngine.js";
import { buildExecutionPlan } from "./executionPlanBuilder.js";
import { applyReportNarrativeOverrides, loadReportNarrativeOverrides } from "./reportNarrativeOverrides.js";

export function buildDocumentModelFromAnalysis(analysis = {}) {
  const baseModel = analysis.documentModel || (() => {
    const reasoning = analysis.reasoning || runReasoningEngine(buildReasoningInputFromAnalysis(analysis));
    return runComposerForAnalysis(analysis, reasoning).output;
  })();
  const executionPlan = buildExecutionPlan({ analysis, documentModel: baseModel });
  return executionPlan ? { ...baseModel, executionPlan } : baseModel;
}

export async function buildEffectiveDocumentModelFromAnalysis(db, analysis = {}) {
  const overrides = await loadReportNarrativeOverrides(db, analysis.analysisId);
  return applyReportNarrativeOverrides(buildDocumentModelFromAnalysis(analysis), overrides);
}
