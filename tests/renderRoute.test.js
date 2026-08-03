import test from "node:test";
import assert from "node:assert/strict";
import { createSessionCookie } from "../functions/admin/_shared.js";
import { renderAnalysisById, renderLatestAnalysis } from "../functions/api/render/_shared.js";

const TOKEN = "test-token";
const ADMIN_SECRET = "admin-secret";

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
  description_length: 0,
  local_position: 4,
  competitors_json: JSON.stringify([
    {
      name: "Concurrent",
      rating: 4.8,
      reviews: 324,
      photos_count: 234,
    },
  ]),
  benchmark_score: 97,
  avg_rating: 4.7,
  avg_reviews: 340,
  avg_photos: 234,
  rating_gap: -0.1,
  reviews_gap: 109,
  photos_gap: 389,
  rating_percentile: 17,
  reviews_percentile: 100,
  photos_percentile: 100,
  top_competitor_name: "Concurrent",
  top_competitor_rating: 4.8,
  top_competitor_reviews: 324,
  benchmark_completed_at: "2026-07-24T07:00:30.000Z",
  knowledge_json: JSON.stringify({
    version: "1.0.0",
    summary: "La fiche obtient une base solide.",
    confidence: "established",
    strengths: [{
      id: "FORCE_REVIEWS",
      signal: "reviews",
      businessImpact: "trust",
      priority: 13.5,
      severity: "positive",
      message: "Votre réputation est portée par un volume d'avis exceptionnel.",
    }],
    weaknesses: [{
      id: "WEAK_POSITION",
      signal: "position",
      businessImpact: "visibility",
      priority: 9,
      severity: "high",
      message: "Votre fiche n'apparaît pas dans les trois premiers résultats.",
    }],
    opportunities: [{
      id: "OPP_DESCRIPTION",
      signal: "description",
      businessImpact: "conversion",
      priority: 9,
      severity: "high",
      message: "Votre description est peu développée.",
    }],
    top_priorities: [{
      id: "WEAK_POSITION",
      signal: "position",
      businessImpact: "visibility",
      priority: 9,
      severity: "high",
      message: "Votre fiche n'apparaît pas dans les trois premiers résultats.",
    }],
  }),
  created_at: "2026-07-24T07:00:00.000Z",
  updated_at: "2026-07-24T07:01:00.000Z",
  knowledge_completed_at: "2026-07-24T07:01:00.000Z",
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
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
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
  assert.match(html, /97/);
  assert.match(html, /Votre plan d’exécution sur 30 jours/);
});

test("renderLatestAnalysis retourne du HTML pour la dernière analyse", async () => {
  const response = await renderLatestAnalysis(makeContext(analysisRow));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.match(html, /Vos points forts/);
});

test("renderAnalysisById retourne 404 si l'analyse est inconnue", async () => {
  const response = await renderAnalysisById(makeContext(null), "analysis-missing");
  const json = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(json, { success: false, error: "Analysis not found." });
});

test("renderAnalysisById bloque l'aperçu tant que la validation humaine est attendue", async () => {
  const response = await renderAnalysisById(makeContext({
    ...analysisRow,
    status: "awaiting_review",
  }), "analysis-1");
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.equal(json.error, "MANUAL_REVIEW_REQUIRED");
  assert.equal(json.reviewUrl, "/admin/audit-review/analysis-1");
});

test("renderAnalysisById exige le Bearer token", async () => {
  const context = makeContext(analysisRow);
  context.request = new Request("http://local.test/api/render/analysis-1");

  const response = await renderAnalysisById(context, "analysis-1");
  const json = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(json, { success: false, error: "Unauthorized." });
});

test("renderAnalysisById accepte aussi la session admin sans exposer le Bearer technique", async () => {
  const context = makeContext(analysisRow);
  const cookie = await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET });
  context.request = new Request("http://local.test/api/render/analysis-1", {
    headers: { Cookie: cookie.split(";")[0] },
  });

  const response = await renderAnalysisById(context, "analysis-1");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /La Planche des Saveurs/);
});

test("renderAnalysisById ajoute un bouton de téléchargement masqué à l'impression", async () => {
  const response = await renderAnalysisById(makeContext({
    ...analysisRow,
    status: "approved",
  }), "analysis-1");
  const html = await response.text();

  assert.match(html, /Télécharger le PDF/);
  assert.match(html, /class="efficia-preview-toolbar no-print"/);
  assert.match(html, /@page/);
  assert.match(html, /print-color-adjust: exact/);
});
