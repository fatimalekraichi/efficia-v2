import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSessionCookie } from "../functions/admin/_shared.js";
import {
  duplicateQuestionnaireSnapshot,
  finalizeQuestionnaireSnapshot,
  normalizeQuestionnaireAnswers,
  prepareDuplicatedDraftAnswers,
} from "../functions/lib/auditQuestionnaireSnapshots.js";
import { onRequestGet as listDrafts } from "../functions/api/admin/audit-drafts.js";
import { onRequestGet as listSnapshots } from "../functions/api/admin/audit-snapshots.js";
import { __test__ as auditReviewTest } from "../functions/api/admin/audit-review/[analysisId].js";
import {
  onRequestGet as getSnapshot,
  onRequestPost as mutateSnapshot,
} from "../functions/api/admin/audit-snapshots/[analysisId].js";
import { onRequestDelete as deleteDraft } from "../functions/api/admin/audit-drafts/[draftId].js";

const SECRET = "audit-snapshot-test-secret-with-32-characters";
const FREE_ID = "snapshot-free-analysis";
const PREMIUM_ID = "snapshot-premium-analysis";
const MANUAL_PREMIUM_ID = "snapshot-manual-premium-completed";
const PAID_PREMIUM_ID = "snapshot-paid-premium-completed";
const ACTIVE_PREMIUM_ID = "snapshot-premium-active";
const DUPLICATION_KEY = "c9096218-ad24-4a49-9028-f80f251e19db";

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const name of [
      "0001_orders_tasks.sql",
      "0003_analyses.sql",
      "0004_analysis_competitors.sql",
      "0005_analysis_benchmark.sql",
      "0006_analysis_knowledge.sql",
      "0007_analysis_reasoning_composer.sql",
    ]) {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    this.sqlite.exec("ALTER TABLE analyses ADD COLUMN order_id TEXT");
    for (const name of [
      "0009_manual_review_gate.sql",
      "0010_analysis_report_type.sql",
      "0011_score_efficia_historical.sql",
      "0014_audit_drafts.sql",
      "0015_audit_questionnaire_snapshots.sql",
      "0016_admin_manual_audits.sql",
    ]) {
      this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
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
}

function seedAnalysis(db, analysisId, reportType = "free") {
  const now = "2026-08-20T10:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO analyses (
      analysis_id, nom, ville, query, status, fiche_json, normalized_json,
      created_at, updated_at, report_type
    ) VALUES (?, ?, 'Bruxelles', 'test Bruxelles', 'approved', '{}', '{}', ?, ?, ?)
  `).run(analysisId, `Entreprise ${reportType}`, now, now, reportType);
}

function seedDraft(db, analysisId, reportType, answers, version = answers.questionnaireVersion) {
  const now = "2026-08-20T11:00:00.000Z";
  db.sqlite.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES (?, ?, 'draft', ?, ?, ?, 'questionnaire', ?, ?)
  `).run(analysisId, analysisId, reportType, version, JSON.stringify(answers), now, now);
}

