const PREMIUM_LABEL = "Audit Efficia Premium";

export function resolveReportCommercialPolicy(reportType, authorizationType = null) {
  if (reportType === "free") {
    return {
      reportKind: "free",
      billingKind: "not_applicable",
      canMentionPaidAuditDeduction: false,
    };
  }

  return {
    reportKind: "premium",
    billingKind: authorizationType === "paid" ? "paid" : "manual_unpaid",
    canMentionPaidAuditDeduction: authorizationType === "paid",
  };
}

export function applyReportCommercialPolicy(documentModel = {}, policy) {
  if (!policy || policy.reportKind === "free") return documentModel;
  return {
    ...documentModel,
    reportType: "premium",
    commercialPolicy: policy,
    vocabulary: {
      ...(documentModel.vocabulary || {}),
      reportLabel: PREMIUM_LABEL,
      eyebrow: "Audit Google Business",
    },
  };
}
