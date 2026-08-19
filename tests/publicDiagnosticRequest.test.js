import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestGet as getDiagnosticContext } from "../functions/api/admin/free-diagnostic-context/[analysisId].js";
import { onRequestPost as analyze } from "../functions/api/analyze.js";
import { onRequestPost as benchmark } from "../functions/api/benchmark.js";
import { normalizeDiagnosticSubmission } from "../functions/lib/diagnosticRequests.js";
import { onRequestPost as subscribe } from "../functions/subscribe.js";

const TOKEN = "local-connector-token";
const ADMIN_SECRET = "local-admin-secret";
const PREVIEW_ORIGIN = "https://branch.efficiadigital.pages.dev";
const KEY_ONE = "51ed6ee4-2860-4dd2-a108-f241e5c608c9";
const KEY_TWO = "442cb8e3-6f49-46df-93bb-103c5df1f1fb";
const migrationNames = [
  "0001_orders_tasks.sql",
  "0002_audit_production_tracking.sql",
  "0003_analyses.sql",
  "0004_analysis_competitors.sql",
  "0005_analysis_benchmark.sql",
  "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql",
  "0008_order_analysis_link.sql",
  "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql",
  "0011_score_efficia_historical.sql",
  "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql",
];

class LocalD1 {
  constructor({ failBatch = false } = {}) {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrationNames.forEach((name) => {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    });
    this.failBatch = failBatch;
    this.boundStatements = [];
  }