async function apiContext(db, analysisId, { authenticated = true, method = "GET", body = null } = {}) {
  const cookie = authenticated ? (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0] : "";
  return {
    request: new Request(`https://preview.example/api/admin/audit-snapshots/${analysisId}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    params: { analysisId },
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  };
}

test("aperçu et PDF conservent le brouillon puis figent un snapshot idempotent", async () => {
  const db = new LocalD1();
  seedAnalysis(db, FREE_ID, "free");
  seedDraft(db, FREE_ID, "free", {
    questionnaireVersion: "score-efficia-questionnaire-v2",
    reponses: {
      horaires: { points: 2, selectedOptionIndex: 1, checklist: [0, 2, 4] },
    },
    locationMode: "storefront",
    addressVerification: "exact",
  });

  // L'aperçu ne finalise rien : le brouillon demeure la seule sauvegarde.
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_drafts").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_questionnaire_snapshots").get().count, 0);

  const first = await finalizeQuestionnaireSnapshot(db, FREE_ID, { pdfFilename: "audit.pdf" });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(first.snapshot.answersVersion, "score-efficia-questionnaire-v2");
  assert.deepEqual(first.snapshot.answers.responses.horaires.checklist, [0, 2, 4]);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_drafts").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT status FROM analyses WHERE analysis_id = ?").get(FREE_ID).status, "pdf_generated");

  db.sqlite.prepare("UPDATE audit_drafts SET answers_json = ? WHERE analysis_id = ?")
    .run(JSON.stringify({ questionnaireVersion: "score-efficia-questionnaire-v4", responses: { horaires: { points: 0 } } }), FREE_ID);
  const second = await finalizeQuestionnaireSnapshot(db, FREE_ID, { pdfFilename: "different.pdf" });
  assert.equal(second.created, false);
  assert.equal(second.snapshot.snapshotId, first.snapshot.snapshotId);
  assert.equal(second.snapshot.answers.responses.horaires.points, 2);
  assert.throws(
    () => db.sqlite.prepare("UPDATE audit_questionnaire_snapshots SET pdf_filename = 'mutated.pdf' WHERE analysis_id = ?").run(FREE_ID),
    /immutable/,
  );
  assert.throws(
    () => db.sqlite.prepare("DELETE FROM audit_questionnaire_snapshots WHERE analysis_id = ?").run(FREE_ID),
    /immutable/,
  );

  const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
  const listContext = { request: new Request("https://preview.example/api/admin/audit-drafts", { headers: { Cookie: cookie } }), env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db } };
  assert.deepEqual((await (await listDrafts(listContext)).json()).drafts, []);
  const completed = await (await listSnapshots(listContext)).json();
  assert.equal(completed.audits.length, 1);
  assert.equal(completed.audits[0].analysisId, FREE_ID);

  const deleteContext = await apiContext(db, FREE_ID, { method: "DELETE" });
  deleteContext.params = { draftId: FREE_ID };
  const protectedDraft = await deleteDraft(deleteContext);
  assert.equal(protectedDraft.status, 409);
  assert.equal((await protectedDraft.json()).error, "FINALIZED_DRAFT_IMMUTABLE");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_drafts WHERE draft_id = ?").get(FREE_ID).count, 1);
});

test("les Premium approuvés sont terminés dès le snapshot, même avec brouillon conservé et sans pdf_generated_at", async () => {
  const db = new LocalD1();
  for (const analysisId of [MANUAL_PREMIUM_ID, PAID_PREMIUM_ID, ACTIVE_PREMIUM_ID]) {
    seedAnalysis(db, analysisId, "premium");
    seedDraft(db, analysisId, "premium", {
      questionnaireVersion: "score-efficia-questionnaire-v4",
      reportType: "premium",
      responses: { horaires: { points: 2, checklist: ["Horaires vérifiés"] } },
    });
  }
  db.sqlite.prepare("UPDATE analyses SET status = 'awaiting_review', approved_at = NULL WHERE analysis_id = ?").run(ACTIVE_PREMIUM_ID);
  db.sqlite.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES ('manual-completed-key', ?, 'admin_manual', 'premium',
      'manual_unpaid', 'completed', '2026-08-23T09:00:00.000Z', '2026-08-23T09:00:00.000Z')
  `).run(MANUAL_PREMIUM_ID);
  db.sqlite.prepare(`
    INSERT INTO orders (
      order_id, stripe_session_id, email, offer_code, offer_name, amount_total,
      currency, status, paid_at, created_at, updated_at
    ) VALUES ('paid-completed-order', 'paid-completed-session', 'fixture@example.test',
      'audit', 'Audit Premium', 9900, 'eur', 'paid',
      '2026-08-23T09:00:00.000Z', '2026-08-23T09:00:00.000Z', '2026-08-23T09:00:00.000Z')
  `).run();
  db.sqlite.prepare("UPDATE analyses SET order_id = 'paid-completed-order' WHERE analysis_id = ?").run(PAID_PREMIUM_ID);

  const manual = await finalizeQuestionnaireSnapshot(db, MANUAL_PREMIUM_ID, { completion: "approved" });
  const paid = await finalizeQuestionnaireSnapshot(db, PAID_PREMIUM_ID, { completion: "approved" });
  assert.equal(manual.created, true);
  assert.equal(paid.created, true);

  const completedRows = db.sqlite.prepare(`
    SELECT analysis_id, status, approved_at, pdf_generated_at
    FROM analyses WHERE analysis_id IN (?, ?)
    ORDER BY analysis_id
  `).all(MANUAL_PREMIUM_ID, PAID_PREMIUM_ID);
  assert.ok(completedRows.every((item) => item.status === "approved"));
  assert.ok(completedRows.every((item) => item.approved_at));
  assert.ok(completedRows.every((item) => item.pdf_generated_at === null));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_drafts").get().count, 3);

  const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
  const listContext = {
    request: new Request("https://preview.example/admin", { headers: { Cookie: cookie } }),
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  };
  const draftsResponse = await listDrafts(listContext);
  const snapshotsResponse = await listSnapshots(listContext);
  const drafts = (await draftsResponse.json()).drafts;
  const completed = (await snapshotsResponse.json()).audits;
  const draftIds = new Set(drafts.map((item) => item.analysisId));
  const completedIds = new Set(completed.map((item) => item.analysisId));

  assert.deepEqual([...draftIds], [ACTIVE_PREMIUM_ID]);
  assert.equal(completedIds.has(MANUAL_PREMIUM_ID), true);
  assert.equal(completedIds.has(PAID_PREMIUM_ID), true);
  assert.equal([...draftIds].some((analysisId) => completedIds.has(analysisId)), false);
  assert.equal(draftsResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(snapshotsResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM orders").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COALESCE(SUM(amount_total), 0) AS total FROM orders").get().total, 9900);
});

