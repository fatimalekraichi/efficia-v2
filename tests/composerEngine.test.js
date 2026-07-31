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

test("Sprint 1 (point 11) : hero.comparison oppose VOUS et la meilleure fiche observée", () => {
  const output = runComposer(laPlancheBundle());
  const comparison = output.hero.comparison;

  assert.ok(comparison);
  assert.deepEqual(comparison.you, { label: "Vous", rating: 4.6, reviews: 449, photos: 10 });
  assert.equal(comparison.best.name, "Concurrent anonymisé");
  assert.equal(comparison.best.rating, 4.8);
  assert.equal(comparison.best.reviews, 324);
  // La fiche de référence a une valeur de photos directe (234) dans la fixture :
  // pas de repli sur la moyenne concurrents.
  assert.equal(comparison.best.photos, 234);
  assert.equal(comparison.best.photosIsEstimate, false);
});

test("Sprint 1 (point 11) : hero.comparison absent sans fiche de référence nommée", () => {
  const fixtureWithoutTop = clone(reasoningFixture);
  delete fixtureWithoutTop.context.benchmark.top_competitor;
  const bundle = {
    analysisId: fixtureWithoutTop.analysisId,
    generatedAt: fixtureWithoutTop.generatedAt,
    meta: { businessName: fixtureWithoutTop.context.business.name },
    observation: fixtureWithoutTop.context.business,
    benchmark: fixtureWithoutTop.context.benchmark,
    knowledge: fixtureWithoutTop.knowledge,
    reasoning: runReasoningEngine(fixtureWithoutTop),
  };

  const output = runComposer(bundle);

  assert.equal(output.hero.comparison, null);
});

test("Sprint 1 (point 3) : model.domains reprend les 6 domaines du Score Efficia", () => {
  const bundle = laPlancheBundle();
  bundle.scoreContext = {
    categories: [
      { key: "reputation", label: "Réputation", brut: 18, maxEvalue: 20, pct: 0.9 },
      { key: "visibilite", label: "Visibilité", brut: 10, maxEvalue: 20, pct: 0.5 },
    ],
  };

  const output = runComposer(bundle);

  assert.deepEqual(output.domains, [
    { key: "reputation", label: "Réputation", points: 18, max: 20, pct: 0.9 },
    { key: "visibilite", label: "Visibilité", points: 10, max: 20, pct: 0.5 },
  ]);
});

test("Sprint 1 (point 3) : hero.rank restitue le nombre de concurrents mieux notés", () => {
  const bundle = laPlancheBundle();
  bundle.benchmark = { ...bundle.benchmark, rank: { aheadCount: 2, totalCompetitors: 3 } };

  const output = runComposer(bundle);

  assert.equal(output.hero.rank.aheadCount, 2);
  assert.equal(output.hero.rank.totalCompetitors, 3);
  assert.match(output.hero.rank.text, /derrière 2 concurrents/i);
  assert.match(output.hero.rank.text, /sur 3 observés/i);
});

test("Sprint 1 (point 3) : hero.rank.text est null sans avance concurrentielle connue", () => {
  const output = runComposer(laPlancheBundle());

  assert.equal(output.hero.rank.text, null);
});
