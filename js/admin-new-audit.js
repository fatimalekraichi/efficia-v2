const form = document.querySelector("[data-admin-audit-form]");
const submitButton = document.querySelector("[data-admin-audit-submit]");
const errorBox = document.querySelector("[data-admin-audit-error]");
const progressCard = document.querySelector("[data-admin-audit-progress]");
const resultCard = document.querySelector("[data-admin-audit-result]");
const resultInfo = document.querySelector("[data-admin-audit-result-info]");
const reportLink = document.querySelector("[data-admin-audit-report]");
const dataLink = document.querySelector("[data-admin-audit-data]");
const orderLink = document.querySelector("[data-admin-audit-order]");
const resetButton = document.querySelector("[data-admin-audit-reset]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");
const orderContext = document.querySelector("[data-order-context]");
const orderContextTitle = document.querySelector("[data-order-context-title]");
const orderContextInfo = document.querySelector("[data-order-context-info]");

let isSubmitting = false;
let linkedOrder = null;
let linkedTask = null;

const STAGES = ["observation", "benchmark", "knowledge", "reasoning", "composer"];
const STAGE_LABELS = {
  observation: "Observation",
  benchmark: "Benchmark",
  knowledge: "Knowledge",
  reasoning: "Reasoning",
  composer: "Composer",
};
const REPORT_TYPE_LABELS = {
  free: "Diagnostic gratuit",
  premium: "Audit Premium 99 €",
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setError(message = "") {
  if (errorBox) errorBox.textContent = message;
}

function redirectToLogin() {
  window.location.href = "/admin-login";
}

function isValidGoogleUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    const host = parsed.hostname.toLowerCase();
    return ["http:", "https:"].includes(parsed.protocol)
      && (host.includes("google.") || host === "maps.app.goo.gl" || host.endsWith(".maps.app.goo.gl"));
  } catch {
    return false;
  }
}

function stageElement(stage) {
  return document.querySelector(`[data-pipeline-stage="${stage}"]`);
}

function setStage(stage, state, label) {
  const item = stageElement(stage);
  if (!item) return;
  item.classList.remove("is-pending", "is-running", "is-ok", "is-failed");
  item.classList.add(`is-${state}`);
  const status = item.querySelector("strong");
  if (status) status.textContent = label;
}

function resetProgress() {
  STAGES.forEach((stage) => setStage(stage, "pending", "En attente"));
}

function applyStages(stages = {}) {
  STAGES.forEach((stage) => {
    if (stages[stage] === "ok") setStage(stage, "ok", "Terminé");
    else if (stages[stage] === "failed") setStage(stage, "failed", "Erreur");
    else setStage(stage, "pending", "En attente");
  });
}

function markPipelineRunning() {
  progressCard.hidden = false;
  resultCard.hidden = true;
  resetProgress();
  setStage("observation", "running", "En cours");
}

function collectPayload() {
  const data = new FormData(form);
  return {
    orderId: linkedOrder?.order_id || new URLSearchParams(window.location.search).get("orderId") || "",
    taskId: linkedTask?.task_id || "",
    reportType: String(data.get("reportType") || "premium").trim(),
    googleBusinessUrl: String(data.get("googleBusinessUrl") || "").trim(),
    companyName: String(data.get("companyName") || "").trim(),
    city: String(data.get("city") || "").trim(),
    email: String(data.get("email") || "").trim(),
    internalNotes: String(data.get("internalNotes") || "").trim(),
  };
}

function setReportType(value) {
  const reportType = REPORT_TYPE_LABELS[value] ? value : "premium";
  const field = form?.querySelector(`input[name="reportType"][value="${reportType}"]`);
  if (field) field.checked = true;
}

function inferReportTypeFromOrder(order = {}) {
  const raw = `${order.offer_code || ""} ${order.offer_name || ""}`.toLowerCase();
  if (raw.includes("diagnostic") || raw.includes("gratuit") || raw.includes("free")) return "free";
  return "premium";
}

function fillIfEmpty(name, value) {
  const field = form?.elements?.[name];
  if (!field || field.value || !value) return;
  field.value = value;
}

function renderOrderContext({ order, task }) {
  if (!orderContext || !orderContextInfo) return;
  const customerName = order.customer_name || [order.first_name, order.email].filter(Boolean).join(" ");
  const rows = [
    ["Client", customerName],
    ["Entreprise", order.company_name],
    ["Offre", order.offer_name],
    ["Type de rapport", REPORT_TYPE_LABELS[inferReportTypeFromOrder(order)]],
    ["Ville", order.city],
    ["Email", order.email],
    ["Order ID", order.order_id],
  ];

  if (orderContextTitle) orderContextTitle.textContent = order.offer_name || "Commande liée";
  orderContextInfo.innerHTML = rows.map(([label, value]) => `
    <div class="admin-info-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "—")}</strong>
    </div>
  `).join("");
  orderContext.hidden = false;

  if (task?.notes) fillIfEmpty("internalNotes", task.notes);
}