test("la duplication crée une nouvelle analyse et un nouveau brouillon sans muter l’original", async () => {
  const db = new LocalD1();
  seedAnalysis(db, PREMIUM_ID, "premium");
  db.sqlite.prepare(`
    UPDATE analyses
    SET nom = 'ME ELEC', name = 'ME ELEC', ville = 'Non renseignée',
        activity = 'Électricien', normalized_json = ?
    WHERE analysis_id = ?
  `).run(JSON.stringify({ category: "Électricien", description: "", subtypes: ["Électricien"] }), PREMIUM_ID);
  db.sqlite.prepare(`
    INSERT INTO orders (
      order_id, stripe_session_id, email, offer_code, offer_name, amount_total,
      currency, status, paid_at, created_at, updated_at
    ) VALUES ('paid-order', 'stripe-session', 'client@example.com', 'audit',
      'Audit Premium', 9900, 'eur', 'paid', ?, ?, ?)
  `).run("2026-08-20T09:00:00.000Z", "2026-08-20T09:00:00.000Z", "2026-08-20T09:00:00.000Z");
  db.sqlite.prepare("UPDATE analyses SET order_id = 'paid-order' WHERE analysis_id = ?").run(PREMIUM_ID);
  const answers = {
    questionnaireVersion: "score-efficia-questionnaire-v4",
    reportType: "premium",
    locationMode: "hybrid",
    addressVerification: "exact",
    serviceAreaVerification: "partial",
    confirmedCity: "Arlon",
    responses: {
      websiteConsistency: {
        value: "no_website",
        points: 0,
        checklist: ["Absence de site officiel vérifiée"],
      },
      horaires: { value: "partial", points: 1, checklist: ["Jours fériés vérifiés"] },
    },
    criteriaReview: [{ key: "horaires", value: "partial", checklist: ["Jours fériés vérifiés"] }],
    executionPlan: {
      description: {
        text: "ME ELEC est une fiche Google Business associée à la catégorie « Électricien » à Non renseignée.",
        status: "approved",
        analysisId: PREMIUM_ID,
      },
      posts: [{ id: "post-1", text: "Ancienne publication à Non renseignée", status: "approved", analysisId: PREMIUM_ID }],
      reviewResponses: [{ id: "response-1", text: "Ancienne réponse générée", status: "approved", analysisId: PREMIUM_ID }],
    },
  };
  seedDraft(db, PREMIUM_ID, "premium", answers);
  await finalizeQuestionnaireSnapshot(db, PREMIUM_ID, { pdfFilename: "premium.pdf" });
  const originalBefore = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(PREMIUM_ID);
  const originalDraftBefore = db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(PREMIUM_ID);
  const originalSnapshotBefore = db.sqlite.prepare("SELECT * FROM audit_questionnaire_snapshots WHERE analysis_id = ?").get(PREMIUM_ID);

  const duplicate = await duplicateQuestionnaireSnapshot(db, PREMIUM_ID, DUPLICATION_KEY);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.created, true);
  assert.notEqual(duplicate.analysisId, PREMIUM_ID);
  assert.equal(duplicate.draftId, duplicate.analysisId);
  const duplicatedAnalysis = db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(duplicate.analysisId);
  assert.equal(duplicatedAnalysis.status, "awaiting_review");
  assert.equal(duplicatedAnalysis.report_type, "premium");
  assert.equal(duplicatedAnalysis.order_id, null);
  assert.equal(duplicatedAnalysis.pdf_generated_at, null);
  assert.equal(duplicatedAnalysis.document_model_json, null);
  assert.equal(duplicatedAnalysis.approved_at, null);
  const duplicatedDraft = db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(duplicate.analysisId);
  const duplicatedAnswers = JSON.parse(duplicatedDraft.answers_json);
  const expectedDuplicatedAnswers = prepareDuplicatedDraftAnswers(answers, "score-efficia-questionnaire-v4");
  assert.deepEqual(duplicatedAnswers, expectedDuplicatedAnswers);
  assert.equal("executionPlan" in duplicatedAnswers, false);
  assert.equal(duplicatedAnswers.questionnaireVersion, "score-efficia-questionnaire-v4");
  assert.equal(duplicatedAnswers.confirmedCity, "Arlon");
  assert.equal(duplicatedAnswers.responses.websiteConsistency.value, "no_website");
  assert.equal(duplicatedAnswers.responses.websiteConsistency.points, 0);
  assert.deepEqual(duplicatedAnswers.responses.websiteConsistency.checklist, ["Absence de site officiel vérifiée"]);
  assert.equal(duplicatedAnswers.locationMode, "hybrid");
  const duplicatedManualReview = JSON.parse(duplicatedAnalysis.manual_review_json);
  assert.equal(duplicatedManualReview.locationMode, "hybrid");
  assert.equal(duplicatedManualReview.confirmedCity, "Arlon");
  assert.equal(duplicatedManualReview.responses.websiteConsistency.value, "no_website");
  assert.equal("executionPlan" in duplicatedManualReview, false);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM analyses WHERE analysis_id = ?").get(PREMIUM_ID), originalBefore);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_drafts WHERE analysis_id = ?").get(PREMIUM_ID), originalDraftBefore);
  assert.deepEqual(db.sqlite.prepare("SELECT * FROM audit_questionnaire_snapshots WHERE analysis_id = ?").get(PREMIUM_ID), originalSnapshotBefore);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_questionnaire_snapshots WHERE analysis_id = ?").get(PREMIUM_ID).count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_questionnaire_snapshots WHERE analysis_id = ?").get(duplicate.analysisId).count, 0);
  const duplicatedMetadata = db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(duplicate.analysisId);
  assert.equal(duplicatedMetadata.creation_source, "duplicate_manual");
  assert.equal(duplicatedMetadata.billing_status, "manual_unpaid");

  const rebuilt = await auditReviewTest.rebuildDuplicatedExecutionPlan({
    db,
    row: duplicatedAnalysis,
    analysisId: duplicate.analysisId,
    payload: { ...duplicatedAnswers, executionPlan: answers.executionPlan },
  });
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.sourceAnalysisId, PREMIUM_ID);
  assert.match(rebuilt.review.description.text, /« Électricien » à Arlon\./);
  assert.doesNotMatch(JSON.stringify(rebuilt.review), /Non renseignée|Ancienne publication|Ancienne réponse générée/);
  assert.equal(rebuilt.review.description.analysisId, duplicate.analysisId);

  const retry = await duplicateQuestionnaireSnapshot(db, PREMIUM_ID, DUPLICATION_KEY);
  assert.equal(retry.created, false);
  assert.equal(retry.analysisId, duplicate.analysisId);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM analyses").get().count, 2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_drafts").get().count, 2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_questionnaire_duplications").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM orders").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COALESCE(SUM(amount_total), 0) AS total FROM orders").get().total, 9900);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM order_tasks").get().count, 0);
});

