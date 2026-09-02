import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { onRequestGet as getAuditReviewPage } from "../functions/admin/audit-review/[analysisId].js";
import { onRequestPatch as patchAuditReview } from "../functions/api/admin/audit-review/[analysisId].js";
import { onRequestGet as listDrafts } from "../functions/api/admin/audit-drafts.js";
import {
  onRequestDelete as deleteDraft,
  onRequestGet as getDraft,
  onRequestPut as putDraft,
} from "../functions/api/admin/audit-drafts/[draftId].js";

const SECRET = "local-admin-secret";
const FREE_ID = "analysis-free-draft";
const PREMIUM_ID = "analysis-premium-draft";
const migrations = ["0001_orders_tasks.sql", "0003_analyses.sql", "0008_order_analysis_link.sql", "0010_analysis_report_type.sql", "0014_audit_drafts.sql", "0015_audit_questionnaire_snapshots.sql", "0016_admin_manual_audits.sql"];

class LocalD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    migrations.forEach((name) => this.sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8")));
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
}

function seed(db, analysisId, reportType) {
  const now = new Date().toISOString();
  db.sqlite.prepare(`
    INSERT INTO analyses (analysis_id, nom, ville, query, status, created_at, updated_at, report_type)
    VALUES (?, ?, ?, ?, 'awaiting_review', ?, ?, ?)
  `).run(analysisId, `Entreprise ${reportType}`, "Bruxelles", `Entreprise ${reportType} Bruxelles`, now, now, reportType);
}

