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

function dbForManualPremium(initialRow = row()) {
  let current = initialRow;
  let updateCount = 0;
  return {
    get updateCount() { return updateCount; },
    prepare(sql) {
      return {
        bind: (...params) => ({
          async first() {
            if (sql.includes("JOIN orders") || sql.includes("FROM order_tasks")) return null;
            if (sql.includes("audit_creation_metadata")) {
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
          async run() {
            if (sql.includes("SET status = 'approved'")) {
              updateCount += 1;
              current = { ...current, status: "approved", approved_at: params[0] };
            }
            return { success: true, meta: { changes: 1 } };
          },
        }),
      };
    },
  };
}

test("un Premium manuel complet est approuvé sans commande payée", async () => {
  const db = dbForManualPremium();
  const response = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "approved");
  assert.equal(db.updateCount, 1);
});

test("un second clic d’approbation est idempotent", async () => {
  const db = dbForManualPremium(row({ status: "approved", approved_at: "2026-08-23T10:00:00.000Z" }));
  const response = await __test__.approveAnalysis(db, ANALYSIS_ID);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.idempotent, true);
  assert.equal(db.updateCount, 0);
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