test("la duplication est atomique si la création du brouillon échoue", async () => {
  const db = new LocalD1();
  seedAnalysis(db, PREMIUM_ID, "premium");
  seedDraft(db, PREMIUM_ID, "premium", {
    questionnaireVersion: "score-efficia-questionnaire-v4",
    responses: { horaires: { points: 2 } },
  });
  await finalizeQuestionnaireSnapshot(db, PREMIUM_ID);
  db.sqlite.exec(`
    CREATE TRIGGER reject_duplicated_draft
    BEFORE INSERT ON audit_drafts
    WHEN NEW.analysis_id != '${PREMIUM_ID}'
    BEGIN
      SELECT RAISE(ABORT, 'forced draft failure');
    END;
  `);

  await assert.rejects(
    duplicateQuestionnaireSnapshot(db, PREMIUM_ID, "6f044adc-68a5-40f4-a9a9-f6c4ee67e2ca"),
    /forced draft failure/,
  );
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM analyses").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_questionnaire_duplications").get().count, 0);
});

test("la duplication d’un Premium manuel reste administrative sans commande ni tâche artificielle", async () => {
  const db = new LocalD1();
  seedAnalysis(db, PREMIUM_ID, "premium");
  db.sqlite.prepare(`
    INSERT INTO audit_creation_metadata (
      idempotency_key, analysis_id, creation_source, audit_type,
      billing_status, request_status, created_at, updated_at
    ) VALUES ('manual-source-key', ?, 'admin_manual', 'premium',
      'manual_unpaid', 'completed', '2026-08-23T09:00:00.000Z', '2026-08-23T09:00:00.000Z')
  `).run(PREMIUM_ID);
  seedDraft(db, PREMIUM_ID, "premium", {
    questionnaireVersion: "score-efficia-questionnaire-v4",
    confirmedCity: "Arlon",
    responses: { nap: { value: "no_website", points: 0, checklist: [] } },
    executionPlan: { description: { text: "Ancien texte généré", status: "approved" } },
  });
  await finalizeQuestionnaireSnapshot(db, PREMIUM_ID);

  const duplicate = await duplicateQuestionnaireSnapshot(db, PREMIUM_ID, "manual-source-duplication-key");
  const metadata = db.sqlite.prepare("SELECT * FROM audit_creation_metadata WHERE analysis_id = ?").get(duplicate.analysisId);
  assert.equal(duplicate.created, true);
  assert.equal(metadata.creation_source, "duplicate_manual");
  assert.equal(metadata.audit_type, "premium");
  assert.equal(metadata.billing_status, "manual_unpaid");
  assert.equal(db.sqlite.prepare("SELECT order_id FROM analyses WHERE analysis_id = ?").get(duplicate.analysisId).order_id, null);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM orders").get().count, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM order_tasks").get().count, 0);
});

