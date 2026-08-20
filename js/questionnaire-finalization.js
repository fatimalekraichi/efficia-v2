(function exposeQuestionnaireFinalization(global) {
  "use strict";

  function normalizeElement(item, type) {
    return {
      id: String(item.id || ""),
      type,
      label: String(item.label || "Élément à confirmer"),
      element: item.element || null,
      focusTarget: item.focusTarget || null,
      reason: String(item.reason || "missing_response"),
    };
  }

  function listerElementsRestantsPourFinalisation({ criteria = [], requiredContexts = [] } = {}) {
    const contexts = requiredContexts
      .filter((item) => item?.required !== false && item?.complete !== true)
      .map((item) => normalizeElement(item, "required_context"));
    const incompleteCriteria = criteria
      .filter((item) => item?.applicable !== false && item?.answered !== true)
      .map((item) => normalizeElement(item, "criterion"));
    return [...contexts, ...incompleteCriteria];
  }

  function formaterResumeElementsRestants(elements = []) {
    const count = elements.length;
    if (!count) return "✓ Tous les éléments sont renseignés";
    const labels = elements.slice(0, 3).map((item) => item.label);
    const suffix = count > labels.length ? ` et ${count - labels.length} autre${count - labels.length > 1 ? "s" : ""}` : "";
    return `${count} élément${count > 1 ? "s" : ""} reste${count > 1 ? "nt" : ""} à vérifier : ${labels.join(" ; ")}${suffix}.`;
  }

  global.EfficiaQuestionnaireFinalization = Object.freeze({
    listerElementsRestantsPourFinalisation,
    formaterResumeElementsRestants,
  });
}(globalThis));
