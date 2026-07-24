import test from "node:test";
import assert from "node:assert/strict";
import reasoningFixture from "./fixtures/reasoning/la-planche.json" with { type: "json" };
import { runComposer } from "../functions/lib/composer-engine/composerEngine.js";
import { COMPOSER_CONFIG } from "../functions/lib/composer-engine/composerConfig.js";
import { COMPOSER_VERSION } from "../functions/lib/composer-engine/composerVersion.js";
import { runReasoningEngine } from "../functions/lib/reasoning-engine/reasoningEngine.js";
import { respectsToneRules } from "../functions/lib/composer-engine/toneRules.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function laPlancheBundle() {
  const fixture = clone(reasoningFixture);
  return {
    analysisId: fixture.analysisId,
    generatedAt: fixture.generatedAt,
    meta: {
      businessName: fixture.context.business.name,
      category: fixture.context.business.category,
      city: "Dinant",
      generatedAt: fixture.generatedAt,
    },
    observation: fixture.context.business,
    benchmark: fixture.context.benchmark,
    knowledge: fixture.knowledge,
    reasoning: runReasoningEngine(fixture),
  };
}

test("déterminisme : même bundle, même documentModel complet", () => {
  const bundle = laPlancheBundle();

  assert.deepEqual(runComposer(bundle), runComposer(bundle));
});

test("composerVersion présent à la racine et dans le footer", () => {
  const output = runComposer(laPlancheBundle());

  assert.equal(output.composerVersion, COMPOSER_VERSION);
  assert.equal(output.footer.versions.composer, COMPOSER_VERSION);
  assert.equal(output.locale, "fr");
});

test("respecte les plafonds de sélection", () => {
  const output = runComposer(laPlancheBundle());

  assert.ok(output.strengths.length <= COMPOSER_CONFIG.caps.strengths);
  assert.ok(output.weaknesses.length <= COMPOSER_CONFIG.caps.weaknesses);
  assert.ok(output.opportunities.length <= COMPOSER_CONFIG.caps.opportunities);
  assert.ok(output.priorities.length <= COMPOSER_CONFIG.caps.priorities);
  assert.ok(output.keyFindings.length <= COMPOSER_CONFIG.caps.keyFindings);
  assert.ok(output.actionPlan.length <= COMPOSER_CONFIG.caps.actionPlan);
});

test("déduplique les signaux dans les cartes faiblesse/opportunité et ne contredit pas les forces", () => {
  const output = runComposer(laPlancheBundle());
  const strengthSignals = new Set(output.strengths.map((item) => item.signal));
  const issueSignals = [...output.weaknesses, ...output.opportunities].map((item) => item.signal);

  assert.equal(new Set(issueSignals).size, issueSignals.length);
  for (const signal of issueSignals) {
    assert.equal(strengthSignals.has(signal), false);
  }
});

test("actionPlan ordonné par score de composition et quick wins en premier", () => {
  const output = runComposer(laPlancheBundle());

  assert.deepEqual(output.actionPlan.map((item) => item.order), [1, 2, 3].slice(0, output.actionPlan.length));
  assert.equal(output.actionPlan[0].id, "OPP_DESCRIPTION");
  assert.equal(output.actionPlan[0].difficulty, "easy");
});

test("improvementPotential cohérent et explicable", () => {
  const output = runComposer(laPlancheBundle());
  const potential = output.hero.improvementPotential;

  assert.equal(typeof potential.score, "number");
  assert.ok(potential.score >= 0 && potential.score <= 100);
  assert.ok(COMPOSER_CONFIG.improvementPotential.bands.some((band) => band.label === potential.label));
  assert.ok(potential.stars >= 1 && potential.stars <= 5);
  assert.ok(potential.drivers.length > 0);
  assert.equal(potential.note, COMPOSER_CONFIG.improvementPotential.note);
});

test("aucune réanalyse : le Composer ne modifie pas le bundle", () => {
  const bundle = laPlancheBundle();
  const before = clone(bundle);
  runComposer(bundle);

  assert.deepEqual(bundle, before);
});

test("conserve exactement les priorités et severities issues du Reasoning", () => {
  const bundle = laPlancheBundle();
  const output = runComposer(bundle);
  const reasoningsById = new Map(bundle.reasoning.reasonings.map((item) => [item.id, item]));

  for (const section of [output.strengths, output.weaknesses, output.opportunities, output.priorities]) {
    for (const item of section) {
      const source = reasoningsById.get(item.id);
      assert.ok(source);
      assert.equal(item.priority, source.priority);
      assert.equal(item.severity, source.severity);
    }
  }
});

test("fixture La planche des saveurs : documentModel attendu", () => {
  const output = runComposer(laPlancheBundle());

  assert.equal(output.hero.businessName, "La planche des saveurs");
  assert.equal(output.hero.score, 80);
  assert.equal(output.strengths[0].id, "FORCE_REVIEWS");
  assert.equal(output.priorities[0].id, "WEAK_POSITION");
  assert.equal(output.actionPlan[0].id, "OPP_DESCRIPTION");
});

test("Sprint 2 : produit headline, executiveSummary et whyNow par templates", () => {
  const output = runComposer(laPlancheBundle());

  assert.match(output.hero.headline, /inspire déjà confiance|réputation/i);
  assert.match(output.executiveSummary.text, /réputation solide/i);
  assert.match(output.executiveSummary.text, /visibilité/i);
  assert.match(output.whyNow.text, /Chaque semaine/i);
  assert.match(output.whyNow.text, /meilleur rapport entre effort et impact potentiel/i);
});

test("Sprint 2 : les textes respectent les règles de ton", () => {
  const output = runComposer(laPlancheBundle());
  const text = [
    output.hero.headline,
    output.executiveSummary.text,
    output.whyNow.text,
    ...output.keyFindings.map((item) => item.line),
  ].join(" ");

  assert.equal(respectsToneRules(text), true);
  assert.doesNotMatch(text, /votre fiche est mauvaise|vous perdez des clients/i);
});

test("Sprint 2 : keyFindings utilisent les templates de synthèse", () => {
  const output = runComposer(laPlancheBundle());

  assert.match(output.keyFindings[0].line, /449 avis/i);
  assert.match(output.keyFindings[1].line, /Visibilité locale/i);
});