test("la migration 0015 est réexécutable", () => {
  const db = new LocalD1();
  const migration = readFileSync(new URL("../migrations/0015_audit_questionnaire_snapshots.sql", import.meta.url), "utf8");
  assert.doesNotThrow(() => db.sqlite.exec(migration));
});

test("les snapshots v2, v3 et v4 restent lisibles sans perdre les réponses historiques", () => {
  for (const version of [2, 3, 4]) {
    const versionName = `score-efficia-questionnaire-v${version}`;
    const legacy = version < 4
      ? { questionnaireVersion: versionName, reponses: { contact: { points: 2, checklist: [1] } } }
      : { questionnaireVersion: versionName, responses: { contact: { points: 2, checklist: [1] } } };
    const normalized = normalizeQuestionnaireAnswers(legacy, versionName);
    assert.equal(normalized.questionnaireVersion, versionName);
    assert.equal(normalized.responses.contact.points, 2);
    assert.deepEqual(normalized.responses.contact.checklist, [1]);
  }
});

test("consultation, finalisation et duplication exigent une session admin et signalent les sauvegardes absentes", async () => {
  const db = new LocalD1();
  seedAnalysis(db, FREE_ID, "free");
  const unauthorized = await getSnapshot(await apiContext(db, FREE_ID, { authenticated: false }));
  assert.equal(unauthorized.status, 401);

  const missing = await getSnapshot(await apiContext(db, FREE_ID));
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).message, /Aucune sauvegarde finale/);

  const finalizeMissing = await mutateSnapshot(await apiContext(db, FREE_ID, {
    method: "POST",
    body: { action: "finalize", pdfFilename: "missing.pdf" },
  }));
  assert.equal(finalizeMissing.status, 409);
  assert.equal((await finalizeMissing.json()).error, "QUESTIONNAIRE_SNAPSHOT_UNAVAILABLE");

  const invalidDuplication = await mutateSnapshot(await apiContext(db, FREE_ID, {
    method: "POST",
    body: { action: "duplicate", idempotencyKey: "too-short" },
  }));
  assert.equal(invalidDuplication.status, 400);
  assert.equal((await invalidDuplication.json()).error, "INVALID_IDEMPOTENCY_KEY");
});

