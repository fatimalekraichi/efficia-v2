import test from "node:test";
import assert from "node:assert/strict";

import { createSessionCookie } from "../functions/admin/_shared.js";
import { __test__, onRequestPatch } from "../functions/api/admin/audit-review/[analysisId].js";
import { GRILLE } from "../functions/lib/score-efficia/criteriaCatalog.js";

const ANALYSIS_ID = "analysis-manual-premium-1";
const ADMIN_SECRET = "admin-secret";
const ADMIN_COOKIE = (await createSessionCookie({ ADMIN_SESSION_SECRET: ADMIN_SECRET })).split(";")[0];

function completeManualReview() {
  return {
    questionnaireVersion: "score-efficia-questionnaire-v4",
    reportType: "premium",
    photoPresence: "present",
    reviewsPresence: "present",
    locationMode: "storefront",
    addressVerification: "exact",
    criteriaReview: GRILLE.flatMap((category) => category.criteres.map((criterion) => ({
      key: criterion.key,
      question: criterion.q,
      value: "compliant",
    }))),
    executionPlan: {
      description: { status: "not_applicable" },
      reviewLinkStatus: "not_applicable",
      reviewMessages: {
        sms: { status: "not_applicable" },
        email: { status: "not_applicable" },
        oral: { status: "not_applicable" },
      },
    },
  };
}

function row(overrides = {}) {
  return {
    analysis_id: ANALYSIS_ID,
    status: "preview_ready",
    report_type: "premium",
    nom: "Entreprise Fictive",
    ville: "Arlon",
    activity: "Électricien",
    normalized_json: JSON.stringify({ category: "Électricien" }),
    competitors_json: "[]",
    manual_review_json: JSON.stringify(completeManualReview()),
    document_model_json: JSON.stringify({
      reportType: "premium",
      hero: { businessName: "Entreprise Fictive", city: "Arlon", category: "Électricien" },
      priorities: [], strengths: [], weaknesses: [], opportunities: [], actionPlan: [],
    }),
    ...overrides,
  };
}

function snapshotRow() {
  return {
    snapshot_id: "snapshot-manual-premium-1",
    analysis_id: ANALYSIS_ID,
    source_draft_id: ANALYSIS_ID,
    report_type: "premium",
    answers_version: "score-efficia-questionnaire-v4",
    answers_json: JSON.stringify(completeManualReview()),
    current_step: "questionnaire",
    pdf_filename: null,
    finalized_at: "2026-08-23T10:00:00.000Z",
  };
}

function dbForManualPremium(initialRow = row(), { existingSnapshot = null, paid = false, draftAvailable = true } = {}) {
  let current = initialRow;
  let updateCount = 0;
  let snapshot = existingSnapshot;
  let snapshotInsertCount = 0;
  const draft = {
    draft_id: ANALYSIS_ID,
    analysis_id: ANALYSIS_ID,
    report_type: "premium",
    answers_version: "score-efficia-questionnaire-v4",
    answers_json: JSON.stringify(completeManualReview()),
    current_step: "questionnaire",
  };
  const execute = (sql, params) => {
    if (sql.includes("INSERT OR IGNORE INTO audit_questionnaire_snapshots")) {
      if (snapshot) return { success: true, meta: { changes: 0 } };
      snapshot = {
        snapshot_id: params[0], analysis_id: params[1], source_draft_id: params[2],
        report_type: params[3], answers_version: params[4], answers_json: params[5],
        current_step: params[6], pdf_filename: params[7], finalized_at: params[8],
      };
      snapshotInsertCount += 1;
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes("approved_at = COALESCE")) {
      updateCount += 1;
      current = { ...current, status: current.status === "pdf_generated" ? current.status : "approved", approved_at: current.approved_at || params[0] };
    } else if (sql.includes("SET status = 'approved'")) {
      updateCount += 1;
      current = { ...current, status: "approved", approved_at: params[0] };
    }
    return { success: true, meta: { changes: 1 } };
  };
  return {
    get updateCount() { return updateCount; },
    get snapshotCount() { return snapshot ? 1 : 0; },
    get snapshotInsertCount() { return snapshotInsertCount; },
    prepare(sql) {
      return {
        bind: (...params) => ({
          async first() {
            if (sql.includes("FROM audit_questionnaire_snapshots")) return snapshot;
            if (sql.includes("FROM audit_drafts")) return draftAvailable ? draft : null;
            if (sql.includes("FROM analyses a") && sql.includes("JOIN orders")) {
              return paid ? { order_id: "paid-order", status: "paid", offer_code: "audit", has_authorized_item: 0 } : null;
            }
            if (sql.includes("FROM order_tasks")) return null;
            if (sql.includes("audit_creation_metadata")) {
              if (paid) return null;
              return {
                analysis_id: ANALYSIS_ID,
                creation_source: "admin_manual",
                audit_type: "premium",
                billing_status: "manual_unpaid",
                request_status: "completed",
              };
            }
            return current;
          },
          async run() { return execute(sql, params); },
          _run() { return execute(sql, params); },
        }),
      };
    },
    async batch(statements) {
      return statements.map((statement) => statement._run());
    },
  };
}

