import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import {
  onRequestGet as listTransferSources,
  onRequestPost as transferAudit,
} from "../functions/api/admin/audit-premium-transfers.js";
import {
  onRequestGet as getDraft,
  onRequestPut as putDraft,
} from "../functions/api/admin/audit-drafts/[draftId].js";
import { finalizeQuestionnaireSnapshot } from "../functions/lib/auditQuestionnaireSnapshots.js";
import {
  buildPremiumDraftFromFreeSnapshot,
  createPremiumFromCompletedFree,
  resolvePremiumReferenceCity,
} from "../functions/lib/auditPremiumTransfers.js";
import { buildReviewedObservation } from "../functions/lib/manualReview.js";
import { buildScoreCatalog } from "../functions/lib/score-efficia/scoreCatalog.js";
import { runScoreEfficia } from "../functions/lib/score-efficia/scoreEngine.js";
import { QUESTIONNAIRE_VERSION } from "../functions/lib/score-efficia/questionnaireRules.js";

const SECRET = "premium-transfer-test-secret-with-32-chars";
const SOURCE_ID = "free-source-analysis-v4";
const SECOND_SOURCE_ID = "free-second-analysis-v4";
const PREMIUM_SOURCE_ID = "premium-source-analysis-v4";
const KEY = "transfer-idempotency-key-0001";

const MIGRATIONS = [
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
  "0014_audit_drafts.sql",
  "0015_audit_questionnaire_snapshots.sql",
  "0016_admin_manual_audits.sql",
  "0017_free_to_manual_premium.sql",
];

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    MIGRATIONS.forEach((name) => {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    });
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
      _run: () => {
        const result = database.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    });
    return bound();
  }

  async batch(statements) {
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
}

function completeAnswers({ city = "Arlon", noWebsite = true } = {}) {
  const responses = {};
  buildScoreCatalog().categories.forEach((category) => {
    category.criteria.forEach((criterion) => {
      const option = criterion.key === "nap" && noWebsite
        ? criterion.options.find((item) => item.value === "no_website")
        : criterion.options[0];
      responses[criterion.key] = {
        points: option.points,
        value: option.value,
        selectedOptionIndex: option.index,
        checklist: criterion.key === "qualitePhotos" ? [0, 2] : [],
      };
    });
  });
  return {
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    reportType: "free",
    fields: {
      "p-entreprise": "Entreprise source",
      "p-ville": city,
      "p-activite": "Électricien",
    },
    observedData: { rating: 4.6, reviews: 28, googleUrl: "https://maps.example/source" },
    responses,
    reponses: responses,
    locationMode: "service_area",
    addressVerification: "not_applicable",
    serviceAreaVerification: "coherent",
    confirmedCompetitorIds: ["competitor-one"],
    excludedCompetitorIds: ["competitor-two"],
    executionPlan: { priorities: [{ id: "priority-one", status: "approved" }] },
  };
}

function seedFinalAudit(db, analysisId, reportType = "free", answers = completeAnswers()) {
  const now = "2026-08-22T09:00:00.000Z";
  const normalized = JSON.stringify({ website: null, providerCity: "Bruxelles" });
  const fiche = JSON.stringify({ rawProviderCity: "Bruxelles", google_url: "https://maps.example/source" });
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, status, fiche_json, normalized_json,
      created_at, updated_at, activity, competitors_json, report_type
    ) VALUES (?, 'Entreprise source', ?, 'Entreprise source test', 'pdf_generated', ?, ?, ?, ?,
      'Électricien', '[{"place_id":"competitor-one","name":"Concurrent"}]', ?)
  `).run(analysisId, answers.fields?.["p-ville"] || "", fiche, normalized, now, now, reportType);
  db.sqlite.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES (?, ?, 'draft', ?, ?, ?, 'questionnaire', ?, ?)
  `).run(analysisId, analysisId, reportType, QUESTIONNAIRE_VERSION, JSON.stringify(answers), now, now);
  db.sqlite.prepare(`
    INSERT INTO audit_questionnaire_snapshots (
      snapshot_id, analysis_id, source_draft_id, report_type, answers_version,
      answers_json, current_step, pdf_filename, finalized_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'questionnaire', 'source.pdf', ?)
  `).run(`snapshot-${analysisId}`, analysisId, analysisId, reportType, QUESTIONNAIRE_VERSION, JSON.stringify(answers), now);
}

function row(db, table, key, value) {
  return db.sqlite.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(value);
}

