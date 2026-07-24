import test from "node:test";
import assert from "node:assert/strict";
import { renderAnalysisById, renderLatestAnalysis } from "../functions/api/render/_shared.js";

const TOKEN = "test-token";

const analysisRow = {
  analysis_id: "analysis-1",
  status: "completed",
  nom: "La Planche des Saveurs",
  ville: "Dinant",
  activity: "restaurant",
  name: "La Planche des Saveurs",
  rating: 4.6,
  reviews: 449,
  photos_count: 623,
  competitors_json: JSON.stringify([
    {
      name: "Concurrent",
      rating: 4.8,
      reviews: 324,
      photos_count: 234,
    },
  ]),
  benchmark_score: 97,
  top_competitor_name: "Concurrent",
  top_competitor_rating: 4.8,
  top_competitor_reviews: 324,
  knowledge_json: JSON.stringify({
    version: "1.0.0",
    summary: "La fiche obtient une base solide.",
    strengths: [{ signal: "reviews", message: "Bon volume d'avis." }],
    weaknesses: [{ signal: "position", message: "Position à renforcer." }],
    opportunities: [{ signal: "description", message: "Description à enrichir." }],
    top_priorities: [{ signal: "position", message: "Renforcer la visibilité locale." }],
  }),
  created_at: "2026-07-24T07:00:00.000Z",
  updated_at: "2026-07-24T07:01:00.000Z",
};

function makeContext(row, analysisId = "analysis-1") {
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return row;
            },
          };
        },
        async first() {
          return row;
        },
      };
    },
  };

  return {
    request: new Request("http://local.test/api/render/analysis-1", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }),
    params: { analysisId },
    env: {
      CONNECTOR_TOKEN: TOKEN,
      ORDERS_DB: db,
    },
  };
}

test("renderAnalysisById retourne du HTML pour une analyse existante", async () => {
  const response = await renderAnalysisById(makeContext(analysisRow), "analysis-1");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /La Planche des Saveurs/);
  assert.match(html, /Résumé exécutif/);
  assert.match(html, /97\/100/);
});

test("renderLatestAnalysis retourne du HTML pour la dernière analyse", async () => {
  const response = await renderLatestAnalysis(makeContext(analysisRow));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.match(html, /Benchmark/);
});

test("renderAnalysisById retourne 404 si l'analyse est inconnue", async () => {
  const response = await renderAnalysisById(makeContext(null), "analysis-missing");
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, { success: false, error: "Analysis not found." });
});

test("renderAnalysisById reste ouvrable directement dans le navigateur", async () => {
  const context = makeContext(analysisRow);
  context.request = new Request("http://local.test/api/render/analysis-1");

  const response = await renderAnalysisById(context, "analysis-1");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.match(html, /La Planche des Saveurs/);
});
