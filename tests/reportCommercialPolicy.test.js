import test from "node:test";
import assert from "node:assert/strict";

import {
  applyReportCommercialPolicy,
  resolveReportCommercialPolicy,
} from "../functions/lib/reportCommercialPolicy.js";

test("la politique commerciale est déterministe pour Gratuit, Premium payé et Premium manuel", () => {
  assert.deepEqual(resolveReportCommercialPolicy("free"), {
    reportKind: "free",
    billingKind: "not_applicable",
    canMentionPaidAuditDeduction: false,
  });
  assert.deepEqual(resolveReportCommercialPolicy("premium", "paid"), {
    reportKind: "premium",
    billingKind: "paid",
    canMentionPaidAuditDeduction: true,
  });
  assert.deepEqual(resolveReportCommercialPolicy("premium", "admin_manual"), {
    reportKind: "premium",
    billingKind: "manual_unpaid",
    canMentionPaidAuditDeduction: false,
  });
});

test("la politique Premium impose le type et le libellé serveur", () => {
  const model = applyReportCommercialPolicy({
    reportType: "free",
    vocabulary: { reportLabel: "Diagnostic forgé" },
  }, resolveReportCommercialPolicy("premium", "admin_manual"));

  assert.equal(model.reportType, "premium");
  assert.equal(model.vocabulary.reportLabel, "Audit Efficia Premium");
  assert.equal(model.vocabulary.eyebrow, "Audit Google Business");
  assert.equal(model.commercialPolicy.canMentionPaidAuditDeduction, false);
});