test("le tableau de bord sépare les audits terminés et expose Consulter/Dupliquer en lecture seule", () => {
  const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const adminScript = readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
  const premiumScript = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  const freeHtml = readFileSync(new URL("../admin/free-diagnostic-production/index.html", import.meta.url), "utf8");
  assert.match(html, /Audits en cours/);
  assert.match(html, /Audits terminés/);
  assert.match(adminScript, />Consulter</);
  assert.match(adminScript, /Dupliquer pour nouvelle version/);
  assert.match(adminScript, /crypto\.randomUUID\(\)/);
  assert.match(adminScript, /idempotencyKey/);
  assert.match(adminScript, /readonly=1/);
  assert.ok((adminScript.match(/cache: "no-store"/g) || []).length >= 2);
  assert.match(premiumScript, /Audit terminé — consultation en lecture seule/);
  assert.match(freeHtml, /Audit terminé — consultation en lecture seule/);
  assert.match(freeHtml, /data\.auditPublicIdActif !== currentAnalysisId/);
  assert.match(freeHtml, /reponses\[cr\.key\][\s\S]*checklist/);
  assert.match(freeHtml, /input\.checked = checklist\.has/);
  assert.match(premiumScript, /restoreCompetitorSelection\(answers\)/);
  assert.match(premiumScript, /restoreExecutionPlan\(answers\.executionPlan\)/);
  assert.ok(premiumScript.indexOf("updateLinks(currentAnalysis)") < premiumScript.indexOf("await restoreDraft()"));
  assert.match(premiumScript, /if \(!readOnlyMode\) \{\s*setStatus\(currentAnalysis\.status/);
  assert.doesNotMatch(freeHtml, /supprimerBrouillonD1ApresFinalisation/);
});

test("les identifiants D1 Preview et production restent distincts", () => {
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const production = wrangler.match(/database_name = "efficia_orders"[\s\S]*?database_id = "([^"]+)"/)?.[1];
  const preview = wrangler.match(/database_name = "efficia-orders-preview"[\s\S]*?database_id = "([^"]+)"/)?.[1];
  assert.ok(production);
  assert.ok(preview);
  assert.notEqual(preview, production);
});