async function context(db, { method = "GET", draftId = FREE_ID, body = null, authenticated = true } = {}) {
  const cookie = authenticated ? (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0] : "";
  return {
    request: new Request(`https://local.test/api/admin/audit-drafts/${draftId}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    params: { draftId },
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  };
}

test("un brouillon incomplet conserve son type, ses réponses versionnées et son étape", async () => {
  const db = new LocalD1();
  seed(db, FREE_ID, "free");
  const answers = {
    questionnaireVersion: "score-efficia-questionnaire-v3",
    photoPresence: "none",
    reviewsPresence: "none",
    locationMode: "hybrid",
    addressVerification: "exact",
    serviceAreaVerification: "partial",
    criteriaReview: [{ key: "nap", value: "not_verified" }],
    confirmedCompetitorIds: ["place-confirmed"],
    excludedCompetitorIds: ["place-excluded"],
    executionPlan: {
      description: { id: "description", text: "Texte de travail", status: "needs_confirmation" },
      reviewLink: "https://example.invalid/review",
      reviewLinkStatus: "not_applicable",
    },
  };
  const saved = await putDraft(await context(db, {
    method: "PUT",
    body: { analysisId: FREE_ID, reportType: "free", currentStep: "questionnaire", answers },
  }));
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.draft.draftId, FREE_ID);
  assert.equal(savedBody.draft.status, "draft");
  assert.equal(savedBody.draft.reportType, "free");
  assert.equal(savedBody.draft.currentStep, "questionnaire");
  assert.equal(savedBody.draft.answersVersion, "score-efficia-questionnaire-v3");
  assert.equal(savedBody.draft.answers.questionnaireVersion, "score-efficia-questionnaire-v3");
  assert.deepEqual(savedBody.draft.answers.criteriaReview, answers.criteriaReview);

  const restored = await getDraft(await context(db));
  assert.equal((await restored.json()).draft.answers.questionnaireVersion, "score-efficia-questionnaire-v3");
});

test("un brouillon restaure exactement une adresse non vérifiable", async () => {
  const db = new LocalD1();
  seed(db, FREE_ID, "free");
  const answers = {
    questionnaireVersion: "score-efficia-questionnaire-v4",
    locationMode: "storefront",
    addressVerification: "not_verifiable",
    serviceAreaVerification: "unknown",
    responses: { adresse: { points: 0, value: "not_verified", source: "manual" } },
  };
  const saved = await putDraft(await context(db, {
    method: "PUT",
    body: { analysisId: FREE_ID, reportType: "free", currentStep: "questionnaire", answers },
  }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).draft.answers.addressVerification, "not_verifiable");

  const restored = await getDraft(await context(db));
  const restoredAnswers = (await restored.json()).draft.answers;
  assert.equal(restoredAnswers.locationMode, "storefront");
  assert.equal(restoredAnswers.addressVerification, "not_verifiable");
  assert.equal(restoredAnswers.responses.adresse.points, 0);
});

test("les brouillons sont authentifiés, listés séparément et supprimables avec un identifiant opaque", async () => {
  const db = new LocalD1();
  seed(db, FREE_ID, "free");
  seed(db, PREMIUM_ID, "premium");
  const unauthorized = await getDraft(await context(db, { authenticated: false }));
  assert.equal(unauthorized.status, 401);

  for (const [analysisId, reportType] of [[FREE_ID, "free"], [PREMIUM_ID, "premium"]]) {
    const response = await putDraft(await context(db, {
      method: "PUT",
      draftId: analysisId,
      body: { analysisId, reportType, currentStep: "questionnaire", answers: { criteriaReview: [] } },
    }));
    assert.equal(response.status, 200);
  }

  const listContext = await context(db);
  listContext.request = new Request("https://local.test/api/admin/audit-drafts", { headers: listContext.request.headers });
  const listed = await listDrafts(listContext);
  const drafts = (await listed.json()).drafts;
  assert.equal(drafts.length, 2);
  assert.deepEqual(new Set(drafts.map((draft) => draft.reportType)), new Set(["free", "premium"]));

  const removed = await deleteDraft(await context(db, { method: "DELETE", draftId: FREE_ID }));
  assert.equal(removed.status, 200);
  assert.equal((await getDraft(await context(db))).status, 404);
});

test("le back-office propose Audits en cours, Reprendre et une suppression confirmée", () => {
  const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../js/admin.js", import.meta.url), "utf8");
  assert.match(html, /Audits en cours/);
  assert.match(script, />Reprendre</);
  assert.match(script, /window\.confirm\("Supprimer définitivement ce brouillon \?"\)/);
  assert.match(script, /free-diagnostic-production\?analysisId=/);
  assert.match(script, /audit-review\/\$\{encodeURIComponent\(draft\.analysisId\)\}/);
});

test("l’interface restaure les critères, concurrents et éléments opérationnels du brouillon", () => {
  const script = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");
  assert.match(script, /fillCriteriaFromAnalysis\(currentAnalysis, answers\)/);
  assert.match(script, /restoreCompetitorSelection\(answers\)/);
  assert.match(script, /restoreExecutionPlan\(answers\.executionPlan\)/);
  assert.match(script, /executionEditor\?\.addEventListener\("input", \(\) =>/);
  assert.match(script, /updateExecutionSummary\(\);\s*scheduleDraftSave\(\);/);
});

test("le parcours Premium après questionnaire est limité à deux clics obligatoires", async () => {
  const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
  const premiumRow = {
    analysis_id: PREMIUM_ID,
    report_type: "premium",
    status: "awaiting_review",
    nom: "Entreprise Test",
    ville: "Bruxelles",
    normalized_json: "{}",
    competitors_json: "[]",
  };
  const db = {
    prepare() {
      return { bind: () => ({ first: async () => premiumRow }) };
    },
  };
  const response = await getAuditReviewPage({
    request: new Request(`https://local.test/admin/audit-review/${PREMIUM_ID}`, { headers: { Cookie: cookie } }),
    params: { analysisId: PREMIUM_ID },
    env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
  });
  const html = await response.text();
  const script = readFileSync(new URL("../js/admin-audit-review.js", import.meta.url), "utf8");

  assert.match(html, />Tout confirmer et ouvrir l’aperçu<\/button>/);
  assert.match(html, /data-execution-ready-count/);
  assert.match(html, /data-execution-blocking-count/);
  assert.doesNotMatch(html, /Ouvrir l'ancien générateur gratuit/);
  assert.doesNotMatch(html, />Aperçu HTML<\/a>/);
  assert.doesNotMatch(html, />Approuver le rapport<\/button>/);
  assert.doesNotMatch(html, />Générer le PDF<\/a>/);
  assert.match(script, /<summary>Options avancées<\/summary>/);
  assert.doesNotMatch(script, /function confirmReadyExecutionItems\(/);
  assert.match(script, /async function saveReview[\s\S]*await saveDraft\(\{ manual: true \}\)[\s\S]*fetch\(`\/api\/admin\/audit-review\//);
  assert.match(script, /executionBlockersSignalesParServeur\(data\.blockers\)/);
  assert.match(script, /window\.location\.assign\(previewUrl\)/);
  assert.match(script, /scrollIntoView\?\.\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(script, /element\.querySelector\("textarea, input, select"\)/);
  assert.doesNotMatch(script, /window\.confirm\(/);
});

test("le serveur refuse de finaliser un questionnaire réellement incomplet pour les deux types d’audit", async () => {
  const db = new LocalD1();
  seed(db, FREE_ID, "free");
  seed(db, PREMIUM_ID, "premium");
  for (const [analysisId, reportType] of [[FREE_ID, "free"], [PREMIUM_ID, "premium"]]) {
    const cookie = (await createSessionCookie({ ADMIN_SESSION_SECRET: SECRET })).split(";")[0];
    const response = await patchAuditReview({
      request: new Request(`https://local.test/api/admin/audit-review/${analysisId}`, {
        method: "PATCH",
        headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://local.test" },
        body: JSON.stringify({
          action: "complete_review",
          reportType,
          photoPresence: "present",
          reviewsPresence: "present",
          criteriaReview: [],
        }),
      }),
      params: { analysisId },
      env: { ADMIN_SESSION_SECRET: SECRET, ORDERS_DB: db },
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "INCOMPLETE_QUESTIONNAIRE");
  }
});
