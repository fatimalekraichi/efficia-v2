// Correctif ciblé : le brouillon gratuit issu d'une duplication de
// questionnaire (creation_source = "duplicate_manual", voir
// functions/lib/auditQuestionnaireSnapshots.js::duplicateQuestionnaireSnapshot)
// doit pouvoir relancer sa recherche de position, exactement comme un
// brouillon créé manuellement en admin (creation_source = "admin_manual").
// Avant ce correctif, functions/api/admin/free-diagnostic-collect/[analysisId].js
// ne reconnaissait que "admin_manual" et refusait "duplicate_manual" avec
// 403 DIAGNOSTIC_REQUEST_REQUIRED, alors que les deux sources sont déjà
// traitées comme équivalentes ailleurs (functions/lib/auditCreationMetadata.js,
// MANUAL_SOURCES / formatAuditCommercialLabel).
//
// Ces tests couvrent uniquement la porte d'autorisation
// (isManualCreationSource + isManualFree) et sa non-interférence avec les
// autres portes existantes (session admin, statut compatible avec l’opération, demande
// historique liée, atomicité en cas d'échec fournisseur).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestPost as collectDiagnostic } from "../functions/api/admin/free-diagnostic-collect/[analysisId].js";
import { isManualCreationSource } from "../functions/lib/auditCreationMetadata.js";

const ADMIN_SECRET = "duplicate-auth-test-secret";
const ANALYSIS_ID = "analysis-duplicate-auth";
const migrations = [
  "0001_orders_tasks.sql", "0002_audit_production_tracking.sql", "0003_analyses.sql",
  "0004_analysis_competitors.sql", "0005_analysis_benchmark.sql", "0006_analysis_knowledge.sql",
  "0007_analysis_reasoning_composer.sql", "0008_order_analysis_link.sql", "0009_manual_review_gate.sql",
  "0010_analysis_report_type.sql", "0011_score_efficia_historical.sql", "0012_order_cgv_acceptance.sql",
  "0013_diagnostic_requests.sql", "0014_audit_drafts.sql", "0016_admin_manual_audits.sql",
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
}

function seedAnalysis(db, {
  analysisId = ANALYSIS_ID, reportType = "free", status = "awaiting_review", withRequest = false,
  companyName = "Maison Test", city = "Bruxelles",
} = {}) {
  const now = "2026-08-28T10:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, activity, status, created_at, updated_at, report_type
    ) VALUES (?, ?, 'Non renseignée', ?, 'boulangerie', ?, ?, ?, ?)
  `).run(analysisId, companyName, `${companyName} ${city}`, status, now, now, reportType);
  if (withRequest) {
    db.sqlite.prepare(`
      INSERT INTO diagnostic_requests (
        request_id, idempotency_key, analysis_id, first_name, email, company_name, city,
        google_business_url, status, mailerlite_status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Fatima', 'fatima@example.com', ?, ?, NULL, 'awaiting_review', 'synced', ?, ?
      )
    `).run(`request-${analysisId}`, `idem-${analysisId}`, analysisId, companyName, city, now, now);
  }
}

function seedManualMetadata(db, analysisId, { creationSource = "admin_manual", auditType = "free" } = {}) {
  const now = "2026-08-28T10:05:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'not_applicable', 'completed', ?, ?)
  `).run(`meta-${analysisId}`, analysisId, creationSource, auditType, now, now);
}

