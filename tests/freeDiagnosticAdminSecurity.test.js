import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestGet as getContext } from "../functions/api/admin/free-diagnostic-context/[analysisId].js";
import { onRequestPost as collectDiagnostic } from "../functions/api/admin/free-diagnostic-collect/[analysisId].js";
import { onRequestPost as authorizePremium } from "../functions/api/admin/premium-audit-authorization/[analysisId].js";
import { loadAnalysisById } from "../functions/api/analysis/_shared.js";
import { buildFreeDiagnosticCollectionState } from "../functions/lib/freeDiagnosticProductionLink.js";
import { calculateScoreDetail } from "../functions/lib/score-efficia/scoreEngine.js";
import { LEGACY_SCORING_VERSION } from "../functions/lib/score-efficia/scoreConfig.js";

const ADMIN_SECRET = "local-admin-secret";
const ANALYSIS_ID = "analysis-free-123";
const GOOGLE_URL = "https://maps.app.goo.gl/short-test";
const CANONICAL_GOOGLE_URL = "https://www.google.com/maps/place/Maison-Test";
const migrations = [
  "0001_orders_tasks.sql", "0002_audit_production_tracking.sql", "0003_analyses.sql",
  "0004_analysis_competitors.sql", "0005_analysis_benchmark.sql", "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql", "0008_order_analysis_link.sql", "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql", "0011_score_efficia_historical.sql", "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql", "0014_audit_drafts.sql",
  "0016_admin_manual_audits.sql",
];

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrations.forEach((name) => {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    });
  }

  prepare(sql) {
    const database = this.sqlite;
    const bound = (params = []) => ({
      bind: (...nextParams) => bound(nextParams),
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      first: async () => database.prepare(sql).get(...params) || null,
      run: async () => database.prepare(sql).run(...params),
    });
    return bound();
  }

  count(table) {
    return Number(this.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  }
}

function seedAnalysis(db, {
  analysisId = ANALYSIS_ID, reportType = "free", status = "awaiting_review", withRequest = true,
  googleUrl = GOOGLE_URL, companyName = "", city = "",
} = {}) {
  const now = "2026-08-19T10:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, activity, status, created_at, updated_at, report_type
    ) VALUES (?, ?, 'Non renseignée', ?, 'boulangerie', ?, ?, ?, ?)
  `).run(analysisId, companyName || googleUrl || "Maison saisie", googleUrl || `${companyName} ${city}`, status, now, now, reportType);
  if (withRequest) {
    db.sqlite.prepare(`
      INSERT INTO diagnostic_requests (
        request_id, idempotency_key, analysis_id, first_name, email, company_name, city,
        google_business_url, status, mailerlite_status, created_at, updated_at
      ) VALUES (
        'request-free-123', '7fd0a4a4-7fb7-4be3-bd4b-4290055134f8', ?, 'Fatima',
        'fatima@example.com', ?, ?, ?, 'awaiting_review', 'synced', ?, ?
      )
    `).run(analysisId, companyName || null, city || null, googleUrl || null, now, now);
  }
}

function seedOrder(db, {
  analysisId = ANALYSIS_ID,
  orderId = "order-premium-123",
  status = "paid",
  offerCode = "audit",
  link = true,
} = {}) {
  const now = "2026-08-19T10:05:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO orders (
      order_id, stripe_session_id, email, company_name, offer_code, offer_name,
      amount_total, currency, status, paid_at, created_at, updated_at
    ) VALUES (?, ?, 'client@example.com', 'Maison Test', ?, 'Offre test', 9900, 'eur', ?, ?, ?, ?)
  `).run(orderId, `cs_test_${orderId}`, offerCode, status, now, now, now);
  db.sqlite.prepare(`
    INSERT INTO order_items (
      order_item_id, order_id, stripe_price_id, offer_code, offer_name,
      quantity, amount_total, currency, created_at
    ) VALUES (?, ?, ?, ?, 'Offre test', 1, 9900, 'eur', ?)
  `).run(`item-${orderId}`, orderId, `price-${orderId}`, offerCode, now);
  db.sqlite.prepare(`
    INSERT INTO order_tasks (
      task_id, order_id, task_type, title, status, offer_code, created_at, updated_at, analysis_id
    ) VALUES (?, ?, 'audit_to_do', 'Audit à réaliser', 'todo', ?, ?, ?, ?)
  `).run(`task-${orderId}`, orderId, offerCode, now, now, link ? analysisId : "analysis-other");
  if (link) {
    db.sqlite.prepare("UPDATE analyses SET order_id = ? WHERE analysis_id = ?").run(orderId, analysisId);
  }
}

