import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestPost as createAudit } from "../functions/api/admin/audits.js";
import { onRequestPost as authorizePremium } from "../functions/api/admin/premium-audit-authorization/[analysisId].js";
import { formatAuditCommercialLabel } from "../functions/lib/auditCreationMetadata.js";

const SECRET = "manual-audit-test-secret";

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (let index = 1; index <= 16; index += 1) {
      const prefix = String(index).padStart(4, "0");
      const names = {
        "0001": "0001_orders_tasks.sql", "0002": "0002_audit_production_tracking.sql",
        "0003": "0003_analyses.sql", "0004": "0004_analysis_competitors.sql",
        "0005": "0005_analysis_benchmark.sql", "0006": "0006_analysis_knowledge.sql",
        "0007": "0007_analysis_reasoning_composer.sql", "0008": "0008_order_analysis_link.sql",
        "0009": "0009_manual_review_gate.sql", "0010": "0010_analysis_report_type.sql",
        "0011": "0011_score_efficia_historical.sql", "0012": "0012_order_cgv_acceptance.sql",
        "0013": "0013_diagnostic_requests.sql", "0014": "0014_audit_drafts.sql",
        "0015": "0015_audit_questionnaire_snapshots.sql", "0016": "0016_admin_manual_audits.sql",
      };
      this.sqlite.exec(readFileSync(new URL(`../migrations/${names[prefix]}`, import.meta.url), "utf8"));
    }
  }

  prepare(sql) {
    const database = this.sqlite;
    const bound = (params = []) => ({
      bind: (...next) => bound(next),
      first: async () => database.prepare(sql).get(...params) || null,
      all: async () => ({ results: database.prepare(sql).all(...params) }),
      run: async () => {
        const result = database.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    });
    return bound();
  }

  count(table) {
    return Number(this.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  }
}

async function cookie() {
  return (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
}

async function context(db, body, { authenticated = true, origin = "https://preview.local" } = {}) {
  return {
    request: new Request("https://preview.local/api/admin/audits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(authenticated ? { Cookie: await cookie() } : {}),
      },
      body: JSON.stringify(body),
    }),
    env: { ADMIN_SESSION_SECRET: SECRET, CONNECTOR_TOKEN: "connector", ORDERS_DB: db },
  };
}

function installPipeline(db, analysisId) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    if (new URL(url).pathname === "/api/analyze") {
      const now = new Date().toISOString();
      db.sqlite.prepare(`
        INSERT INTO analyses (analysis_id, nom, ville, query, status, created_at, updated_at, report_type)
        VALUES (?, 'Entreprise manuelle', 'Arlon', 'Entreprise manuelle Arlon', 'collected', ?, ?, 'premium')
      `).run(analysisId, now, now);
      return Response.json({ analysisId, status: "collected" });
    }
    return Response.json({ success: true, status: "completed" });
  };
  return { restore: () => { globalThis.fetch = original; }, calls: () => calls };
}

