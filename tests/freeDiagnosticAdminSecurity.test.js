import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestGet as getContext } from "../functions/api/admin/free-diagnostic-context/[analysisId].js";
import { onRequestPost as collectDiagnostic } from "../functions/api/admin/free-diagnostic-collect/[analysisId].js";

const ADMIN_SECRET = "local-admin-secret";
const ANALYSIS_ID = "analysis-free-123";
const GOOGLE_URL = "https://maps.app.goo.gl/short-test";
const migrations = [
  "0001_orders_tasks.sql", "0002_audit_production_tracking.sql", "0003_analyses.sql",
  "0004_analysis_competitors.sql", "0005_analysis_benchmark.sql", "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql", "0008_order_analysis_link.sql", "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql", "0011_score_efficia_historical.sql", "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql",
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
} = {}) {
  const now = "2026-08-19T10:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, activity, status, created_at, updated_at, report_type
    ) VALUES (?, ?, 'Non renseignée', ?, 'boulangerie', ?, ?, ?, ?)
  `).run(analysisId, GOOGLE_URL, GOOGLE_URL, status, now, now, reportType);
  if (withRequest) {
    db.sqlite.prepare(`
      INSERT INTO diagnostic_requests (
        request_id, idempotency_key, analysis_id, first_name, email, company_name, city,
        google_business_url, status, mailerlite_status, created_at, updated_at
      ) VALUES (
        'request-free-123', '7fd0a4a4-7fb7-4be3-bd4b-4290055134f8', ?, 'Fatima',
        'fatima@example.com', ?, NULL, ?, 'awaiting_review', 'synced', ?, ?
      )
    `).run(analysisId, GOOGLE_URL, GOOGLE_URL, now, now);
  }
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

function installProviderFixture({ fail = false } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.app.outscraper.com");
    assert.equal(init.headers["X-API-KEY"], "simulated-provider-key");
    if (fail) {
      return new Response("fatima@example.com secret-provider-payload", { status: 500 });
    }
    const query = url.searchParams.get("query") || "";
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
    };
    const data = query === GOOGLE_URL
      ? [[target]]
      : [[target, {
        name: "Concurrent local",
        place_id: "place-competitor",
        rating: 4.8,
        reviews: 120,
        photos_count: 45,
        city: "Bruxelles",
      }]];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return () => { globalThis.fetch = originalFetch; };
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
    assert.doesNotMatch(JSON.stringify(body), /simulated-provider-key|fatima@example\.com|raw/i);

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
  } finally {
    restoreFetch();
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
    assert.deepEqual(body, {
      success: false,
      error: "BUSINESS_COLLECTION_FAILED",
      message: "La collecte n’a pas pu être terminée. Réessayez dans quelques instants.",
    });
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
  assert.equal(body.context.googleBusinessUrl, GOOGLE_URL);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
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
  assert.match(html, /button\.hidden = !contexte\.premiumAllowed/);
  assert.doesNotMatch(route, /INSERT INTO orders|INSERT INTO order_items|INSERT INTO order_tasks|pdf|mailer|email/i);
  assert.match(route, /WHERE analysis_id = \? AND report_type = 'free' AND status = 'awaiting_review'/);
});