async function loadOrderFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId");
  if (!orderId) return;

  setError("");
  const response = await fetch(`/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { "Accept": "application/json" },
    credentials: "same-origin",
  });

  if (response.status === 401) {
    redirectToLogin();
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    setError(response.status === 404 ? "Commande introuvable." : "Impossible de charger cette commande.");
    return;
  }

  linkedOrder = data.order || null;
  linkedTask = data.tasks?.[0] || null;
  if (!linkedOrder) return;

  renderOrderContext({ order: linkedOrder, task: linkedTask });
  setReportType(inferReportTypeFromOrder(linkedOrder));
  fillIfEmpty("googleBusinessUrl", linkedOrder.google_business_url);
  fillIfEmpty("companyName", linkedOrder.company_name);
  fillIfEmpty("city", linkedOrder.city);
  fillIfEmpty("email", linkedOrder.email);
}

function prefillFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reportType")) setReportType(params.get("reportType"));
  fillIfEmpty("googleBusinessUrl", params.get("googleBusinessUrl"));
  fillIfEmpty("companyName", params.get("companyName") || params.get("company"));
  fillIfEmpty("city", params.get("city"));
  fillIfEmpty("email", params.get("email"));

  const context = [
    params.get("offer") ? `Offre : ${params.get("offer")}` : "",
    params.get("orderId") ? `Order ID : ${params.get("orderId")}` : "",
    params.get("taskId") ? `Task ID : ${params.get("taskId")}` : "",
    params.get("firstName") ? `Contact : ${params.get("firstName")}` : "",
  ].filter(Boolean).join("\n");
  fillIfEmpty("internalNotes", context);
}

function validatePayload(payload) {
  if (!REPORT_TYPE_LABELS[payload.reportType]) return "Choisissez Diagnostic gratuit ou Audit Premium.";
  if (!payload.googleBusinessUrl) return "Renseignez l’URL Google Maps ou Google Business.";
  if (!isValidGoogleUrl(payload.googleBusinessUrl)) return "L’URL doit être une adresse Google Maps ou Google Business valide.";
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return "L’adresse e-mail n’est pas valide.";
  return "";
}

function renderResult(data) {
  const analysis = data.analysis || {};
  resultInfo.innerHTML = [
    ["Entreprise", analysis.businessName || "—"],
    ["Ville", analysis.city || "—"],
    ["Type de rapport", REPORT_TYPE_LABELS[data.reportType || analysis.reportType] || "Audit Premium 99 €"],
    ["Score", analysis.score === null || analysis.score === undefined ? "—" : `${analysis.score}/100`],
    ["Statut", analysis.status || data.status || "—"],
    ["Analysis ID", data.analysisId || "—"],
  ].map(([label, value]) => `
    <div class="admin-info-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  reportLink.href = data.links?.review || data.links?.report || `/admin/audit-review/${encodeURIComponent(data.analysisId || "")}`;
  dataLink.href = data.links?.data || `/api/analysis/${encodeURIComponent(data.analysisId || "")}`;
  if (orderLink) {
    const href = data.links?.order || (linkedOrder?.order_id ? `/admin-order?id=${encodeURIComponent(linkedOrder.order_id)}` : "");
    orderLink.href = href || "#";
    orderLink.hidden = !href;
  }
  resultCard.hidden = false;
}

async function submitAudit(event) {
  event.preventDefault();
  if (isSubmitting) return;

  const payload = collectPayload();
  const validationMessage = validatePayload(payload);
  if (validationMessage) {
    setError(validationMessage);
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "Génération en cours...";
  setError("");
  markPipelineRunning();

  try {
    const response = await fetch("/api/admin/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      redirectToLogin();
      return;
    }

    if (!response.ok || !data.success) {
      applyStages(data.stages || {});
      if (data.stage) setStage(data.stage, "failed", "Erreur");
      console.error("admin-new-audit:generation-error", {
        status: response.status,
        error: data.error || null,
        stage: data.stage || null,
        message: data.message || null,
      });
      throw new Error(data.message || "Une erreur est survenue pendant la génération.");
    }

    applyStages(data.stages || {});
    renderResult(data);
  } catch (error) {
    setError(error.message || "Une erreur est survenue. Merci de réessayer dans quelques instants.");
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Générer l’audit";
  }
}

form?.addEventListener("submit", submitAudit);
prefillFromUrl();
loadOrderFromQuery();

resetButton?.addEventListener("click", () => {
  resultCard.hidden = true;
  progressCard.hidden = true;
  resetProgress();
  setError("");
  form?.querySelector("input[name='googleBusinessUrl']")?.focus();
});

logoutButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await fetch("/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
    redirectToLogin();
  });
});
