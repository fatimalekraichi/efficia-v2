import { resolveReportDepth } from "../reportDepth.js";
import { buildNarrativeModel } from "./narrativeModel.js";
import { selectComposerItems } from "./selection.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function runComposer(bundle = {}) {
  const safeBundle = clone(bundle);
  const depth = resolveReportDepth(safeBundle.reportType);
  const selections = selectComposerItems(safeBundle, depth.caps);
  return buildNarrativeModel(safeBundle, selections, depth);
}
