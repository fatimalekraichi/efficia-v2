import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as runComposerRoute } from "../functions/api/composer.js";
import { onRequestPost as runReasoningRoute } from "../functions/api/reasoning.js";
import { createSessionCookie } from "../functions/admin/_shared.js";

const TOKEN = "test-token";
const ADMIN_SECRET = "admin-secret";
const ADMIN_COOKIE = (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];

function makeAnalysisRow(overrides = {}) {
  return {
    analysis_id: "analysis-1",
    status: "completed",
    nom: "La Planche des Saveurs",
    ville: "Dinant",
    query: "La Planche des Saveurs Dinant",
    activity: "restaurant",
    search_query: "restaurant Dinant",
    place_id: "place-1",
    name: "La planche des saveurs",
    rating: 4.6,
    reviews: 449,
    photos_count: 623,
    description_length: 0,
    local_position: 4,
    fiche_json: JSON.stringify({ name: "La planche des saveurs" }),
    normalized_json: JSON.stringify({ category: "restaurant" }),
    competitors_json: JSON.stringify([{ name: "Concurrent", rating: 4.8, reviews: 324, photos_count: 234 }]),
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
      confidence: "established",
      summary: "La fiche obtient une base solide.",
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
    knowledge_completed_at: "2026-07-24T07:01:00.000Z",
    reasoning_json: null,
    document_model_json: null,
    reasoning_completed_at: null,
    composer_completed_at: null,
    created_at: "2026-07-24T07:00:00.000Z",
    updated_at: "2026-07-24T07:01:00.000Z",
    ...overrides,
  };
}

function makeDb(row, { premiumAuthorized = true, manualAuthorized = false } = {}) {
  return {
    row,
    updates: [],
    prepare(sql) {
      const db = this;
      return {
        bind: (...params) => ({
          async first() {
            if (sql.includes("JOIN orders")) {
              return premiumAuthorized
                ? { order_id: "order-1", status: "paid", offer_code: "audit", has_authorized_item: 1 }
                : null;
            }
            if (sql.includes("audit_creation_metadata")) {
              return manualAuthorized
                ? { analysis_id: row.analysis_id, creation_source: "admin_manual", audit_type: "premium", billing_status: "manual_unpaid", request_status: "completed" }
                : null;
            }
            return row;
          },
          async run() {
            db.updates.push({ sql, params });
            if (sql.includes("reasoning_json")) {
              row.reasoning_json = params[0];
              row.reasoning_completed_at = params[1];
              row.updated_at = params[2];
            }
            if (sql.includes("document_model_json")) {
              row.document_model_json = params[0];
              row.composer_completed_at = params[1];
              row.updated_at = params[2];
            }
          },
        }),
        async first() {
          return row;
        },
      };
    },
  };
}

function makeContext(db) {
  return {
    request: new Request("http://local.test/api/reasoning", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Cookie: ADMIN_COOKIE,
      },
      body: JSON.stringify({ analysisId: "analysis-1" }),
    }),
    env: {
      CONNECTOR_TOKEN: TOKEN,
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      ORDERS_DB: db,
    },
  };
}

test("reasoning puis composer persistent les JSON attendus pour une analyse complète", async () => {
  const db = makeDb(makeAnalysisRow());

  const reasoningResponse = await runReasoningRoute(makeContext(db));
  const reasoningJson = await reasoningResponse.json();

  assert.equal(reasoningResponse.status, 200);
  assert.equal(reasoningJson.status, "completed");
  assert.ok(reasoningJson.reasoning.reasoningVersion);
  assert.ok(reasoningJson.reasoning.reasonings.length > 0);
  assert.ok(db.row.reasoning_json);

  const composerResponse = await runComposerRoute(makeContext(db));
  const composerJson = await composerResponse.json();

  assert.equal(composerResponse.status, 200);
  assert.equal(composerJson.status, "completed");
  assert.ok(composerJson.documentModel.composerVersion);
  assert.equal(composerJson.documentModel.hero.businessName, "La planche des saveurs");
  assert.ok(db.row.document_model_json);
});

test("reasoning ne plante pas si Knowledge contient un signal non couvert", async () => {
  const db = makeDb(makeAnalysisRow({
    knowledge_json: JSON.stringify({
      confidence: "established",
      strengths: [{
        id: "UNKNOWN_SIGNAL",
        signal: "unknown-signal",
        businessImpact: "trust",
        priority: 5,
        severity: "positive",
        message: "Signal expérimental.",
      }],
      weaknesses: [],
      opportunities: [],
      top_priorities: [],
    }),
  }));

  const response = await runReasoningRoute(makeContext(db));
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.status, "completed");
  assert.deepEqual(json.reasoning.reasonings, []);
});

test("composer retourne 409 lorsque Reasoning n'a pas encore été exécuté", async () => {
  const db = makeDb(makeAnalysisRow());

  const response = await runComposerRoute(makeContext(db));
  const json = await response.json();

  assert.equal(response.status, 409);
  assert.deepEqual(json, { success: false, error: "Reasoning not completed." });
});

test("composer refuse la génération Premium sans commande payée liée", async () => {
  const db = makeDb(makeAnalysisRow({
    report_type: "premium",
    reasoning_json: JSON.stringify({ reasoningVersion: "test", reasonings: [] }),
  }), { premiumAuthorized: false });

  const response = await runComposerRoute(makeContext(db));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
  assert.equal(db.row.document_model_json, null);
});

test("composer autorise un Premium manuel manual_unpaid sans order_id", async () => {
  const db = makeDb(makeAnalysisRow({
    report_type: "premium",
    order_id: null,
    reasoning_json: JSON.stringify({ reasoningVersion: "test", reasonings: [] }),
  }), { premiumAuthorized: false, manualAuthorized: true });

  const response = await runComposerRoute(makeContext(db));
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.status, "completed");
  assert.ok(json.documentModel.composerVersion);
  assert.ok(db.row.document_model_json);
});