  prepare(sql) {
    const database = this.sqlite;
    const makeBound = (params = []) => ({
      bind: (...nextParams) => {
        this.boundStatements.push({ sql, params: nextParams });
        return makeBound(nextParams);
      },
      first: async () => database.prepare(sql).get(...params) || null,
      run: async () => {
        const result = database.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      _run: () => database.prepare(sql).run(...params),
    });
    return makeBound();
  }

  async batch(statements) {
    if (this.failBatch) throw new Error("local_batch_failure");
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement._run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  count(table) {
    return Number(this.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  }

  first(sql, ...params) {
    return this.sqlite.prepare(sql).get(...params) || null;
  }
}

const diagnosticPayload = (idempotencyKey = KEY_ONE) => ({
  step: "diagnostic_request",
  idempotency_key: idempotencyKey,
  first_name: "Fatima",
  email: "FATIMA@EXAMPLE.COM",
  company_name: "Entreprise Test",
  google_business_url: "",
  city: "Bruxelles",
  source: "Score Efficia gratuit",
});

const urlOnlyDiagnosticPayload = () => ({
  ...diagnosticPayload(KEY_TWO),
  company_name: "",
  city: "",
  google_business_url: "https://www.google.com/maps/place/Entreprise+Test",
});

const makeSubscribeContext = (db, payload) => ({
  request: new Request(`${PREVIEW_ORIGIN}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  env: {
    SITE_URL: PREVIEW_ORIGIN,
    CONNECTOR_TOKEN: TOKEN,
    OUTSCRAPER_API_KEY: "local-outscraper-key",
    MAILERLITE_API_KEY: "local-mailerlite-key",
    MAILERLITE_PREVIEW_DIAGNOSTIC_GROUP_ID: "preview-diagnostic",
    ORDERS_DB: db,
  },
});

function installFetchRouter({ db, mailerLiteOk = true, benchmarkOk = true, sparseBusiness = false }) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, options });
    if (url.pathname === "/api/analyze") {
      return analyze({
        request: new Request(url, options),
        env: {
          CONNECTOR_TOKEN: TOKEN,
          OUTSCRAPER_API_KEY: "local-outscraper-key",
          ORDERS_DB: db,
        },
      });
    }
    if (url.pathname === "/api/benchmark") {
      if (!benchmarkOk) return Response.json({ error: "local_benchmark_failure" }, { status: 500 });
      return benchmark({
        request: new Request(url, options),
        env: { CONNECTOR_TOKEN: TOKEN, ORDERS_DB: db },
      });
    }
    if (url.hostname === "connect.mailerlite.com") {
      return new Response("", { status: mailerLiteOk ? 200 : 500 });
    }
    if (url.hostname.includes("outscraper")) {
      const isCompetitorRequest = url.searchParams.get("organizationsPerQueryLimit") === "10";
      const business = sparseBusiness
        ? { name: "Entreprise Test" }
        : {
            name: "Entreprise Test",
            place_id: "place-local-test",
            category: "Consultant",
            city: "Bruxelles",
            rating: 4.7,
            reviews: 18,
          };
      return Response.json({ data: [isCompetitorRequest ? [] : [business]] });
    }
    throw new Error(`Unexpected local URL: ${url.href}`);
  };
  return {
    calls,
    restore: () => { globalThis.fetch = originalFetch; },
  };
}

test("la migration crée les contraintes et la relation attendues", () => {
  const db = new LocalD1();
  const columns = db.sqlite.prepare("PRAGMA table_info(diagnostic_requests)").all().map((row) => row.name);
  assert.deepEqual(columns, [
    "request_id", "idempotency_key", "analysis_id", "first_name", "email",
    "company_name", "city", "google_business_url", "status", "mailerlite_status",
    "created_at", "updated_at",
  ]);
  assert.throws(() => db.sqlite.prepare(`
    INSERT INTO diagnostic_requests (
      request_id, idempotency_key, analysis_id, first_name, email, status,
      mailerlite_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'awaiting_review', 'pending', ?, ?)
  `).run("request-orphan", KEY_ONE, "missing-analysis", "Fatima", "fatima@example.com", "2026-08-18", "2026-08-18"), /FOREIGN KEY/);

  const insertAnalysis = db.sqlite.prepare(`
    INSERT INTO analyses (analysis_id, nom, ville, query, status, created_at, updated_at, report_type)
    VALUES (?, 'Entreprise', 'Bruxelles', 'Entreprise Bruxelles', 'awaiting_review', ?, ?, 'free')
  `);
  insertAnalysis.run("analysis-one", "2026-08-18", "2026-08-18");
  insertAnalysis.run("analysis-two", "2026-08-18", "2026-08-18");
  const insertRequest = db.sqlite.prepare(`
    INSERT INTO diagnostic_requests (
      request_id, idempotency_key, analysis_id, first_name, email, created_at, updated_at
    ) VALUES (?, ?, ?, 'Fatima', 'fatima@example.com', '2026-08-18', '2026-08-18')
  `);
  insertRequest.run("request-one", KEY_ONE, "analysis-one");
  assert.throws(() => insertRequest.run("request-two", KEY_ONE, "analysis-two"), /UNIQUE/);
  assert.throws(() => insertRequest.run("request-three", KEY_TWO, "analysis-one"), /UNIQUE/);
});

test("la validation borne les champs et refuse une URL Google falsifiée", () => {
  const invalid = normalizeDiagnosticSubmission({
    ...diagnosticPayload(),
    google_business_url: "https://google.com.evil.example/maps/place/Test",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "INVALID_GOOGLE_BUSINESS_URL");

  const valid = normalizeDiagnosticSubmission({
    ...diagnosticPayload(),
    first_name: "F".repeat(140),
    email: "FATIMA@EXAMPLE.COM",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data.firstName.length, 100);
  assert.equal(valid.data.email, "fatima@example.com");
});

test("une soumission publique crée exactement une analyse gratuite et reste idempotente", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const firstResponse = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(first.success, true);
    assert.equal(first.status, "awaiting_review");
    assert.match(first.analysisId, /^[0-9a-f-]{36}$/i);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_tasks"), 0);

    const analysis = db.first("SELECT status, report_type, benchmark_completed_at, document_model_json, pdf_generated_at FROM analyses");
    assert.equal(analysis.status, "awaiting_review");
    assert.equal(analysis.report_type, "free");
    assert.ok(analysis.benchmark_completed_at);
    assert.equal(analysis.document_model_json, null);
    assert.equal(analysis.pdf_generated_at, null);
    const request = db.first("SELECT email, status, mailerlite_status FROM diagnostic_requests");
    assert.equal(request.email, "fatima@example.com");
    assert.equal(request.status, "awaiting_review");
    assert.equal(request.mailerlite_status, "synced");
    const mailerLiteCall = router.calls.find(({ url }) => url.includes("connect.mailerlite.com"));
    assert.deepEqual(JSON.parse(mailerLiteCall.options.body).groups, ["preview-diagnostic"]);
    assert.equal(first.group_id, undefined);

    const duplicateResponse = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const duplicate = await duplicateResponse.json();
    assert.equal(duplicate.analysisId, first.analysisId);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(router.calls.filter(({ url }) => url.includes("connect.mailerlite.com")).length, 1);

    const laterResponse = await subscribe(makeSubscribeContext(db, diagnosticPayload(KEY_TWO)));
    assert.equal(laterResponse.status, 200);
    assert.equal(db.count("analyses"), 2);
    assert.equal(db.count("diagnostic_requests"), 2);
  } finally {
    router.restore();
  }
});

test("un échec D1 empêche la confirmation et ne laisse aucune analyse orpheline", async () => {
  const db = new LocalD1({ failBatch: true });
  const router = installFetchRouter({ db });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const data = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(data, {
      success: false,
      error: "Une erreur est survenue. Merci de réessayer dans quelques instants.",
    });
    assert.equal(db.count("analyses"), 0);
    assert.equal(db.count("diagnostic_requests"), 0);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_tasks"), 0);
    assert.equal(router.calls.some(({ url }) => url.includes("connect.mailerlite.com")), false);

    const d1Log = errorCalls.find(([message]) => message === "analyze: D1 persistence failed");
    assert.ok(d1Log);
    assert.deepEqual(Object.keys(d1Log[1]).sort(), ["cause_message", "message", "name", "phase"]);
    assert.equal(d1Log[1].phase, "atomic_batch");
    assert.equal(d1Log[1].name, "Error");
    assert.equal(d1Log[1].message, "local_batch_failure");
    assert.doesNotMatch(JSON.stringify(errorCalls), /Fatima|fatima@example\.com|Entreprise Test|Bruxelles/i);
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("un échec benchmark n’est pas attribué à tort à la création D1", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, benchmarkOk: false });
  const originalError = console.error;
  const errorCalls = [];
  console.error = (...values) => errorCalls.push(values);
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 502);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(router.calls.some(({ url }) => url.includes("connect.mailerlite.com")), false);
    assert.ok(errorCalls.some(([message, details]) => (
      message === "Diagnostic request failed." && details?.phase === "benchmark_request"
    )));
    assert.equal(errorCalls.some(([message]) => /D1 analysis creation failed/.test(message)), false);
  } finally {
    console.error = originalError;
    router.restore();
  }
});

test("une URL Google Business valide suffit sans entreprise ni ville", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const response = await subscribe(makeSubscribeContext(db, urlOnlyDiagnosticPayload()));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.first("SELECT google_business_url FROM diagnostic_requests").google_business_url,
      "https://www.google.com/maps/place/Entreprise+Test");
  } finally {
    router.restore();
  }
});

test("les champs D1 facultatifs absents sont liés à null dans les deux parcours", async () => {
  for (const payload of [diagnosticPayload(), urlOnlyDiagnosticPayload()]) {
    const db = new LocalD1();
    const router = installFetchRouter({ db, sparseBusiness: true });
    try {
      const response = await subscribe(makeSubscribeContext(db, payload));
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.success, true);
      assert.equal(db.count("analyses"), 1);
      assert.equal(db.count("diagnostic_requests"), 1);

      const inserts = db.boundStatements.filter(({ sql }) => /INSERT INTO (?:analyses|diagnostic_requests)/.test(sql));
      assert.equal(inserts.length, 2);
      for (const { params } of inserts) {
        assert.equal(params.includes(undefined), false);
      }

      const analysis = db.first("SELECT nom, ville, query, place_id, rating, reviews, photos_count FROM analyses");
      assert.ok(analysis.nom.trim());
      assert.ok(analysis.ville.trim());
      assert.ok(analysis.query.trim());
      assert.equal(analysis.place_id, null);
      assert.equal(analysis.rating, null);
      assert.equal(analysis.reviews, null);
      assert.equal(analysis.photos_count, null);
    } finally {
      router.restore();
    }
  }
});

test("un échec MailerLite conserve l’analyse et marque seulement sa synchronisation", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db, mailerLiteOk: false });
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.analysisId);
    assert.equal(db.count("analyses"), 1);
    assert.equal(db.count("diagnostic_requests"), 1);
    assert.equal(db.first("SELECT mailerlite_status FROM diagnostic_requests").mailerlite_status, "failed");
  } finally {
    router.restore();
  }
});

test("la route admin retrouve le contexte D1 et le refuse sans session", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  try {
    const created = await (await subscribe(makeSubscribeContext(db, diagnosticPayload()))).json();
    const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
    const authenticated = await getDiagnosticContext({
      request: new Request(`https://local.test/api/admin/free-diagnostic-context/${created.analysisId}`, {
        headers: { Cookie: cookie },
      }),
      params: { analysisId: created.analysisId },
      env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
    });
    const body = await authenticated.json();
    assert.equal(authenticated.status, 200);
    assert.equal(body.context.email, "fatima@example.com");
    assert.equal(body.context.company, "Entreprise Test");

    const unauthorized = await getDiagnosticContext({
      request: new Request(`https://local.test/api/admin/free-diagnostic-context/${created.analysisId}`),
      params: { analysisId: created.analysisId },
      env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { success: false, error: "UNAUTHORIZED" });
  } finally {
    router.restore();
  }
});

