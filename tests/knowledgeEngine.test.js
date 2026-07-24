import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runKnowledgeEngine } from "../functions/lib/knowledgeEngine.js";

async function fixture(name) {
  const path = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8"));
}

function allFindings(output) {
  return [...output.strengths, ...output.weaknesses, ...output.opportunities, ...output.top_priorities];
}

function assertNoInvalidText(output) {
  const text = JSON.stringify(output);
  assert.equal(text.includes("undefined"), false);
  assert.equal(text.includes("NaN"), false);
  assert.equal(text.includes("null"), false);
}

test("déterminisme : même input, même JSON", async () => {
  const input = await fixture("knowledge-la-planche");
  assert.deepEqual(runKnowledgeEngine(input), runKnowledgeEngine(input));
});

test("aucune contradiction : un signal ne sort pas en force et en frein", async () => {
  const input = await fixture("knowledge-la-planche");
  const output = runKnowledgeEngine(input);
  const strengthSignals = new Set(output.strengths.map((finding) => finding.signal));
  const negativeSignals = new Set([...output.weaknesses, ...output.opportunities].map((finding) => finding.signal));

  for (const signal of strengthSignals) {
    assert.equal(negativeSignals.has(signal), false, `Signal contradictoire : ${signal}`);
  }
});

test("top priorities : maximum 3 et uniquement weaknesses/opportunities", async () => {
  const input = await fixture("knowledge-weak-profile");
  const output = runKnowledgeEngine(input);
  const allowed = new Set([...output.weaknesses, ...output.opportunities].map((finding) => finding.id));

  assert.ok(output.top_priorities.length <= 3);
  for (const priority of output.top_priorities) {
    assert.equal(allowed.has(priority.id), true);
  }
});

test("La Planche des Saveurs : avis en force, photos en opportunité, pas de faiblesse avis", async () => {
  const input = await fixture("knowledge-la-planche");
  const output = runKnowledgeEngine(input);

  assert.ok(output.strengths.some((finding) => finding.id === "FORCE_REVIEWS"));
  assert.ok(output.opportunities.some((finding) => finding.id === "OPP_PHOTOS"));
  assert.equal(output.weaknesses.some((finding) => finding.id === "WEAK_REVIEWS"), false);
  assert.ok(output.strengths.some((finding) => finding.id === "FORCE_POSITION"));
  assert.ok(output.top_priorities.some((finding) => finding.id === "OPP_PHOTOS"));
  assert.equal(output.opportunities.some((finding) => finding.signal === "reviews"), false);
});

test("mode sans benchmark : confiance indicative et aucun message concurrentiel", async () => {
  const input = await fixture("knowledge-no-benchmark");
  const output = runKnowledgeEngine(input);
  const text = JSON.stringify(output).toLowerCase();

  assert.equal(output.confidence, "indicative");
  assert.equal(output.strengths.some((finding) => ["FORCE_REVIEWS", "FORCE_RATING", "FORCE_PHOTOS", "FORCE_SCORE"].includes(finding.id)), false);
  assert.equal(output.weaknesses.some((finding) => finding.id === "WEAK_REVIEWS"), false);
  assert.equal(text.includes("concurrent"), false);
  assert.equal(text.includes("médiane"), false);
});

test("données null : pas d'exception et aucune valeur technique affichée", () => {
  const output = runKnowledgeEngine({
    analysisId: "null-data",
    business: {
      name: null,
      category: null,
      rating: null,
      reviews: null,
      photos_count: null,
      has_description: null,
      description_length: null,
      secondary_categories: null,
      position: null,
      last_review_age_days: null,
      owner_response_rate: null
    },
    benchmark: {
      benchmark_score: null,
      panel_size: null,
      confidence: "estimated",
      percentiles: { rating: null, reviews: null, photos: null },
      gaps: { rating: null, reviews: null, photos: null },
      competitor_median: { rating: null, reviews: null, photos: null },
      top_competitor: { name: null, rating: null, reviews: null, photos: null }
    }
  });

  assertNoInvalidText(output);
});

test("cas fiche faible : faiblesses et opportunités cohérentes", async () => {
  const input = await fixture("knowledge-weak-profile");
  const output = runKnowledgeEngine(input);

  assert.ok(output.weaknesses.some((finding) => finding.id === "WEAK_RATING"));
  assert.ok(output.weaknesses.some((finding) => finding.id === "WEAK_POSITION"));
  assert.ok(output.opportunities.some((finding) => finding.id === "OPP_PHOTOS"));
  assert.ok(output.top_priorities.length > 0);
});

test("cas fiche très forte : plusieurs forces et peu de priorités", async () => {
  const input = await fixture("knowledge-strong-profile");
  const output = runKnowledgeEngine(input);

  assert.ok(output.strengths.length >= 3);
  assert.ok(output.top_priorities.length <= 1);
  assert.ok(output.strengths.some((finding) => finding.id === "FORCE_SCORE"));
});

test("chaque constat porte impact métier et severity", async () => {
  const input = await fixture("knowledge-weak-profile");
  const output = runKnowledgeEngine(input);
  const impacts = new Set(["visibility", "trust", "conversion", "engagement", "completeness"]);
  const severities = new Set(["critical", "high", "medium", "low", "positive"]);

  for (const finding of allFindings(output)) {
    assert.equal(impacts.has(finding.businessImpact), true, finding.id);
    assert.equal(severities.has(finding.severity), true, finding.id);
  }
});
