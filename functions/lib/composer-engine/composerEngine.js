import { buildNarrativeModel } from "./narrativeModel.js";
import { selectComposerItems } from "./selection.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function runComposer(bundle = {}) {
  const safeBundle = clone(bundle);
  const selections = selectComposerItems(safeBundle);
  return buildNarrativeModel(safeBundle, selections);
}
