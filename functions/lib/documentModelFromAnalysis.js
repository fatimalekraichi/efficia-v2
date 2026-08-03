import {
  buildReasoningInputFromAnalysis,
  runComposerForAnalysis,
} from "./auditComposition.js";
import { runReasoningEngine } from "./reasoning-engine/reasoningEngine.js";
import { buildExecutionPlan } from "./executionPlanBuilder.js";

export function buildDocumentModelFromAnalysis(analysis = {}) {
  const baseModel = analysis.documentModel || (() => {
    const reasoning = analysis.reasoning || runReasoningEngine(buildReasoningInputFromAnalysis(analysis));
    return runComposerForAnalysis(analysis, reasoning).output;
  })();
  const executionPlan = buildExecutionPlan({ analysis, documentModel: baseModel });
  return executionPlan ? { ...baseModel, executionPlan } : baseModel;
}