test("le navigateur ne transmet la clé et les données que dans le corps POST", async () => {
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /idempotency_key: getDiagnosticIdempotencyKey\(\)/);
  assert.match(app, /window\.crypto\.randomUUID\(\)/);
  assert.doesNotMatch(app, /URLSearchParams[\s\S]{0,300}(?:idempotency|firstName|email|company|city|googleBusiness)/);
  assert.match(app, /await Promise\.all\(\[submitLeadRequest\(payload\), wait\(650\)\]\);[\s\S]*diagnostic_submitted[\s\S]*showStep\(3\);[\s\S]*diagnostic_confirmation_view/);
  assert.doesNotMatch(app, /trackAnalyticsEvent\?\.\("diagnostic_result_view"\)/);
});

test("le parcours public ne journalise aucune donnée personnelle", async () => {
  const db = new LocalD1();
  const router = installFetchRouter({ db });
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  console.log = (...values) => logs.push(values.join(" "));
  console.error = (...values) => logs.push(values.join(" "));
  try {
    const response = await subscribe(makeSubscribeContext(db, diagnosticPayload()));
    assert.equal(response.status, 200);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    router.restore();
  }
  const output = logs.join("\n");
  assert.doesNotMatch(output, /Fatima|fatima@example\.com|Entreprise Test|Bruxelles/i);
});