function seedManualMetadataAndDraft(db, analysisId = ANALYSIS_ID) {
  const now = "2026-08-22T07:36:23.123Z";
  db.sqlite.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES ('manual-free-collection-test', ?, 'admin_manual', 'free',
      'not_applicable', 'completed', ?, ?)
  `).run(analysisId, now, now);
  db.sqlite.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES ('manual-free-draft-test', ?, 'draft', 'free',
      'score-efficia-questionnaire-v4', '{"preserved":true}', 'questionnaire', ?, ?)
  `).run(analysisId, now, now);
}

function markAnalysisCollected(db, analysisId = ANALYSIS_ID) {
  db.sqlite.prepare(`
    UPDATE analyses
    SET nom = 'Maison Test', ville = 'Bruxelles', place_id = 'place-target', name = 'Maison Test',
        rating = 4.7, reviews = 82, photos_count = 31, description_length = 20,
        activity = 'Pâtisserie', competitors_json = '[]',
        fiche_json = '{"name":"Maison Test","place_id":"place-target","city":"Bruxelles","category":"Pâtisserie","postal_code":"1000","country":"Belgique","country_code":"BE"}',
        normalized_json = '{"name":"Maison Test","place_id":"place-target","city":"Bruxelles","category":"Pâtisserie","observed_fields":[],"postal_code":"1000","country":"Belgique","country_code":"BE"}'
    WHERE analysis_id = ?
  `).run(analysisId);
}