async function sessionCookie() {
  return (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
}

async function routeContext(db, body, {
  authenticated = true,
  origin = "https://preview.example",
  method = "POST",
} = {}) {
  return {
    request: new Request("https://preview.example/api/admin/audit-premium-transfers", {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        ...(origin === null ? {} : { Origin: origin }),
        ...(authenticated ? { Cookie: await sessionCookie() } : {}),
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    }),
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  };
}

async function draftContext(db, analysisId, body = null, method = "GET") {
  return {
    request: new Request(`https://preview.example/api/admin/audit-drafts/${analysisId}`, {
      method,
      headers: {
        Accept: "application/json",
        Cookie: await sessionCookie(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    params: { draftId: analysisId },
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  };
}

test("le transfert crée un Premium manuel éditable sans muter le diagnostic gratuit", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  const original = {
    analysis: row(db, "analyses", "analysis_id", SOURCE_ID),
    draft: row(db, "audit_drafts", "analysis_id", SOURCE_ID),
    snapshot: row(db, "audit_questionnaire_snapshots", "analysis_id", SOURCE_ID),
  };

  const result = await createPremiumFromCompletedFree(db, {
    sourceAnalysisId: SOURCE_ID,
    idempotencyKey: KEY,
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.notEqual(result.analysisId, SOURCE_ID);
  const premium = row(db, "analyses", "analysis_id", result.analysisId);
  const draft = row(db, "audit_drafts", "analysis_id", result.analysisId);
  const metadata = row(db, "audit_creation_metadata", "analysis_id", result.analysisId);
  const answers = JSON.parse(draft.answers_json);
  assert.equal(premium.report_type, "premium");
  assert.equal(premium.status, "awaiting_review");
  assert.equal(premium.order_id, null);
  assert.equal(draft.answers_version, QUESTIONNAIRE_VERSION);
  assert.equal(answers.reportType, "premium");
  assert.equal(answers.locationMode, "service_area");
  assert.equal(answers.serviceAreaVerification, "coherent");
  assert.deepEqual(answers.confirmedCompetitorIds, ["competitor-one"]);
  assert.deepEqual(answers.executionPlan, { priorities: [{ id: "priority-one", status: "approved" }] });
  assert.equal(answers.criteriaReview.find((item) => item.key === "nap").value, "no_website");
  assert.deepEqual(answers.criteriaReview.find((item) => item.key === "qualitePhotos").checklist, ["Photos nettes", "Bon cadrage"]);
  assert.equal(runScoreEfficia({ manualReview: answers }).reviewedScore.roundedScore, 97);
  assert.equal(metadata.creation_source, "admin_manual");
  assert.equal(metadata.audit_type, "premium");
  assert.equal(metadata.billing_status, "manual_unpaid");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_questionnaire_snapshots WHERE analysis_id = ?").get(result.analysisId).count, 0);
  assert.deepEqual(row(db, "analyses", "analysis_id", SOURCE_ID), original.analysis);
  assert.deepEqual(row(db, "audit_drafts", "analysis_id", SOURCE_ID), original.draft);
  assert.deepEqual(row(db, "audit_questionnaire_snapshots", "analysis_id", SOURCE_ID), original.snapshot);
  assert.equal(db.count("orders"), 0);
  assert.equal(db.count("order_tasks"), 0);
  assert.equal(db.count("diagnostic_requests"), 0);
});

test("les réponses masquées par une dépendance sont nettoyées avant le nouveau brouillon", () => {
  const answers = completeAnswers();
  answers.responses.descriptionRemplie = { points: 0, value: "deficient", selectedOptionIndex: 2, checklist: [] };
  answers.responses.descriptionQualite = { points: 4, value: "compliant", selectedOptionIndex: 0, checklist: [0, 1, 2, 3] };
  const draft = buildPremiumDraftFromFreeSnapshot({
    snapshot: { snapshotId: "snapshot-source", answersVersion: QUESTIONNAIRE_VERSION, answers },
    analysis: { analysis_id: SOURCE_ID, ville: "Arlon", normalized_json: "{}", fiche_json: "{}" },
    importedAt: "2026-08-22T10:00:00.000Z",
  });
  assert.equal(draft.criteriaReview.some((item) => item.key === "descriptionQualite"), false);
  assert.equal(Object.hasOwn(draft.responses, "descriptionQualite"), false);
  assert.equal(Object.hasOwn(draft.reponses, "descriptionQualite"), false);
});

test("une même clé retourne le même Premium et une autre source est refusée", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  seedFinalAudit(db, SECOND_SOURCE_ID);
  const first = await createPremiumFromCompletedFree(db, { sourceAnalysisId: SOURCE_ID, idempotencyKey: KEY });
  const retry = await createPremiumFromCompletedFree(db, { sourceAnalysisId: SOURCE_ID, idempotencyKey: KEY });
  const conflict = await createPremiumFromCompletedFree(db, { sourceAnalysisId: SECOND_SOURCE_ID, idempotencyKey: KEY });
  assert.equal(retry.created, false);
  assert.equal(retry.analysisId, first.analysisId);
  assert.deepEqual(conflict, { ok: false, error: "IDEMPOTENCY_KEY_SOURCE_CONFLICT" });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM analyses WHERE report_type = 'premium'").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_premium_transfers").get().count, 1);
});

test("un échec de création du brouillon annule toute la transaction", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  db.sqlite.exec(`
    CREATE TRIGGER fail_transferred_draft
    BEFORE INSERT ON audit_drafts
    WHEN NEW.analysis_id <> '${SOURCE_ID}'
    BEGIN SELECT RAISE(ABORT, 'forced draft failure'); END;
  `);
  await assert.rejects(() => createPremiumFromCompletedFree(db, {
    sourceAnalysisId: SOURCE_ID,
    idempotencyKey: "transfer-failing-key-0002",
  }));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM analyses").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_creation_metadata").get().count, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_premium_transfers").get().count, 0);
});

test("la route exige session, Same-Origin et payload strictement borné", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  const payload = { operation: "create_premium_from_free", sourceAnalysisId: SOURCE_ID, idempotencyKey: KEY };
  assert.equal((await transferAudit(await routeContext(db, payload, { authenticated: false }))).status, 401);
  assert.equal((await transferAudit(await routeContext(db, payload, { origin: null }))).status, 403);
  assert.equal((await transferAudit(await routeContext(db, payload, { origin: "https://evil.example" }))).status, 403);
  const forged = await transferAudit(await routeContext(db, { ...payload, answers: { forged: true }, orderId: "forged" }));
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).error, "FORGED_TRANSFER_PAYLOAD");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM analyses WHERE report_type = 'premium'").get().count, 0);
  const invalidOperation = await transferAudit(await routeContext(db, { ...payload, operation: "implicit_transfer" }));
  assert.equal(invalidOperation.status, 400);
  assert.equal((await invalidOperation.json()).error, "INVALID_TRANSFER_OPERATION");
});