test("un Premium manuel complet est approuvé sans commande payée", async () => {
  const db = dbForManualPremium();
  const response = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "approved");
  assert.equal(body.completed, true);
  assert.equal(body.snapshotCreated, true);
  assert.equal(db.updateCount, 1);
  assert.equal(db.snapshotCount, 1);
  assert.equal(db.snapshotInsertCount, 1);
});

test("un Premium payé est terminé avec le même snapshot sans changer la commande", async () => {
  const db = dbForManualPremium(row({ order_id: "paid-order" }), { paid: true });
  const response = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "approved");
  assert.equal(body.completed, true);
  assert.equal(body.snapshotCreated, true);
  assert.equal(db.snapshotCount, 1);
  assert.equal(db.snapshotInsertCount, 1);
});

test("un second clic d’approbation est idempotent", async () => {
  const db = dbForManualPremium(
    row({ status: "approved", approved_at: "2026-08-23T10:00:00.000Z" }),
    { existingSnapshot: snapshotRow() },
  );
  const response = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.idempotent, true);
  assert.equal(db.updateCount, 0);
  assert.equal(db.snapshotCount, 1);
  assert.equal(db.snapshotInsertCount, 0);
});

test("un ancien Premium approuvé sans snapshot est récupéré une seule fois depuis son brouillon", async () => {
  const db = dbForManualPremium(row({ status: "approved", approved_at: "2026-08-23T10:00:00.000Z" }));
  const first = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const second = await __test__.approveAnalysis(db, ANALYSIS_ID);

  assert.equal(first.status, 200);
  assert.equal((await first.json()).snapshotCreated, true);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).snapshotCreated, false);
  assert.equal(db.snapshotCount, 1);
  assert.equal(db.snapshotInsertCount, 1);
});

test("l’approbation Premium échoue sans brouillon au lieu de créer un état terminé incomplet", async () => {
  const db = dbForManualPremium(row(), { draftAvailable: false });
  const response = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "QUESTIONNAIRE_SNAPSHOT_UNAVAILABLE");
  assert.equal(db.updateCount, 0);
  assert.equal(db.snapshotCount, 0);
});

test("l’approbation administrative refuse une mutation sans Same-Origin", async () => {
  const response = await onRequestPatch({
    request: new Request(`http://local.test/api/admin/audit-review/${ANALYSIS_ID}`, {
      method: "PATCH",
      headers: { Cookie: ADMIN_COOKIE, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, error: "CROSS_ORIGIN_REQUEST" });
});

test("la confirmation globale refuse un analysisId différent avant toute écriture", async () => {
  const response = await onRequestPatch({
    request: new Request(`https://local.test/api/admin/audit-review/${ANALYSIS_ID}`, {
      method: "PATCH",
      headers: { Cookie: ADMIN_COOKIE, "Content-Type": "application/json", Origin: "https://local.test" },
      body: JSON.stringify({
        ...completeManualReview(),
        action: "complete_review",
        confirmAll: true,
        analysisId: "analysis-forged",
      }),
    }),
    params: { analysisId: ANALYSIS_ID },
    env: { ADMIN_SESSION_SECRET: ADMIN_SECRET },
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { success: false, error: "ANALYSIS_ID_MISMATCH" });
});

test("la confirmation globale bloque un contenu obligatoire vide sans lancer le pipeline", async () => {
  const db = dbForManualPremium();
  let pipelineCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    pipelineCalls += 1;
    return Response.json({ success: true });
  };
  try {
    const response = await __test__.saveManualReview({
      context: {
        request: new Request(`https://local.test/api/admin/audit-review/${ANALYSIS_ID}`),
        env: { CONNECTOR_TOKEN: "test-token" },
      },
      db,
      analysisId: ANALYSIS_ID,
      payload: {
        ...completeManualReview(),
        confirmAll: true,
        executionPlan: {
          ...completeManualReview().executionPlan,
          description: { text: "", status: "needs_confirmation" },
        },
      },
    });
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, "EXECUTION_PLAN_CONFIRMATION_REQUIRED");
    assert.deepEqual(body.missing, ["Description proposée"]);
    assert.equal(pipelineCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la confirmation globale prépare l’aperçu après avoir approuvé les contenus prêts", async () => {
  const db = dbForManualPremium();
  let pipelineCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    pipelineCalls += 1;
    return Response.json({ success: true });
  };
  try {
    const response = await __test__.saveManualReview({
      context: {
        request: new Request(`https://local.test/api/admin/audit-review/${ANALYSIS_ID}`),
        env: { CONNECTOR_TOKEN: "test-token" },
      },
      db,
      analysisId: ANALYSIS_ID,
      payload: {
        ...completeManualReview(),
        confirmAll: true,
        executionPlan: {
          ...completeManualReview().executionPlan,
          description: { text: "Description complète", status: "needs_confirmation" },
        },
      },
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.confirmedContentCount, 1);
    assert.equal(body.links.preview, `/api/render/${ANALYSIS_ID}`);
    assert.equal(pipelineCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