async function cookie() {
  return (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
}

async function context(db, analysisId = ANALYSIS_ID, { authenticated = true, body = {} } = {}) {
  return {
    request: new Request(`https://preview.local/api/admin/free-diagnostic-collect/${analysisId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Cookie: await cookie() } : {}),
      },
      body: JSON.stringify(body),
    }),
    params: { analysisId },
    env: {
      ADMIN_SESSION_SECRET: ADMIN_SECRET,
      ORDERS_DB: db,
      OUTSCRAPER_API_KEY: "simulated-provider-key",
    },
  };
}

function installProviderFixture({ fail = false, notFound = false } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (url.hostname === "maps.app.goo.gl") {
      assert.equal(init.redirect, "manual");
      return new Response(null, { status: 302, headers: { Location: CANONICAL_GOOGLE_URL } });
    }
    if (url.hostname === "api.outscraper.com") {
      // Geocoding du centre neutre de la localité (resolveLocalityCenter,
      // localityGeocoder.js) — hôte distinct de l'identification/recherche
      // concurrentielle (api.app.outscraper.com). Répond toujours avec
      // succès, y compris quand `fail` simule un échec fournisseur : ces
      // tests isolent précisément l'échec de la recherche elle-même, une
      // fois l'ancrage déjà résolu (jamais un échec de geocoding, couvert
      // séparément par tests/localityGeocoder.test.js et
      // tests/freeDiagnosticGeographicAnchor.test.js).
      assert.equal(init.headers["X-API-KEY"], "simulated-provider-key");
      return Response.json({
        data: [[{ latitude: 50.8503, longitude: 4.3517, city: "Bruxelles", postal_code: "1000", country_code: "BE" }]],
      });
    }
    assert.equal(url.hostname, "api.app.outscraper.com");
    assert.equal(init.headers["X-API-KEY"], "simulated-provider-key");
    if (fail) {
      return new Response("fatima@example.com secret-provider-payload", { status: 500 });
    }
    const query = url.searchParams.get("query") || "";
    if (notFound && query === CANONICAL_GOOGLE_URL) {
      return Response.json({ data: [[{ place_id: "__NO_PLACE_FOUND__", error: "secret-provider-payload" }]] });
    }
    const target = {
      name: "Maison Test",
      place_id: "place-target",
      rating: 4.7,
      reviews: 82,
      photos_count: 31,
      description: "Description publique",
      city: "Bruxelles",
      category: "Pâtisserie",
      location_link: "https://www.google.com/maps/place/target",
      cid: "cid-target",
      postal_code: "1000",
      country: "Belgique",
      country_code: "BE",
    };
    const data = query === CANONICAL_GOOGLE_URL
      ? [[target]]
      : [[target,
        {
          name: "Concurrent local",
          place_id: "place-competitor",
          rating: 4.8,
          reviews: 120,
          photos_count: 45,
          city: "Bruxelles",
        },
        {
          name: "Concurrent local 2",
          place_id: "place-competitor-2",
          rating: 4.6,
          reviews: 90,
          photos_count: 30,
          city: "Bruxelles",
        },
        {
          name: "Concurrent local 3",
          place_id: "place-competitor-3",
          rating: 4.7,
          reviews: 100,
          photos_count: 35,
          city: "Bruxelles",
        },
      ]];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const restore = () => { globalThis.fetch = originalFetch; };
  restore.calls = calls;
  return restore;
}

test("la collecte du diagnostic gratuit exige une session admin", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { authenticated: false }));
  assert.equal(response.status, 401);
});

test("une analyse absente, non gratuite ou sans demande associée est refusée", async () => {
  const db = new LocalD1();
  const absent = await collectDiagnostic(await context(db, "analysis-absent"));
  assert.equal(absent.status, 404);

  seedAnalysis(db, { analysisId: "analysis-premium", reportType: "premium", withRequest: false });
  const premium = await collectDiagnostic(await context(db, "analysis-premium"));
  assert.equal(premium.status, 409);

  seedAnalysis(db, { analysisId: "analysis-unlinked", withRequest: false });
  const unlinked = await collectDiagnostic(await context(db, "analysis-unlinked"));
  assert.equal(unlinked.status, 403);

  seedAnalysis(db, { analysisId: "analysis-completed", status: "completed" });
  const completed = await collectDiagnostic(await context(db, "analysis-completed"));
  assert.equal(completed.status, 409);
});

test("la collecte serveur réutilise le même analysisId sans créer de commande ni inventer l’activité", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  const restoreFetch = installProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.analysisId, ANALYSIS_ID);
    assert.equal(body.status, "awaiting_review");
    assert.equal(body.reportType, "free");
    assert.equal(body.business.company, "Maison Test");
    assert.equal(body.business.city, "Bruxelles");
    assert.equal(body.business.activity, "Pâtisserie");
    assert.equal(body.business.activitySource, "detected");
    assert.equal(Object.hasOwn(body.business, "googleBusinessUrl"), false);
    const historicalEngineOutput = buildFreeDiagnosticCollectionState(await loadAnalysisById(db, ANALYSIS_ID));
    assert.deepEqual(body.scorePrefill, historicalEngineOutput.scorePrefill);
    const automaticCriteria = body.scorePrefill.criteria.filter((criterion) => criterion.points !== null);
    const manualCriteria = body.scorePrefill.criteria.filter((criterion) => criterion.points === null);
    const prefilledKeys = new Set([
      "categoriePrincipale", "categoriesSecondaires", "horaires", "adresse",
      "descriptionRemplie", "servicesPresents",
    ]);
    assert.equal(body.scorePrefill.criteria.length, 29);
    assert.equal(automaticCriteria.length, 6);
    assert.equal(manualCriteria.length, 23);
    assert.equal(automaticCriteria.filter((criterion) => prefilledKeys.has(criterion.key)).length, 1);
    assert.equal(automaticCriteria.filter((criterion) => !prefilledKeys.has(criterion.key)).length, 5);
    const scoreDetail = calculateScoreDetail(Object.fromEntries(
      automaticCriteria.map((criterion) => [criterion.key, criterion.points]),
    ), "default", LEGACY_SCORING_VERSION);
    assert.equal(Math.round(scoreDetail.total), 17);
    assert.equal(scoreDetail.repondus, 6);
    assert.equal(scoreDetail.totalCrit, 29);
    for (const key of [
      "revendiquee", "horaires", "contact", "adresse", "attributs", "nap",
      "logoCouverture", "photoRecente", "varietePhotos", "qualitePhotos",
      "recenceAvis", "tauxReponseAvis", "qualiteReponsesAvis", "descriptionQualite",
      "servicesPresents", "servicesDecrits", "questionsReponses", "liensAction",
      "publicationRecente", "rythmePublication", "nomConforme",
    ]) {
      const criterion = body.scorePrefill.criteria.find((item) => item.key === key);
      assert.equal(criterion?.points, null, `${key} doit rester manuel quand la fixture ne le démontre pas`);
      assert.equal(criterion?.value, "not_verified");
    }
    assert.ok(restoreFetch.calls.some((url) => url === GOOGLE_URL));
    assert.ok(restoreFetch.calls.some((url) => new URL(url).searchParams.get("query") === CANONICAL_GOOGLE_URL));
    assert.ok(!restoreFetch.calls.some((url) => new URL(url).hostname === "api.app.outscraper.com" && new URL(url).searchParams.get("query") === GOOGLE_URL));
    assert.doesNotMatch(JSON.stringify(body), /simulated-provider-key|fatima@example\.com|raw_(?:payload|response)/i);

    const row = db.sqlite.prepare(`
      SELECT analysis_id, nom, ville, activity, status, report_type, pdf_generated_at
      FROM analyses WHERE analysis_id = ?
    `).get(ANALYSIS_ID);
    assert.deepEqual({ ...row }, {
      analysis_id: ANALYSIS_ID,
      nom: "Maison Test",
      ville: "Bruxelles",
      activity: "Pâtisserie",
      status: "awaiting_review",
      report_type: "free",
      pdf_generated_at: null,
    });
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_items"), 0);
    assert.equal(db.count("order_tasks"), 0);

    const reloadResponse = await getContext({
      request: new Request(`https://preview.local/api/admin/free-diagnostic-context/${ANALYSIS_ID}`, {
        headers: { Cookie: await cookie() },
      }),
      params: { analysisId: ANALYSIS_ID },
      env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
    });
    const reloadBody = await reloadResponse.json();
    assert.equal(reloadBody.context.collectionAvailable, true);
    assert.deepEqual(reloadBody.context.scorePrefill, body.scorePrefill);
    assert.equal(reloadBody.context.collection.company, "Maison Test");
  } finally {
    restoreFetch();
  }
});

