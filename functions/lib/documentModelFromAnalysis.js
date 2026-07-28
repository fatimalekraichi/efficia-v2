import {
  buildReasoningInputFromAnalysis,
  runComposerForAnalysis,
} from "./auditComposition.js";
import { runReasoningEngine } from "./reasoning-engine/reasoningEngine.js";

export function buildDocumentModelFromAnalysis(analysis = {}) {
  if (analysis.documentModel) return analysis.documentModel;

  const reasoning = analysis.reasoning || runReasoningEngine(buildReasoningInputFromAnalysis(analysis));
  return runComposerForAnalysis(analysis, reasoning).output;
}
