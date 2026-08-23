import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildPremiumDraftFromFreeSnapshot } from "../functions/lib/auditPremiumTransfers.js";
import { normalizeQuestionnaireAnswers } from "../functions/lib/auditQuestionnaireSnapshots.js";
import { buildNarrativeModel } from "../functions/lib/composer-engine/narrativeModel.js";
import { renderFreeDiagnosticHtml, renderPremiumAuditHtml } from "../functions/lib/renderAnalysisHtml.js";
import { normalizeManualReview } from "../functions/lib/manualReview.js";
import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";
import { buildScoreCatalog } from "../functions/lib/score-efficia/scoreCatalog.js";
import { runScoreEfficia } from "../functions/lib/score-efficia/scoreEngine.js";
import { incompleteQuestionnaireFields, QUESTIONNAIRE_VERSION } from "../functions/lib/score-efficia/questionnaireRules.js";

function completeCriteria() {
  return GRILLE.flatMap((category) => category.criteres.map((criterion) => ({
    key: criterion.key,
    category: category.cat,
    question: criterion.q,
    value: criterion.key === "nap" ? "no_website" : "compliant",
    label: criterion.key === "nap" ? "Aucun site web disponible" : criterion.opts[0][0],
    selectedOptionIndex: criterion.key === "nap" ? 2 : 0,
    points: criterion.key === "nap" ? 0 : criterion.max,
  })));
}

function noWebsiteReview() {
  return normalizeManualReview({
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    reportType: "premium",
    photoPresence: "present",
    reviewsPresence: "present",
    locationMode: "storefront",
    addressVerification: "exact",
    criteriaReview: completeCriteria(),
  });
}