test("un Diagnostic gratuit manuel déjà collecté réutilise son état sans fournisseur ni seconde analyse", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false, companyName: "Maison Test", city: "Bruxelles", googleUrl: "" });
  seedManualMetadataAndDraft(db);
  markAnalysisCollected(db);
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("provider_must_not_be_called");
  };
  try {
    const beforeDraft = db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID);
    const beforeMetadata = db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(ANALYSIS_ID);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await collectDiagnostic(await context(db));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.analysisId, ANALYSIS_ID);
      assert.equal(body.alreadyCollected, true);
    }
    assert.equal(providerCalls, 0);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_items"), 0);
    assert.equal(db.count("order_tasks"), 0);
    assert.equal(db.count("diagnostic_requests"), 0);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID), beforeDraft);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(ANALYSIS_ID), beforeMetadata);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la relance réelle Bivert Alain classe Fournisseur d’électricité comme inadaptée et conserve atomiquement le reste", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { companyName: "Bivert Alain", city: "Attert", googleUrl: "" });
  markAnalysisCollected(db);
  db.sqlite.prepare(`
    UPDATE analyses SET nom = 'Bivert Alain', name = 'Bivert Alain', ville = 'Attert',
      rating = 1.8, reviews = 5, photos_count = 1,
      fiche_json = '{"name":"Bivert Alain","place_id":"place-target","city":"Attert","category":"Fournisseur d’électricité","postal_code":"6717","country":"Belgique","country_code":"BE"}',
      normalized_json = '{"name":"Bivert Alain","place_id":"place-target","city":"Attert","category":"Fournisseur d’électricité","observed_fields":["category"],"postal_code":"6717","country":"Belgique","country_code":"BE"}',
      search_query = 'Fournisseur d’électricité Attert', local_position = 8,
      competitors_json = '[{"name":"Ancien concurrent","rating":3.1,"reviews":8,"photos_count":2}]',
      avg_rating = 3.1, avg_reviews = 8, avg_photos = 2
    WHERE analysis_id = ?
  `).run(ANALYSIS_ID);
  db.sqlite.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version, answers_json,
      current_step, created_at, updated_at
    ) VALUES ('preserved-search-draft', ?, 'draft', 'free',
      'score-efficia-questionnaire-v4', '{"responses":{"nomConforme":{"points":0}},"contact":"Julie"}',
      'questionnaire', '2026-08-25T08:00:00.000Z', '2026-08-25T08:00:00.000Z')
  `).run(ANALYSIS_ID);
  const requestBefore = db.sqlite.prepare("SELECT * FROM diagnostic_requests WHERE analysis_id = ?").get(ANALYSIS_ID);
  const draftBefore = db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID);
  const originalFetch = globalThis.fetch;
  let providerQuery = "";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(init.headers["X-API-KEY"], "simulated-provider-key");
    if (url.hostname === "api.outscraper.com") {
      // Geocoding du centre neutre d'Attert (locality résolue depuis la
      // fiche déjà collectée : postal_code 6717 / country_code BE) — hôte
      // distinct de la recherche concurrentielle, appelé avant celle-ci.
      return Response.json({
        data: [[{ latitude: 49.7864, longitude: 5.7864, city: "Attert", postal_code: "6717", country_code: "BE" }]],
      });
    }
    providerQuery = url.searchParams.get("query") || "";
    return Response.json({ data: [[
      { name:"AS pro elec", place_id:"new-1", rating:4.4, reviews:7, photos_count:0, services:["a","b","c"], posts:[1,2], sponsored:false },
      { name:"Moris Wilfried", place_id:"new-2", rating:5, reviews:5, photos_count:1, services:["a"], posts:[1], sponsored:false },
      { name:"Electrolux95", place_id:"new-3", rating:5, reviews:20, photos_count:2, services:["a","b"], posts:[], sponsored:false },
      { name:"Bivert Alain", place_id:"place-target", rank:3, rating:1.8, reviews:5, photos_count:1, category:"Fournisseur d’électricité", location_link:"https://www.google.com/maps/place/Bivert-Alain", reservation_links:[], booking_appointment_link:null, order_links:null, sponsored:false },
    ]] });
  };
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: {
      operation: "refresh_search",
      analysisId: ANALYSIS_ID,
      company: "Bivert Alain",
      city: "Attert",
      activity: "Électricien",
      searchQuery: "Électricien Attert",
    } }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(providerQuery, "Électricien Attert");
    assert.equal(body.operation, "refresh_search");
    assert.equal(body.business.searchQuery, "Électricien Attert");
    assert.equal(body.business.localPosition, 4);
    assert.deepEqual(body.business.rankEvidence, { rawRank:3, normalizedOneBasedRank:4, source:"provider_rank_zero_based" });
    assert.equal(body.business.confirmedActivity, "Électricien");
    assert.equal(body.business.observedPrimaryCategory, "Fournisseur d’électricité");
    assert.equal(body.business.secondaryCategoriesStatus, "unavailable");
    assert.equal(body.business.mapsVerification.url, "https://www.google.com/maps/place/Bivert-Alain");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "categoriePrincipale").label, "Inadaptée / générique");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "categoriesSecondaires").value, "not_verified");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "classementLocal").label, "Visible en 1re page");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "attractiviteConcurrents").label, "Derrière");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "liensAction").label, "Manquants");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "volumeAvis").label, "Inférieur");
    assert.equal(body.scorePrefill.criteria.find((item) => item.key === "volumeAvis").points, 0);
    assert.equal(body.business.competitors.length, 3);
    assert.deepEqual(body.business.competitors.map((item) => item.services_count), [3, 1, 2]);
    assert.match(body.searchAnalyzedAt, /^2026-|^20\d{2}-/);

    const row = db.sqlite.prepare(`
      SELECT activity, search_query, local_position, competitors_json, avg_rating, avg_reviews,
             avg_photos, rating_gap, reviews_gap, photos_gap, top_competitor_name, normalized_json
      FROM analyses WHERE analysis_id = ?
    `).get(ANALYSIS_ID);
    assert.equal(row.activity, "Pâtisserie");
    assert.equal(JSON.parse(row.normalized_json).category, "Fournisseur d’électricité");
    assert.equal(JSON.parse(row.normalized_json).confirmed_activity, "Électricien");
    assert.equal(row.search_query, "Électricien Attert");
    assert.equal(row.local_position, 4);
    assert.equal(JSON.parse(row.competitors_json).length, 3);
    assert.equal(row.avg_rating, 4.8);
    assert.equal(row.avg_reviews, 10.67);
    assert.equal(row.avg_photos, 1);
    assert.equal(row.rating_gap, -3);
    assert.equal(row.reviews_gap, -5.67);
    assert.equal(row.photos_gap, 0);
    assert.equal(row.top_competitor_name, "Electrolux95");
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM diagnostic_requests WHERE analysis_id = ?").get(ANALYSIS_ID), requestBefore);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID), draftBefore);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("orders"), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("un échec de relance conserve intégralement les anciens résultats et le brouillon", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { companyName: "B&V électricité", city: "Attert", googleUrl: "" });
  markAnalysisCollected(db);
  db.sqlite.prepare("UPDATE analyses SET search_query = 'Ancienne recherche', local_position = 7 WHERE analysis_id = ?").run(ANALYSIS_ID);
  seedManualMetadataAndDraft(db);
  const before = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID);
  const draftBefore = db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID);
  const restoreFetch = installProviderFixture({ fail: true });
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: {
      operation:"refresh_search", analysisId:ANALYSIS_ID, company:"B&V électricité",
      city:"Attert", activity:"Électricien", searchQuery:"Électricien Attert"
    } }));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "SEARCH_REFRESH_FAILED");
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID), before);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID), draftBefore);
  } finally {
    restoreFetch();
  }
});

test("un échec fournisseur manuel conserve le brouillon et les métadonnées avec une référence sûre", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false, companyName: "Maison Test", city: "Bruxelles", googleUrl: "" });
  seedManualMetadataAndDraft(db);
  const restoreFetch = installProviderFixture({ fail: true });
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  try {
    const beforeDraft = db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID);
    const beforeMetadata = db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(ANALYSIS_ID);
    const response = await collectDiagnostic(await context(db));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, "BUSINESS_COLLECTION_FAILED");
    assert.match(body.trackingId, /^[a-f0-9-]{36}$/i);
    assert.equal(db.count("analyses"), 1);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(ANALYSIS_ID), beforeDraft);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(ANALYSIS_ID), beforeMetadata);
    assert.ok(logs.some(([, details]) => details?.tracking_id === body.trackingId));
    assert.doesNotMatch(JSON.stringify(logs), /secret-provider-payload|simulated-provider-key/i);
  } finally {
    console.error = originalError;
    restoreFetch();
  }
});

test("une fiche introuvable reste awaiting_review, efface les sentinelles et ne crée aucune donnée métier annexe", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  db.sqlite.prepare(`
    UPDATE analyses SET place_id = '__NO_PLACE_FOUND__', rating = 4.9, reviews = 315,
      photos_count = 40, competitors_json = '[{"name":"Concurrent 1"}]',
      fiche_json = '{"error":"secret-provider-payload"}' WHERE analysis_id = ?
  `).run(ANALYSIS_ID);
  const restoreFetch = installProviderFixture({ notFound: true });
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values.map(String).join(" "));
  try {
    const response = await collectDiagnostic(await context(db));
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      success: false,
      error: "GOOGLE_BUSINESS_NOT_FOUND",
      message: "Fiche Google introuvable. Vérifiez le lien transmis ou recherchez l’entreprise par son nom et sa ville.",
    });
    const row = db.sqlite.prepare(`
      SELECT analysis_id, status, report_type, place_id, rating, reviews, photos_count,
             competitors_json, fiche_json, normalized_json
      FROM analyses WHERE analysis_id = ?
    `).get(ANALYSIS_ID);
    assert.equal(row.analysis_id, ANALYSIS_ID);
    assert.equal(row.status, "awaiting_review");
    assert.equal(row.report_type, "free");
    assert.equal(row.place_id, null);
    assert.equal(row.rating, null);
    assert.equal(row.reviews, null);
    assert.equal(row.photos_count, null);
    assert.equal(row.competitors_json, "[]");
    assert.equal(row.fiche_json, null);
    assert.equal(row.normalized_json, null);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_items"), 0);
    assert.equal(db.count("order_tasks"), 0);
    assert.doesNotMatch(logs.join("\n"), /maps\.app\.goo\.gl|Maison-Test|secret-provider-payload|simulated-provider-key|fatima@example\.com/i);
  } finally {
    console.error = originalError;
    restoreFetch();
  }
});

test("les parcours URL canonique et entreprise + ville restent fonctionnels", async () => {
  for (const seed of [
    { analysisId: "analysis-canonical", googleUrl: CANONICAL_GOOGLE_URL },
    { analysisId: "analysis-company", googleUrl: "", companyName: "Maison Test", city: "Bruxelles" },
  ]) {
    const db = new LocalD1();
    seedAnalysis(db, seed);
    const restoreFetch = installProviderFixture();
    try {
      const response = await collectDiagnostic(await context(db, seed.analysisId));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.analysisId, seed.analysisId);
      assert.equal(db.count("analyses"), 1);
      assert.equal(db.count("orders"), 0);
      if (seed.googleUrl === CANONICAL_GOOGLE_URL) {
        assert.ok(!restoreFetch.calls.some((url) => new URL(url).hostname === "maps.app.goo.gl"));
      }
    } finally {
      restoreFetch();
    }
  }
});

test("un échec fournisseur reste générique et ne journalise aucune réponse brute", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  const restoreFetch = installProviderFixture({ fail: true });
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values.map(String).join(" "));
  try {
    const response = await collectDiagnostic(await context(db));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.success, false);
    assert.equal(body.error, "BUSINESS_COLLECTION_FAILED");
    assert.equal(body.message, "La collecte n’a pas pu être terminée. Réessayez dans quelques instants.");
    assert.match(body.trackingId, /^[a-f0-9-]{36}$/i);
    assert.doesNotMatch(logs.join("\n"), /fatima@example\.com|secret-provider-payload|simulated-provider-key/i);
  } finally {
    console.error = originalError;
    restoreFetch();
  }
});

test("le contexte URL seule n’utilise jamais l’URL comme nom et ne déclare aucune commande payée", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  const response = await getContext({
    request: new Request(`https://preview.local/api/admin/free-diagnostic-context/${ANALYSIS_ID}`, {
      headers: { Cookie: await cookie() },
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.context.company, "Fiche Google transmise");
  assert.equal(body.context.city, "");
  assert.equal(body.context.activity, "");
  assert.equal(body.context.premiumAllowed, false);
  assert.equal(body.context.orderId, "");
  assert.equal(body.context.taskId, "");
  assert.equal(body.context.collectionAvailable, false);
  assert.equal(Object.hasOwn(body.context, "googleBusinessUrl"), false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("Premium est refusé sans commande et pour tous les statuts non payés", async () => {
  for (const status of [null, "pending", "failed", "expired", "refunded"]) {
    const db = new LocalD1();
    seedAnalysis(db);
    if (status) seedOrder(db, { status });
    const response = await authorizePremium({
      request: new Request(`https://preview.local/api/admin/premium-audit-authorization/${ANALYSIS_ID}`, {
        method: "POST",
        headers: { Cookie: await cookie() },
      }),
      params: { analysisId: ANALYSIS_ID },
      env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
    });
    assert.equal(response.status, 403, `statut ${status || "commande absente"}`);
    assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
  }
});

test("Premium refuse une offre payée non autorisée et une commande liée à une autre analyse", async () => {
  const unauthorizedOffer = new LocalD1();
  seedAnalysis(unauthorizedOffer);
  seedOrder(unauthorizedOffer, { offerCode: "consulting" });
  const offerResponse = await authorizePremium({
    request: new Request(`https://preview.local/api/admin/premium-audit-authorization/${ANALYSIS_ID}`, {
      method: "POST",
      headers: { Cookie: await cookie() },
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: unauthorizedOffer },
  });
  assert.equal(offerResponse.status, 403);

  const wrongAnalysis = new LocalD1();
  seedAnalysis(wrongAnalysis);
  seedOrder(wrongAnalysis, { link: false });
  const linkResponse = await authorizePremium({
    request: new Request(`https://preview.local/api/admin/premium-audit-authorization/${ANALYSIS_ID}`, {
      method: "POST",
      headers: { Cookie: await cookie() },
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: wrongAnalysis },
  });
  assert.equal(linkResponse.status, 403);
});

test("Premium est autorisé uniquement pour la même analyse, payée et couverte par une offre admissible", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedOrder(db, { status: "paid", offerCode: "audit" });

  const response = await authorizePremium({
    request: new Request(`https://preview.local/api/admin/premium-audit-authorization/${ANALYSIS_ID}`, {
      method: "POST",
      headers: { Cookie: await cookie() },
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, premiumAllowed: true });
  assert.equal(response.headers.get("Cache-Control"), "no-store");

  const contextResponse = await getContext({
    request: new Request(`https://preview.local/api/admin/free-diagnostic-context/${ANALYSIS_ID}`, {
      headers: { Cookie: await cookie() },
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  });
  assert.equal((await contextResponse.json()).context.premiumAllowed, true);
});

test("l’appel direct de l’autorisation Premium exige une session admin", async () => {
  const db = new LocalD1();
  seedAnalysis(db);
  seedOrder(db);
  const response = await authorizePremium({
    request: new Request(`https://preview.local/api/admin/premium-audit-authorization/${ANALYSIS_ID}`, { method: "POST" }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  });
  assert.equal(response.status, 401);
});

test("le client admin ne reçoit aucun secret et garde Premium inactif sans paiement", () => {
  const html = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const route = readFileSync(new URL("../functions/api/admin/free-diagnostic-collect/[analysisId].js", import.meta.url), "utf8");
  assert.match(html, /Demande de diagnostic gratuit/);
  assert.match(html, /Lancer le diagnostic gratuit/);
  assert.match(html, /\/api\/admin\/free-diagnostic-collect\/\$\{encodeURIComponent\(analysisId\)\}/);
  assert.doesNotMatch(html, /cle-api|token-connecteur|url-connecteur|efficia_api_key|efficia_token_connecteur|CONNECTOR_TOKEN|OUTSCRAPER_API_KEY/i);
  assert.doesNotMatch(html, /Commande liée au back-office/);
  assert.doesNotMatch(html, /value=["']boulangerie["']/i);
  assert.match(html, /id="btn-audit-premium"[^>]*hidden disabled/);
  assert.match(html, /\[data-premium-action\]\[hidden\]\{display:none!important\}/);
  assert.match(html, /const premiumAllowed = contexte\.premiumAllowed === true/);
  assert.match(html, /\/api\/admin\/premium-audit-authorization\/\$\{encodeURIComponent\(analysisId\)\}/);
  assert.match(html, /method:"POST"/);
  assert.match(html, /if\(collecteDiagnosticEnCours\) return/);
  assert.match(html, /button\.textContent = "Collecte en cours…"/);
  assert.match(html, /collectionButton\.hidden = true/);
  assert.match(html, /#btn-analyser\[hidden\]\{display:none!important\}/);
  assert.match(html, /Référence :/);
  assert.match(html, /Référence locale :/);
  assert.match(html, /Fiche Google introuvable\. Vérifiez le lien transmis ou recherchez l’entreprise par son nom et sa ville\./);
  assert.doesNotMatch(html, /placeholder="Concurrent [123]"|placeholder="4,9"|placeholder="315"|placeholder="40"|placeholder="9"|placeholder="6"/);
  assert.doesNotMatch(html, /contexte\.googleBusinessUrl/);
  assert.match(html, /function appliquerPreRemplissageDiagnosticGratuit\(scorePrefill\)/);
  assert.match(html, /cocher\(/);
  assert.match(html, /marquerManuel\(/);
  assert.match(html, /appliquerCollecteDiagnosticGratuit\(data\.business \|\| \{\}, data\.scorePrefill\)/);
  assert.match(html, /appliquerCollecteDiagnosticGratuit\(contexte\.collection, contexte\.scorePrefill\)/);
  assert.match(html, /appliquerPreRemplissageDiagnosticGratuit\(scorePrefill\);[\s\S]{0,700}majConditionsQuestionnaire\(\);\s*calc\(\);/);
  assert.doesNotMatch(html, /clarity|cloudflareinsights/i);
  assert.doesNotMatch(route, /INSERT INTO orders|INSERT INTO order_items|INSERT INTO order_tasks|pdf|mailer|email/i);
  assert.match(route, /WHERE analysis_id = \? AND report_type = 'free' AND status = 'awaiting_review'/);
});
