import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestGet as listOrders } from "../functions/admin/orders.js";
import { onRequestGet as listDiagnosticRequests } from "../functions/api/admin/diagnostic-requests.js";

const ADMIN_SECRET = "local-admin-secret";
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
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrationNames.forEach((name) => {
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

async function adminCookie() {
  return (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];
}

function routeContext(db, path, cookie = "") {
  return {
    request: new Request(`https://preview.efficiadigital.pages.dev${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET, ORDERS_DB: db },
  };
}

function insertAnalysis(db, { id, name, city, createdAt }) {
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, name, status, created_at, updated_at, report_type
    ) VALUES (?, ?, ?, ?, ?, 'awaiting_review', ?, ?, 'free')
  `).run(id, name, city, `${name} ${city}`, name, createdAt, createdAt);
}

function insertDiagnostic(db, { requestId, key, analysisId, firstName, email, company, city, createdAt }) {
  db.sqlite.prepare(`
    INSERT INTO diagnostic_requests (
      request_id, idempotency_key, analysis_id, first_name, email,
      company_name, city, status, mailerlite_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_review', 'synced', ?, ?)
  `).run(requestId, key, analysisId, firstName, email, company, city, createdAt, createdAt);
}

function insertStripeOrder(db) {
  const now = new Date().toISOString();
  db.sqlite.prepare(`
    INSERT INTO orders (
      order_id, stripe_session_id, email, first_name, customer_name,
      company_name, city, offer_code, offer_name, amount_total, currency,
      status, paid_at, created_at, updated_at
    ) VALUES (
      'order-stripe', 'cs_live_local', 'client@example.com', 'Client', 'Client Exemple',
      'Entreprise payante', 'Namur', 'audit', 'Audit', 9900, 'eur',
      'paid', ?, ?, ?
    )
  `).run(now, now, now);
  db.sqlite.prepare(`
    INSERT INTO order_tasks (
      task_id, order_id, task_type, title, status, offer_code, created_at, updated_at
    ) VALUES ('task-stripe', 'order-stripe', 'audit_to_do', 'Audit à réaliser', 'todo', 'audit', ?, ?)
  `).run(now, now);
}

test("la liste des diagnostics exige une session admin", async () => {
  const db = new LocalD1();
  const response = await listDiagnosticRequests(routeContext(db, "/api/admin/diagnostic-requests"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, error: "UNAUTHORIZED" });
});

test("les diagnostics gratuits sont séparés des commandes et triés du plus récent au plus ancien", async () => {
  const db = new LocalD1();
  insertStripeOrder(db);
  insertAnalysis(db, {
    id: "analysis-old",
    name: "Ancienne entreprise",
    city: "Liège",
    createdAt: "2026-08-18T09:00:00.000Z",
  });
  insertDiagnostic(db, {
    requestId: "request-old",
    key: "51ed6ee4-2860-4dd2-a108-f241e5c608c9",
    analysisId: "analysis-old",
    firstName: "Alice",
    email: "alice@example.com",
    company: "Ancienne entreprise",
    city: "Liège",
    createdAt: "2026-08-18T09:00:00.000Z",
  });
  insertAnalysis(db, {
    id: "analysis-new",
    name: "Nouvelle entreprise",
    city: "Bruxelles",
    createdAt: "2026-08-19T11:00:00.000Z",
  });
  insertDiagnostic(db, {
    requestId: "request-new",
    key: "442cb8e3-6f49-46df-93bb-103c5df1f1fb",
    analysisId: "analysis-new",
    firstName: "Fatima",
    email: "fatima@example.com",
    company: "",
    city: "",
    createdAt: "2026-08-19T11:00:00.000Z",
  });

  const cookie = await adminCookie();
  const response = await listDiagnosticRequests(routeContext(
    db,
    "/api/admin/diagnostic-requests?limit=50",
    cookie,
  ));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.diagnostics.map(({ analysisId }) => analysisId), ["analysis-new", "analysis-old"]);
  assert.deepEqual(Object.keys(body.diagnostics[0]).sort(), [
    "analysisId", "city", "company", "email", "firstName", "mailerLiteStatus",
    "reportType", "status", "submittedAt",
  ]);
  assert.equal(body.diagnostics[0].company, "Nouvelle entreprise");
  assert.equal(body.diagnostics[0].city, "Bruxelles");
  assert.equal(body.diagnostics[0].status, "awaiting_review");
  assert.equal(body.diagnostics[0].mailerLiteStatus, "synced");
  assert.equal(body.diagnostics[0].reportType, "free");
  assert.equal(body.pendingCount, 2);
  assert.doesNotMatch(JSON.stringify(body), /request-new|request-old|51ed6ee4|442cb8e3|google_business_url/);

  assert.equal(db.count("orders"), 1);
  assert.equal(db.count("order_tasks"), 1);
  assert.equal(db.count("diagnostic_requests"), 2);

  const ordersResponse = await listOrders(routeContext(db, "/admin/orders?limit=50", cookie));
  const ordersBody = await ordersResponse.json();
  assert.equal(ordersResponse.status, 200);
  assert.equal(ordersBody.orders.length, 1);
  assert.equal(ordersBody.orders[0].order_id, "order-stripe");
  assert.equal(ordersBody.stats.ordersToday, 1);
  assert.equal(ordersBody.stats.revenueToday, 9900);
  assert.equal(ordersBody.stats.auditTodo, 1);
});

test("la route applique une limite raisonnable et gère proprement l’état vide", async () => {
  const db = new LocalD1();
  const response = await listDiagnosticRequests(routeContext(
    db,
    "/api/admin/diagnostic-requests?limit=500",
    await adminCookie(),
  ));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.limit, 100);
  assert.equal(body.pendingCount, 0);
  assert.deepEqual(body.diagnostics, []);
});

test("l’interface admin ouvre Score Efficia avec le seul analysisId et conserve les métriques Stripe séparées", () => {
  const canonicalAdminFile = new URL("../admin.html", import.meta.url);
  const obsoleteAdminFile = new URL("../admin/index.html", import.meta.url);
  const html = readFileSync(canonicalAdminFile, "utf8");
  const redirects = readFileSync(new URL("../_redirects", import.meta.url), "utf8");
  const script = readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
  const orderRoute = readFileSync(new URL("../functions/admin/orders.js", import.meta.url), "utf8");
  const diagnosticRoute = readFileSync(new URL("../functions/api/admin/diagnostic-requests.js", import.meta.url), "utf8");

  assert.match(html, /Diagnostics gratuits à traiter/);
  assert.match(html, /data-admin-diagnostics/);
  assert.match(html, /Commandes Stripe/);
  assert.match(html, /<script src="\/js\/admin\.js"><\/script>/);
  assert.equal(existsSync(obsoleteAdminFile), false, "admin/index.html ne doit plus concurrencer admin.html");
  assert.match(redirects, /^\/admin\/ \/admin 301$/m);

  const resolveAdminDocument = (pathname) => {
    if (pathname === "/admin") return { status: 200, document: canonicalAdminFile };
    if (pathname === "/admin/") return { status: 301, location: "/admin" };
    return null;
  };
  assert.deepEqual(resolveAdminDocument("/admin"), { status: 200, document: canonicalAdminFile });
  assert.deepEqual(resolveAdminDocument("/admin/"), { status: 301, location: "/admin" });
  assert.match(script, /fetch\("\/api\/admin\/diagnostic-requests\?limit=50"/);
  assert.match(script, /\/admin\/free-diagnostic-production\?analysisId=\$\{encodeURIComponent\(analysisId\)\}/);

  const actionBuilder = script.slice(
    script.indexOf("const buildFreeDiagnosticToolUrl"),
    script.indexOf("const renderDiagnostics"),
  );
  assert.match(actionBuilder, /analysisId/);
  assert.doesNotMatch(actionBuilder, /email|firstName|company|city|googleBusiness|requestId|idempotency/i);

  const actionUrl = new URL("/admin/free-diagnostic-production?analysisId=analysis-new", "https://local.test");
  assert.deepEqual([...actionUrl.searchParams.keys()], ["analysisId"]);
  assert.doesNotMatch(actionUrl.href, /email|company|city|request|idempotency/i);

  assert.doesNotMatch(orderRoute, /diagnostic_requests/);
  assert.doesNotMatch(diagnosticRoute, /FROM orders|JOIN orders|order_tasks/);
  assert.doesNotMatch(`${html}${script}${diagnosticRoute}`, /clarity\.ms|js\/analytics\.js|window\.clarity|data-clarity/i);
  assert.match(script, /Aucun diagnostic gratuit à traiter\./);
  assert.match(script, /Aucune commande trouvée\./);
});