function seedManualMetadataPending(db, analysisId, { creationSource = "duplicate_manual", auditType = "free" } = {}) {
  // Une duplication amorcée mais jamais menée à "completed" (concurrente
  // interrompue, retry en cours) : loadManualAuditMetadata() filtre
  // explicitement request_status = 'completed', donc cette ligne ne doit
  // jamais autoriser la relance, même si sa creation_source est valide.
  const now = "2026-08-28T10:05:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'not_applicable', 'pending', ?, ?)
  `).run(`meta-pending-${analysisId}`, analysisId, creationSource, auditType, now, now);
}

// Requis par buildFreeDiagnosticCollectionState() : une "collecte initiale"
// (nom + place_id valide) doit déjà exister avant qu'une relance de
// recherche (refresh_search) soit acceptée — indépendamment de la porte
// d'autorisation admin_manual / duplicate_manual testée ici même.
function markInitialCollection(db, analysisId = ANALYSIS_ID, { companyName = "Maison Test", city = "Bruxelles" } = {}) {
  // Mission "ancrage géographique" : postal_code/country/country_code sont
  // désormais capturés dès l'identification initiale (collectFiche.js) —
  // ce repli reflète ce qu'une vraie collecte fournirait, pour que la
  // relance de recherche testée ici reste possible (voir geographicAnchor.js).
  const geo = { postal_code: "1000", country: "Belgique", country_code: "BE" };
  const fiche = JSON.stringify({ name: companyName, place_id: "place-target", city, category: "Boulangerie", ...geo });
  const normalized = JSON.stringify({ name: companyName, place_id: "place-target", city, category: "Boulangerie", observed_fields: [], ...geo });
  db.sqlite.prepare(`
    UPDATE analyses
    SET name = ?, place_id = 'place-target', rating = 4.5, reviews = 40, photos_count = 12,
        description_length = 10, fiche_json = ?, normalized_json = ?
    WHERE analysis_id = ?
  `).run(companyName, fiche, normalized, analysisId);
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

function refreshBody(overrides = {}) {
  return {
    operation: "refresh_search",
    analysisId: ANALYSIS_ID,
    company: "Maison Test",
    city: "Bruxelles",
    activity: "Boulangerie",
    searchQuery: "Boulangerie Bruxelles",
    ...overrides,
  };
}

// Mission "ancrage géographique" : la relance résout d'abord le point
// neutre de la localité (resolveLocalityCenter, hôte api.outscraper.com,
// distinct de la recherche concurrentielle sur api.app.outscraper.com)
// avant d'appeler le fournisseur de recherche — ces fixtures doivent donc
// répondre avec succès à ce premier appel pour que la relance testée ici
// (autorisation admin_manual/duplicate_manual, hors sujet du geocoding)
// puisse réellement atteindre la recherche concurrentielle.
function isGeocodingRequest(url) {
  return url.hostname === "api.outscraper.com";
}

function geocodingSuccessResponse() {
  return Response.json({
    data: [[{ latitude: 50.8503, longitude: 4.3517, city: "Bruxelles", postal_code: "1000", country_code: "BE" }]],
  });
}

function installSuccessfulProviderFixture() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (isGeocodingRequest(url)) return geocodingSuccessResponse();
    return Response.json({ data: [[
      { name: "Maison Test", place_id: "place-target", rating: 4.5, reviews: 40, photos_count: 12, city: "Bruxelles" },
      { name: "Concurrent A", place_id: "place-a", rating: 4.2, reviews: 30, photos_count: 8, city: "Bruxelles" },
      { name: "Concurrent B", place_id: "place-b", rating: 4.0, reviews: 20, photos_count: 5, city: "Bruxelles" },
    ]] });
  };
  return () => { globalThis.fetch = originalFetch; };
}

// Simule un échec du fournisseur de RECHERCHE une fois l'ancrage déjà
// résolu (le geocoding, hôte distinct, continue de répondre correctement)
// — isole l'échec testé ici (recherche concurrentielle) de tout échec de
// geocoding, déjà couvert ailleurs (localityGeocoder.test.js,
// freeDiagnosticGeographicAnchor.test.js).
function installFailingProviderFixture() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (isGeocodingRequest(url)) return geocodingSuccessResponse();
    return new Response("provider-down", { status: 500 });
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("isManualCreationSource() reconnaît exactement admin_manual et duplicate_manual", () => {
  assert.equal(isManualCreationSource("admin_manual"), true);
  assert.equal(isManualCreationSource("duplicate_manual"), true);
  assert.equal(isManualCreationSource("public_request"), false);
  assert.equal(isManualCreationSource(undefined), false);
  assert.equal(isManualCreationSource(null), false);
  assert.equal(isManualCreationSource(""), false);
});

test("1. un brouillon gratuit admin_manual peut relancer sa recherche", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "admin_manual", auditType: "free" });
  markInitialCollection(db);
  const restoreFetch = installSuccessfulProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.operation, "refresh_search");
  } finally {
    restoreFetch();
  }
});

test("2. un brouillon gratuit duplicate_manual peut désormais relancer sa recherche", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "free" });
  markInitialCollection(db);
  const restoreFetch = installSuccessfulProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.operation, "refresh_search");
  } finally {
    restoreFetch();
  }
});

test("3. un duplicate_manual Premium reste refusé sur l’endpoint gratuit", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false, reportType: "free" });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "premium" });
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, "DIAGNOSTIC_REQUEST_REQUIRED");
});

// Point 4 (source de création inconnue refusée) est vérifié au niveau de la
// fonction pure ci-dessus : la table audit_creation_metadata impose
// `CHECK (creation_source IN ('admin_manual', 'duplicate_manual'))`
// (migrations/0016_admin_manual_audits.sql), donc une source inconnue ne
// peut structurellement jamais exister comme ligne réelle en base — seule
// isManualCreationSource() peut être exercée avec une valeur arbitraire.
test("4. une duplication jamais finalisée (request_status != completed) reste refusée", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false });
  seedManualMetadataPending(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "free" });
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, "DIAGNOSTIC_REQUEST_REQUIRED");
});

test("5. aucune métadonnée manuelle et aucune demande liée reste refusé", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false });
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, "DIAGNOSTIC_REQUEST_REQUIRED");
});

test("6. une analyse liée à une vraie demande historique reste acceptée sans métadonnée manuelle", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: true });
  markInitialCollection(db);
  const restoreFetch = installSuccessfulProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.operation, "refresh_search");
  } finally {
    restoreFetch();
  }
});

test("7. une relance de recherche reste possible après un premier PDF", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false, status: "pdf_generated" });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "free" });
  markInitialCollection(db);
  const restoreFetch = installSuccessfulProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.operation, "refresh_search");
    assert.equal(body.status, "pdf_generated");
  } finally {
    restoreFetch();
  }
});

test("7b. une collecte initiale reste refusée après un premier PDF", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false, status: "pdf_generated" });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "free" });
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: { activity: "Boulangerie" } }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, "DIAGNOSTIC_NOT_AWAITING_REVIEW");
});

test("8. l’authentification admin reste exigée même avec duplicate_manual", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "free" });
  const response = await collectDiagnostic(await context(db, ANALYSIS_ID, {
    authenticated: false,
    body: refreshBody(),
  }));
  assert.equal(response.status, 401);
});

test("9. un échec fournisseur sur un brouillon duplicate_manual ne modifie rien partiellement", async () => {
  const db = new LocalD1();
  seedAnalysis(db, { withRequest: false });
  seedManualMetadata(db, ANALYSIS_ID, { creationSource: "duplicate_manual", auditType: "free" });
  markInitialCollection(db);
  const beforeAnalysis = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID);
  const beforeMetadata = db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(ANALYSIS_ID);
  const restoreFetch = installFailingProviderFixture();
  try {
    const response = await collectDiagnostic(await context(db, ANALYSIS_ID, { body: refreshBody() }));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, "SEARCH_REFRESH_FAILED");
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(ANALYSIS_ID), beforeAnalysis);
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(ANALYSIS_ID), beforeMetadata);
  } finally {
    restoreFetch();
  }
});
