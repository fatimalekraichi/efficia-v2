import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const modern = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
const legacy = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `bloc introuvable : ${start}`);
  return source.slice(startIndex, endIndex);
}

function radio(value, special = "") {
  const label = { hidden: false, toggleAttribute(name, enabled) { if (name === "hidden") this.hidden = enabled; } };
  return {
    value,
    dataset: { special },
    checked: false,
    disabled: false,
    label,
    closest: () => label,
  };
}

test("les deux interfaces sélectionnent le sans-objet et désactivent les réponses ordinaires", () => {
  const modernInputs = [radio("compliant"), radio("partial"), radio("deficient"), radio("no_reviews")];
  const modernContext = {
    criteriaGroupsBox: { querySelectorAll: () => modernInputs },
  };
  vm.runInNewContext(`${sliceBetween(modern, "function updateNoReviewsResponseControl", "function setCriterionHidden")}
    globalThis.update = updateNoReviewsResponseControl;`, modernContext);
  modernContext.update(true);
  assert.equal(modernInputs.at(-1).checked, true);
  assert.equal(modernInputs.at(-1).disabled, false);
  assert.equal(modernInputs.at(-1).label.hidden, false);
  assert.equal(modernInputs.slice(0, 3).every((input) => input.disabled && !input.checked), true);
  modernContext.update(false);
  assert.equal(modernInputs.at(-1).checked, false);
  assert.equal(modernInputs.at(-1).disabled, true);
  assert.equal(modernInputs.at(-1).label.hidden, true);
  assert.equal(modernInputs.slice(0, 3).every((input) => !input.disabled && !input.checked), true);

  const legacyInputs = [radio("6"), radio("3"), radio("0"), radio("0", "no_reviews")];
  const legacyContext = {
    CRITERE_IDS: { tauxReponseAvis: 12 },
    document: { querySelectorAll: () => legacyInputs },
  };
  vm.runInNewContext(`${sliceBetween(legacy, "function mettreAJourReponseAvisSansAvis", "function critereEstMasque")}
    globalThis.update = mettreAJourReponseAvisSansAvis;`, legacyContext);
  legacyContext.update(true);
  assert.equal(legacyInputs.at(-1).checked, true);
  assert.equal(legacyInputs.slice(0, 3).every((input) => input.disabled && !input.checked), true);
  legacyContext.update(false);
  assert.equal(legacyInputs.at(-1).checked, false);
  assert.equal(legacyInputs.at(-1).disabled, true);
  assert.equal(legacyInputs.slice(0, 3).every((input) => !input.disabled && !input.checked), true);
});

test("la qualité est masquée et nettoyée, puis revient vide avec une note réelle", () => {
  for (const source of [modern, legacy]) {
    assert.match(source, /const NO_REVIEWS_HIDDEN_KEYS = \[[^\]]*"volumeAvis"[^\]]*"recenceAvis"[^\]]*"qualiteReponsesAvis"[^\]]*\]/s);
    assert.doesNotMatch(source, /const NO_REVIEWS_HIDDEN_KEYS = \[[^\]]*"tauxReponseAvis"/s);
  }
  assert.match(modern, /if \(hidden\) clearCriterionAnswer\(key\)/);
  assert.match(modern, /if \(!noReviews && isNotApplicable\) input\.checked = false/);
  assert.match(legacy, /if\(masquer\) effacerReponseCritere\(key\)/);
  assert.match(legacy, /if\(!sansAvis && estNonApplicable\) input\.checked = false/);
  assert.match(modern, /hideWhen: \["deficient"\]/);
  assert.match(legacy, /masquerCritereConditionnel\(child, Boolean\(selected\) && Number\(selected\.value\) === 0\)/);
});

test("brouillons et rapports excluent les réponses inexistantes sans recommandation contradictoire", () => {
  assert.match(modern, /if \(\["no_reviews", "no_photos"\]\.includes\(selected\?\.value\)\) return/);
  assert.match(legacy, /if\(selected\?\.dataset\.special === "no_reviews"\) return/);
  assert.match(legacy, /if\(critereEstMasque\(cr\) \|\| critereEstNonApplicable\(cr\)\) return/);
  assert.match(legacy, /evaluationStatus = nonApplicable \? "not_applicable"/);
  assert.match(legacy, /Non applicable \(aucun avis\)/);
});