function seedOrder(db, { orderId = "commercial-order", status = "paid" } = {}) {
  const now = "2026-08-21T12:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO orders (
      order_id, stripe_session_id, email, company_name, city, offer_code,
      offer_name, amount_total, currency, status, paid_at, created_at, updated_at
    ) VALUES (?, ?, 'client@example.com', 'Entreprise commerciale', 'Arlon',
      'audit', 'Audit Premium', 9900, 'eur', ?, ?, ?, ?)
  `).run(orderId, `session-${orderId}`, status, now, now, now);
}

async function createManual(reportType, key, analysisId) {
  const db = new LocalD1();
  const pipeline = installPipeline(db, analysisId);
  try {
    const response = await createAudit(await context(db, {
      companyName: "Entreprise manuelle",
      city: "Arlon",
      reportType,
      operation: "create_manual_audit",
      idempotencyKey: key,
      creationSource: "public-forgery-is-ignored",
      billingStatus: "paid-forgery-is-ignored",
    }));
    return { db, pipeline, response, json: await response.json() };
  } catch (error) {
    pipeline.restore();
    throw error;
  }
}

test("une administratrice crée un Diagnostic gratuit manuel sans donnée commerciale", async () => {
  const result = await createManual("free", "manual-free-test-000001", "manual-free-analysis");
  try {
    assert.equal(result.response.status, 200);
    assert.equal(result.json.links.review, "/admin/free-diagnostic-production?analysisId=manual-free-analysis");
    const metadata = result.db.sqlite.prepare("SELECT * FROM audit_creation_metadata").get();
    assert.equal(metadata.creation_source, "admin_manual");
    assert.equal(metadata.audit_type, "free");
    assert.equal(metadata.billing_status, "not_applicable");
    assert.equal(result.db.count("orders"), 0);
    assert.equal(result.db.count("diagnostic_requests"), 0);
  } finally { result.pipeline.restore(); }
});

test("une administratrice crée un Premium manuel non payé et autorisé en back-office", async () => {
  const result = await createManual("premium", "manual-premium-test-01", "manual-premium-analysis");
  try {
    assert.equal(result.response.status, 200);
    assert.equal(result.json.links.review, "/admin/audit-review/manual-premium-analysis");
    const metadata = result.db.sqlite.prepare("SELECT * FROM audit_creation_metadata").get();
    assert.equal(metadata.creation_source, "admin_manual");
    assert.equal(metadata.audit_type, "premium");
    assert.equal(metadata.billing_status, "manual_unpaid");
    const authorization = await authorizePremium({
      request: new Request("https://preview.local/api/admin/premium-audit-authorization/manual-premium-analysis", { method: "POST", headers: { Cookie: await cookie() } }),
      params: { analysisId: "manual-premium-analysis" },
      env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: result.db },
    });
    assert.equal(authorization.status, 200);
  } finally { result.pipeline.restore(); }
});

test("un Premium commercial payé avec orderId valide reste autorisé", async () => {
  const db = new LocalD1();
  seedOrder(db);
  const pipeline = installPipeline(db, "commercial-paid-analysis");
  try {
    const response = await createAudit(await context(db, {
      orderId: "commercial-order",
      operation: "create_commercial_audit",
      reportType: "premium",
    }));
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.order.orderId, "commercial-order");
    assert.equal(db.sqlite.prepare("SELECT order_id FROM analyses WHERE analysis_id = ?").get("commercial-paid-analysis").order_id, "commercial-order");
    assert.equal(db.count("audit_creation_metadata"), 0);
  } finally { pipeline.restore(); }
});

test("un Premium commercial sans orderId ou avec orderId vide reste refusé", async () => {
  for (const payload of [
    { operation: "create_commercial_audit", reportType: "premium" },
    { operation: "create_commercial_audit", reportType: "premium", orderId: "" },
    { reportType: "premium" },
  ]) {
    const db = new LocalD1();
    const response = await createAudit(await context(db, payload));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
    assert.equal(db.count("analyses"), 0);
    assert.equal(db.count("audit_creation_metadata"), 0);
  }
});

test("un Premium commercial avec commande inconnue reste refusé", async () => {
  const db = new LocalD1();
  const response = await createAudit(await context(db, {
    operation: "create_commercial_audit",
    reportType: "premium",
    orderId: "unknown-commercial-order",
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
});

test("un Premium commercial avec commande non payée reste refusé", async () => {
  const db = new LocalD1();
  seedOrder(db, { status: "pending" });
  const response = await createAudit(await context(db, {
    operation: "create_commercial_audit",
    reportType: "premium",
    orderId: "commercial-order",
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "PREMIUM_NOT_AUTHORIZED" });
  assert.equal(db.count("analyses"), 0);
});

test("un champ d’origine ou de facturation forgé ne change jamais les métadonnées serveur", async () => {
  const result = await createManual("premium", "forged-metadata-test-01", "forged-metadata-analysis");
  try {
    const metadata = result.db.sqlite.prepare("SELECT * FROM audit_creation_metadata").get();
    assert.equal(metadata.creation_source, "admin_manual");
    assert.equal(metadata.billing_status, "manual_unpaid");
  } finally { result.pipeline.restore(); }
});

test("l’intention manuelle explicite refuse toute commande jointe", async () => {
  const db = new LocalD1();
  seedOrder(db);
  const response = await createAudit(await context(db, {
    operation: "create_manual_audit",
    reportType: "premium",
    orderId: "commercial-order",
    idempotencyKey: "manual-with-order-test",
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, error: "MANUAL_AUDIT_ORDER_FORBIDDEN" });
  assert.equal(db.count("audit_creation_metadata"), 0);
});

test("une création manuelle sans session est refusée avant le pipeline", async () => {
  const db = new LocalD1();
  const response = await createAudit(await context(db, {
    companyName: "Test", city: "Arlon", reportType: "premium", operation: "create_manual_audit", idempotencyKey: "unauthenticated-test-01",
    creationSource: "admin_manual",
  }, { authenticated: false }));
  assert.equal(response.status, 401);
  assert.equal(db.count("analyses"), 0);
  assert.equal(db.count("audit_creation_metadata"), 0);
});

test("un Origin étranger est refusé même avec une session valide", async () => {
  const db = new LocalD1();
  const response = await createAudit(await context(db, {
    companyName: "Test", city: "Arlon", reportType: "free", operation: "create_manual_audit", idempotencyKey: "cross-origin-test-0001",
  }, { origin: "https://evil.example" }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "CROSS_ORIGIN_REQUEST" });
});

test("une mutation sans Origin est refusée même avec une session valide", async () => {
  const db = new LocalD1();
  const requestContext = await context(db, {
    companyName: "Test", city: "Arlon", reportType: "free", operation: "create_manual_audit", idempotencyKey: "missing-origin-test-01",
  });
  requestContext.request = new Request(requestContext.request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: await cookie(),
    },
    body: JSON.stringify({
      companyName: "Test", city: "Arlon", reportType: "free", operation: "create_manual_audit", idempotencyKey: "missing-origin-test-01",
    }),
  });
  const response = await createAudit(requestContext);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "CROSS_ORIGIN_REQUEST" });
});

test("un type absent ou inconnu est refusé sans réserver de création", async () => {
  for (const reportType of [undefined, "enterprise"]) {
    const db = new LocalD1();
    const response = await createAudit(await context(db, {
      companyName: "Test", city: "Arlon", reportType, operation: "create_manual_audit", idempotencyKey: "invalid-type-test-0001",
    }));
    assert.equal(response.status, 400);
    assert.equal(db.count("audit_creation_metadata"), 0);
  }
});

test("une même clé idempotente retourne la même analyse sans relancer le pipeline", async () => {
  const result = await createManual("free", "idempotent-manual-test", "idempotent-analysis");
  try {
    const second = await createAudit(await context(result.db, {
      companyName: "Entreprise manuelle", city: "Arlon", reportType: "free", operation: "create_manual_audit", idempotencyKey: "idempotent-manual-test",
    }));
    const json = await second.json();
    assert.equal(second.status, 200);
    assert.equal(json.created, false);
    assert.equal(json.analysisId, "idempotent-analysis");
    assert.equal(result.pipeline.calls(), 2);
    assert.equal(result.db.count("analyses"), 1);
  } finally { result.pipeline.restore(); }
});

test("les libellés distinguent Gratuit manuel, Premium manuel et Premium payé", () => {
  assert.equal(formatAuditCommercialLabel({ report_type: "free", creation_source: "admin_manual" }), "Gratuit manuel");
  assert.equal(formatAuditCommercialLabel({ report_type: "premium", creation_source: "duplicate_manual", billing_status: "manual_unpaid" }), "Premium manuel");
  assert.equal(formatAuditCommercialLabel({ report_type: "premium", paid_order: 1 }), "Premium payé");
});

test("la migration 0016 est additive, structurée et réexécutable", () => {
  const db = new LocalD1();
  const sql = readFileSync(new URL("../migrations/0016_admin_manual_audits.sql", import.meta.url), "utf8");
  const now = "2026-08-20T10:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (analysis_id, nom, ville, query, status, created_at, updated_at, report_type)
    VALUES ('historical-analysis', 'Historique', 'Arlon', 'Historique Arlon', 'approved', ?, ?, 'premium')
  `).run(now, now);
  db.sqlite.exec(sql);
  const columns = db.sqlite.prepare("PRAGMA table_info(audit_creation_metadata)").all().map((row) => row.name);
  assert.deepEqual(columns, ["idempotency_key", "analysis_id", "creation_source", "audit_type", "billing_status", "request_status", "created_at", "updated_at"]);
  assert.doesNotMatch(sql, /JSON/i);
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:DROP\b|DELETE\s+FROM\b|UPDATE\b|ALTER\b)/i);
  assert.equal(db.sqlite.prepare("SELECT nom FROM analyses WHERE analysis_id = 'historical-analysis'").get().nom, "Historique");
});

test("les créations manuelles ne changent ni commandes, ni revenus, ni demandes publiques", async () => {
  const result = await createManual("premium", "no-commercial-side-effects", "no-commercial-analysis");
  try {
    assert.equal(result.db.count("orders"), 0);
    assert.equal(result.db.count("order_items"), 0);
    assert.equal(result.db.count("order_tasks"), 0);
    assert.equal(result.db.count("diagnostic_requests"), 0);
  } finally { result.pipeline.restore(); }
});
