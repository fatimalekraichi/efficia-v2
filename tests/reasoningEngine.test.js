import test from "node:test";
import assert from "node:assert/strict";
import fixture from "./fixtures/reasoning/la-planche.json" with { type: "json" };
import { runReasoningEngine } from "../functions/lib/reasoning-engine/reasoningEngine.js";
import { reasoningVersion } from "../functions/lib/reasoning-engine/reasoningConfig.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutBenchmarkInput() {
  const input = clone(fixture);
  delete input.context.benchmark;
  return input;
}

function allKnowledgeFindings(input = fixture) {
  return [
    ...input.knowledge.strengths.map((item) => ({ ...item, type: "strength" })),
    ...input.knowledge.weaknesses.map((item) => ({ ...item, type: "weakness" })),
    ...input.knowledge.opportunities.map((item) => ({ ...item, type: "opportunity" })),
  ];
}

test("déterminisme : même entrée, même sortie complète", () => {
  const first = runReasoningEngine(fixture);
  const second = runReasoningEngine(fixture);

  assert.deepEqual(first, second);
});

test("présence de reasoningVersion à la racine", () => {
  const output = runReasoningEngine(fixture);

  assert.equal(output.reasoningVersion, reasoningVersion);
  assert.equal(output.generatedAt, fixture.generatedAt);
});

test("conserve exactement priority, severity, signal, type et id du Knowledge", () => {
  const output = runReasoningEngine(fixture);
  const findings = allKnowledgeFindings();

  for (const finding of findings) {
    const reasoning = output.reasonings.find((item) => item.id === finding.id);
    assert.ok(reasoning, `Raisonnement manquant pour ${finding.id}`);
    assert.equal(reasoning.id, finding.id);
    assert.equal(reasoning.signal, finding.signal);
    assert.equal(reasoning.type, finding.type);
    assert.equal(reasoning.priority, finding.priority);
    assert.equal(reasoning.severity, finding.severity);
  }
});