test("l’option no_website est partagée par les questionnaires Gratuit et Premium", () => {
  const catalog = buildScoreCatalog();
  const nap = catalog.categories.flatMap((category) => category.criteria).find((criterion) => criterion.key === "nap");
  assert.deepEqual(nap.options.map(({ value, label, points }) => [value, label, points]), [
    ["compliant", "Cohérents", 3],
    ["deficient", "Différences", 0],
    ["no_website", "Aucun site web disponible", 0],
    ["not_verified", "Non vérifié", null],
  ]);

  const free = readFileSync(new URL("../src/decision-engine/criteria.catalog.js", import.meta.url), "utf8");
  const premium = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  assert.match(free, /Aucun site web disponible",0,"no_website"/);
  assert.match(premium, /\["no_website", "Aucun site web disponible", 0\]/);
});

test("no_website vaut zéro, est complet et ne rend pas le score provisoire", () => {
  const manualReview = noWebsiteReview();
  const result = runScoreEfficia({ manualReview });
  const nap = result.scoreInputs.criteria.find((criterion) => criterion.key === "nap");
  assert.equal(nap.status, "no_website");
  assert.equal(nap.points, 0);
  assert.equal(result.scoreInputs.answers.nap, 0);
  assert.equal(result.scoreInputs.provisional, false);
  assert.equal(result.reviewedScore.provisional, false);
  assert.equal(result.reviewedScore.roundedScore, 97);
  assert.deepEqual(incompleteQuestionnaireFields(manualReview), []);
  assert.equal(GRILLE.flatMap((category) => category.criteres).length, 29);
  assert.equal(GRILLE.reduce((sum, category) => sum + category.pts, 0), 100);
});

test("no_website reste stable dans le payload v4, la reprise et le transfert Gratuit vers Premium", () => {
  const freeAnswers = normalizeQuestionnaireAnswers({
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    fields: { "p-entreprise": "Entreprise test", "p-ville": "Arlon" },
    responses: {
      nap: { points: 0, value: "no_website", selectedOptionIndex: 2, checklist: [] },
    },
  });
  const restored = normalizeQuestionnaireAnswers(JSON.parse(JSON.stringify(freeAnswers)), QUESTIONNAIRE_VERSION);
  assert.equal(restored.responses.nap.value, "no_website");
  assert.equal(restored.responses.nap.selectedOptionIndex, 2);

  const premium = buildPremiumDraftFromFreeSnapshot({
    snapshot: { snapshotId: "snapshot-free", answersVersion: QUESTIONNAIRE_VERSION, answers: restored },
    analysis: { analysis_id: "free-analysis", ville: "Arlon", normalized_json: "{}", fiche_json: "{}" },
    importedAt: "2026-08-22T10:00:00.000Z",
  });
  const nap = premium.criteriaReview.find((criterion) => criterion.key === "nap");
  assert.equal(nap.value, "no_website");
  assert.equal(nap.points, 0);
  assert.equal(nap.selectedOptionIndex, 2);
  assert.equal(premium.questionnaireVersion, QUESTIONNAIRE_VERSION);
});

test("les rapports décrivent factuellement l’absence de site sans incohérence fictive", () => {
  const score = runScoreEfficia({ manualReview: noWebsiteReview() });
  const bundle = {
    reportType: "premium",
    generatedAt: "2026-08-22T10:00:00.000Z",
    meta: { businessName: "Entreprise test", category: "Électricien", city: "Arlon" },
    observation: { name: "Entreprise test", category: "Électricien", city: "Arlon" },
    benchmark: { benchmark_score: score.reviewedScore.roundedScore },
    scoreContext: {
      ...score.reviewedScore,
      criteria: score.scoreInputs.criteria,
      provisional: false,
    },
    knowledge: {},
    reasoning: {},
  };
  const model = buildNarrativeModel(bundle, {
    strengths: [], weaknesses: [], opportunities: [], priorities: [], actionPlan: [],
  });
  const factual = "Aucun site web officiel n’est disponible pour comparer les coordonnées avec celles de la fiche Google.";
  assert.equal(model.websiteAvailabilityNote, factual);
  for (const html of [renderPremiumAuditHtml(model), renderFreeDiagnosticHtml({ ...model, reportType: "free" })]) {
    assert.match(html, /Aucun site web officiel n’est disponible/);
    assert.doesNotMatch(html, /coordonnées incohérentes/i);
    assert.doesNotMatch(html, /corriger les coordonnées sur le site/i);
    assert.doesNotMatch(html, /informations non vérifiées/i);
  }
});

test("les scripts conservent no_website dans brouillon, snapshot, lecture seule et duplication", () => {
  const free = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const snapshots = readFileSync(new URL("../functions/lib/auditQuestionnaireSnapshots.js", import.meta.url), "utf8");
  assert.match(free, /value:selected\?\.dataset\.special/);
  assert.match(free, /selectedOptionIndex:Number\(selected\?\.dataset\.optionIndex\)/);
  assert.match(free, /appliquerReponses\(answers\.responses \|\| answers\.reponses\)/);
  assert.match(snapshots, /prepareDuplicatedDraftAnswers\(snapshot\.answers/);
  assert.match(snapshots, /JSON\.stringify\(duplicatedAnswers\)/);
  assert.doesNotMatch(snapshots, /delete duplicated\.(responses|reponses)/);
  assert.match(snapshots, /normalizeQuestionnaireAnswers\(rawAnswers/);
});

test("les payloads v2, v3 et v4 restent lisibles", () => {
  for (const version of [2, 3, 4]) {
    const questionnaireVersion = `score-efficia-questionnaire-v${version}`;
    const answers = version < 4
      ? { questionnaireVersion, reponses: { nap: { points: 0, selectedOptionIndex: 1 } } }
      : { questionnaireVersion, responses: { nap: { points: 0, value: "no_website", selectedOptionIndex: 2 } } };
    const normalized = normalizeQuestionnaireAnswers(answers, questionnaireVersion);
    assert.equal(normalized.questionnaireVersion, questionnaireVersion);
    assert.equal(normalized.responses.nap.points, 0);
  }
});