test("la route crée une seule analyse sans appel Stripe, MailerLite ou commercial", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  const payload = { operation: "create_premium_from_free", sourceAnalysisId: SOURCE_ID, idempotencyKey: KEY };
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    throw new Error("unexpected external call");
  };
  try {
    const first = await transferAudit(await routeContext(db, payload));
    const firstBody = await first.json();
    const retry = await transferAudit(await routeContext(db, payload));
    const retryBody = await retry.json();
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(firstBody.transfer.analysisId, retryBody.transfer.analysisId);
    assert.equal(externalCalls, 0);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM analyses WHERE report_type = 'premium'").get().count, 1);
    assert.equal(db.count("orders"), 0);
    assert.equal(db.count("order_tasks"), 0);
    assert.equal(db.count("diagnostic_requests"), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la route refuse source inconnue, Premium et état non transférable", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, PREMIUM_SOURCE_ID, "premium", { ...completeAnswers(), reportType: "premium" });
  seedFinalAudit(db, SOURCE_ID);
  db.sqlite.prepare("UPDATE analyses SET status = 'awaiting_review' WHERE analysis_id = ?").run(SOURCE_ID);
  const base = { operation: "create_premium_from_free", idempotencyKey: KEY };
  const unknown = await transferAudit(await routeContext(db, { ...base, sourceAnalysisId: "unknown-analysis-id" }));
  const premium = await transferAudit(await routeContext(db, { ...base, sourceAnalysisId: PREMIUM_SOURCE_ID, idempotencyKey: "premium-source-key-0002" }));
  const unfinished = await transferAudit(await routeContext(db, { ...base, sourceAnalysisId: SOURCE_ID, idempotencyKey: "unfinished-source-key-0003" }));
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error, "SOURCE_SNAPSHOT_NOT_FOUND");
  assert.equal(premium.status, 409);
  assert.equal((await premium.json()).error, "SOURCE_NOT_FREE");
  assert.equal(unfinished.status, 409);
  assert.equal((await unfinished.json()).error, "SOURCE_NOT_COMPLETED");
});

test("la liste des sources est authentifiée et ne propose que les snapshots gratuits v4", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  seedFinalAudit(db, PREMIUM_SOURCE_ID, "premium", { ...completeAnswers(), reportType: "premium" });
  assert.equal((await listTransferSources(await routeContext(db, null, { authenticated: false, method: "GET" }))).status, 401);
  const response = await listTransferSources(await routeContext(db, null, { method: "GET" }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.sources.map((item) => item.analysisId), [SOURCE_ID]);
  assert.equal(body.sources[0].answersVersion, QUESTIONNAIRE_VERSION);
});