test("angle concurrentiel obligatoire pour weaknesses et opportunities", () => {
  const output = runReasoningEngine(fixture);
  const actionable = output.reasonings.filter((item) => item.type !== "strength");

  assert.ok(actionable.length > 0);
  for (const reasoning of actionable) {
    assert.ok(reasoning.logic.competitiveAngle.length > 20);
    assert.match(reasoning.presentation.long, new RegExp(reasoning.logic.competitiveAngle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("angle concurrentiel inversé pour strengths", () => {
  const output = runReasoningEngine(fixture);
  const strength = output.reasonings.find((item) => item.id === "FORCE_REVIEWS");

  assert.equal(strength.type, "strength");
  assert.match(strength.logic.competitiveAngle, /vous/i);
  assert.match(strength.logic.competitiveAngle, /arbitrage|avantage/i);
  assert.equal(strength.actionability, null);
});

test("FORCE_REVIEWS utilise une cause positive", () => {
  const output = runReasoningEngine(fixture);
  const strength = output.reasonings.find((item) => item.id === "FORCE_REVIEWS");

  assert.match(strength.logic.cause, /supérieur|preuve sociale forte/i);
  assert.doesNotMatch(strength.logic.cause, /limiter|limité|ne suffit pas|freiner/i);
});

test("WEAK_REVIEWS utilise une cause négative", () => {
  const input = clone(fixture);
  input.knowledge.weaknesses.push({
    id: "WEAK_REVIEWS",
    signal: "reviews",
    businessImpact: "trust",
    priority: 8,
    severity: "high",
    message: "Votre volume d'avis est inférieur aux concurrents observés.",
  });

  const output = runReasoningEngine(input);
  const weakness = output.reasonings.find((item) => item.id === "WEAK_REVIEWS");

  assert.match(weakness.logic.cause, /limité|ne suffit pas/i);
  assert.doesNotMatch(weakness.logic.cause, /supérieur|preuve sociale forte/i);
});

test("aucune variante weakness ne peut être utilisée pour une strength", () => {
  const output = runReasoningEngine(fixture);
  const strengths = output.reasonings.filter((item) => item.type === "strength");

  for (const strength of strengths) {
    assert.doesNotMatch(
      JSON.stringify(strength.logic),
      /moins|limite|limit[ée]|ne suffit pas|faible|freiner|moins rassurantes au moment du choix/i,
    );
  }
});

test("cas La planche des saveurs : OPP_PHOTOS parle de comparaison côte à côte", () => {
  const output = runReasoningEngine(fixture);
  const photos = output.reasonings.find((item) => item.id === "OPP_PHOTOS");

  assert.ok(photos);
  assert.match(photos.logic.competitiveAngle, /côte à côte|concurrente plus visuelle/i);
});

test("aucune phrase générique pour un signal non couvert", () => {
  const input = clone(fixture);
  input.knowledge.weaknesses.push({
    id: "WEAK_UNKNOWN",
    signal: "unknown_signal",
    businessImpact: "conversion",
    priority: 10,
    severity: "high",
    message: "Signal inconnu.",
  });

  const output = runReasoningEngine(input);

  assert.equal(output.reasonings.some((item) => item.id === "WEAK_UNKNOWN"), false);
  assert.equal(JSON.stringify(output).includes("Votre fiche manque"), false);
});

test("fonctionne sans benchmark et baisse la confidence", () => {
  const withBenchmark = runReasoningEngine(fixture);
  const withoutBenchmark = runReasoningEngine(withoutBenchmarkInput());
  const withPhotos = withBenchmark.reasonings.find((item) => item.id === "OPP_PHOTOS");
  const withoutPhotos = withoutBenchmark.reasonings.find((item) => item.id === "OPP_PHOTOS");

  assert.ok(withoutBenchmark.reasonings.length > 0);
  assert.ok(withoutPhotos.confidence < withPhotos.confidence);
});

test("evidence contient competitorMedian quand disponible", () => {
  const output = runReasoningEngine(fixture);
  const photos = output.reasonings.find((item) => item.id === "OPP_PHOTOS");

  assert.deepEqual(photos.evidence, {
    metric: "photos_count",
    value: 10,
    competitorMedian: 234,
    unit: "photos",
    source: "Observation + Benchmark",
  });
});

test("evidence a competitorMedian à null sans benchmark", () => {
  const output = runReasoningEngine(withoutBenchmarkInput());
  const photos = output.reasonings.find((item) => item.id === "OPP_PHOTOS");

  assert.equal(photos.evidence.competitorMedian, null);
});

test("source evidence est Observation lorsque competitorMedian est null", () => {
  const output = runReasoningEngine(withoutBenchmarkInput());
  const photos = output.reasonings.find((item) => item.id === "OPP_PHOTOS");

  assert.equal(photos.evidence.value, 10);
  assert.equal(photos.evidence.competitorMedian, null);
  assert.equal(photos.evidence.source, "Observation");
});

test("séparation stricte logic/presentation", () => {
  const output = runReasoningEngine(fixture);
  const reasoning = output.reasonings[0];

  assert.deepEqual(Object.keys(reasoning.logic).sort(), [
    "businessImpact",
    "cause",
    "competitiveAngle",
    "googleImpact",
  ]);
  assert.deepEqual(Object.keys(reasoning.presentation).sort(), ["long", "short"]);
  assert.doesNotMatch(JSON.stringify(reasoning.logic), /<|>|class=|<\/|#/);
});

test("weaknesses et opportunities portent une actionability complète", () => {
  const output = runReasoningEngine(fixture);
  const actionable = output.reasonings.filter((item) => item.type !== "strength");

  for (const reasoning of actionable) {
    assert.equal(typeof reasoning.actionability.difficulty, "string");
    assert.equal(typeof reasoning.actionability.estimatedTime, "string");
    assert.equal(typeof reasoning.actionability.requiresGoogleAccess, "boolean");
    assert.equal(typeof reasoning.actionability.requiresProfessional, "boolean");
    assert.equal(typeof reasoning.actionability.canEfficiaAutomate, "boolean");
  }
});