test("la ville suit la priorité administrative puis fiable sans écraser les données brutes", async () => {
  const answers = completeAnswers({ city: "Namur" });
  const analysis = {
    analysis_id: SOURCE_ID,
    ville: "Namur",
    normalized_json: JSON.stringify({ city: "Liège" }),
    fiche_json: JSON.stringify({ city: "Bruxelles" }),
  };
  assert.equal(resolvePremiumReferenceCity({ administratorCity: "Arlon", answers, analysis }), "Arlon");
  assert.equal(resolvePremiumReferenceCity({ answers, analysis }), "Liège");
  const rawBefore = analysis.normalized_json;
  const draft = buildPremiumDraftFromFreeSnapshot({
    snapshot: { snapshotId: "snapshot-source", answersVersion: QUESTIONNAIRE_VERSION, answers },
    analysis,
    administratorCity: "Arlon",
    importedAt: "2026-08-22T10:00:00.000Z",
  });
  assert.equal(draft.confirmedCity, "Arlon");
  assert.equal(draft.fields["p-ville"], "Arlon");
  assert.equal(analysis.normalized_json, rawBefore);
});

test("Arlon est sauvegardée, restaurée, figée dans le snapshot et utilisée par le rapport", async () => {
  const db = new LocalD1();
  seedFinalAudit(db, SOURCE_ID);
  const transfer = await createPremiumFromCompletedFree(db, { sourceAnalysisId: SOURCE_ID, idempotencyKey: KEY });
  const stored = JSON.parse(row(db, "audit_drafts", "analysis_id", transfer.analysisId).answers_json);
  stored.confirmedCity = "Arlon";
  stored.fields["p-ville"] = "Arlon";
  const save = await putDraft(await draftContext(db, transfer.analysisId, {
    analysisId: transfer.analysisId,
    reportType: "premium",
    currentStep: "questionnaire",
    answers: stored,
  }, "PUT"));
  assert.equal(save.status, 200);
  const restored = await getDraft(await draftContext(db, transfer.analysisId));
  assert.equal((await restored.json()).draft.answers.confirmedCity, "Arlon");
  const snapshot = await finalizeQuestionnaireSnapshot(db, transfer.analysisId, { pdfFilename: "premium.pdf" });
  assert.equal(snapshot.snapshot.answers.confirmedCity, "Arlon");
  const premiumRaw = row(db, "analyses", "analysis_id", transfer.analysisId);
  const rawNormalizedBefore = premiumRaw.normalized_json;
  assert.equal(buildReviewedObservation(premiumRaw, { confirmedCity: "Arlon" }).city, "Arlon");
  assert.equal(row(db, "analyses", "analysis_id", transfer.analysisId).normalized_json, rawNormalizedBefore);
});

test("l’interface expose le transfert uniquement pour un Gratuit v4 et neutralise les doubles clics", () => {
  const admin = readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const free = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  const premium = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  assert.match(admin, /audit\.reportType === "free" && audit\.answersVersion === "score-efficia-questionnaire-v4"/);
  assert.match(admin, /data-transfer-premium/);
  assert.match(admin, /transferConfirm\.disabled/);
  assert.match(admin, /data\.links\?\.review/);
  assert.match(dashboard, /Créer le Premium et reprendre les réponses/);
  assert.match(dashboard, /Le diagnostic gratuit original restera strictement inchangé/);
  assert.match(free, /Créer un audit Premium à partir de ce diagnostic/);
  assert.match(free, /snapshot\?\.answersVersion === "score-efficia-questionnaire-v4"/);
  assert.match(free, /transfertPremiumEnCours/);
  assert.match(premium, /data-confirmed-city/);
  assert.match(premium, /confirmedCity: cleanAdministrativeCity\(confirmedCityInput/);
});

test("0017 est réexécutable et impose les unicités du registre", () => {
  const db = new LocalD1();
  const migration = readFileSync(new URL("../migrations/0017_free_to_manual_premium.sql", import.meta.url), "utf8");
  assert.doesNotThrow(() => db.sqlite.exec(migration));
  seedFinalAudit(db, SOURCE_ID);
  seedFinalAudit(db, SECOND_SOURCE_ID);
  db.sqlite.prepare(`
    INSERT INTO audit_premium_transfers (
      source_analysis_id, idempotency_key, source_snapshot_id,
      target_analysis_id, transfer_type, created_at
    ) VALUES (?, 'unique-key-00000001', ?, ?, 'free_to_manual_premium', '2026-08-22T10:00:00Z')
  `).run(SOURCE_ID, `snapshot-${SOURCE_ID}`, SECOND_SOURCE_ID);
  assert.throws(() => db.sqlite.prepare(`
    INSERT INTO audit_premium_transfers (
      source_analysis_id, idempotency_key, source_snapshot_id,
      target_analysis_id, transfer_type, created_at
    ) VALUES (?, 'unique-key-00000001', ?, ?, 'free_to_manual_premium', '2026-08-22T10:01:00Z')
  `).run(SECOND_SOURCE_ID, `snapshot-${SECOND_SOURCE_ID}`, SOURCE_ID));
  assert.equal(db.sqlite.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});
