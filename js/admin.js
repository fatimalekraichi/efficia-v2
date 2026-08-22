const ordersBody = document.querySelector("[data-admin-orders]");
const diagnosticsBody = document.querySelector("[data-admin-diagnostics]");
const diagnosticCount = document.querySelector("[data-admin-diagnostic-count]");
const draftsBody = document.querySelector("[data-admin-drafts]");
const completedAuditsBody = document.querySelector("[data-admin-completed-audits]");
const filtersForm = document.querySelector("[data-admin-filters]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");
const statElements = document.querySelectorAll("[data-stat]");
const transferDialog = document.querySelector("[data-transfer-dialog]");
const transferCompany = document.querySelector("[data-transfer-company]");
const transferCity = document.querySelector("[data-transfer-city]");
const transferConfirm = document.querySelector("[data-transfer-confirm]");
const transferError = document.querySelector("[data-transfer-error]");
let pendingTransfer = null;

const statusLabels = {
  todo: "🟡 À faire",
  in_progress: "🟠 En cours",
  waiting: "🔵 En attente",
  audit_generated: "📄 Audit généré",
  pdf_generated: "📄 PDF généré",
  pdf_reviewed: "🔍 PDF vérifié",
  sent: "🟢 Audit envoyé",
  completed: "🟢 Terminé",
};

const offerLabels = {
  audit: "Audit",
  visibility: "Pack Visibilité",
  performance: "Pack Performance",
};

const diagnosticStatusLabels = {
  awaiting_review: "À traiter",
  in_progress: "En cours",
  completed: "Terminé",
};

const mailerLiteStatusLabels = {
  pending: "En attente",
  synced: "Synchronisé",
  failed: "Échec",
};

const reportTypeLabels = {
  free: "Diagnostic gratuit",
  premium: "Audit Premium 99 €",
};

const formatMoney = (amount, currency = "eur") => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: String(currency || "eur").toUpperCase(),
}).format(Number(amount || 0) / 100);

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  if (isToday) return `Aujourd'hui<br><span class="admin-muted">${time}</span>`;
  return `${new Intl.DateTimeFormat("fr-FR").format(date)}<br><span class="admin-muted">${time}</span>`;
};

const formatRelativeTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `Il y a ${diffDays} j`;
  const diffMonths = Math.floor(diffDays / 30);
  return `Il y a ${diffMonths} mois`;
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatCustomerName = (value) => {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts[0] === parts[0].toUpperCase() && parts[1] !== parts[1].toUpperCase()) {
    return `${parts[1]} ${parts[0]}`;
  }
  return parts.join(" ");
};

const cleanAdministrativeCity = (value) => {
  const city = String(value || "").trim();
  return ["", "non renseignée", "non renseignee", "inconnue", "unknown"].includes(city.toLocaleLowerCase("fr")) ? "" : city;
};

const redirectToLogin = () => {
  window.location.href = "/admin-login";
};

const setStats = (stats = {}) => {
  statElements.forEach((element) => {
    const key = element.getAttribute("data-stat");
    if (["totalRevenue", "revenueToday", "revenueMonth"].includes(key)) {
      element.textContent = formatMoney(stats.totalRevenue || 0);
      if (key === "revenueToday") element.textContent = formatMoney(stats.revenueToday || 0);
      if (key === "revenueMonth") element.textContent = formatMoney(stats.revenueMonth || 0);
      return;
    }
    element.textContent = String(stats[key] || 0);
  });
};

const buildGoogleBusinessUrl = (order) => {
  if (order.google_business_url) return order.google_business_url;
  const query = [order.company_name, order.city].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

const businessStateLabels = {
  audit: {
    todo: "🟡 Audit à faire",
    in_progress: "🔵 Audit en cours",
    waiting: "🔵 Audit en attente",
    audit_generated: "📄 Audit généré",
    pdf_generated: "📄 PDF généré",
    pdf_reviewed: "🔍 PDF vérifié",
    sent: "🟢 Audit envoyé",
    completed: "✔ Dossier terminé",
  },
  visibility: {
    todo: "🟡 Optimisation à faire",
    in_progress: "🔵 Optimisation en cours",
    waiting: "🔵 Validation attendue",
    audit_generated: "📄 Audit généré",
    pdf_generated: "📄 PDF généré",
    pdf_reviewed: "🔍 PDF vérifié",
    sent: "🟢 Audit envoyé",
    completed: "✔ Clos",
  },
  performance: {
    todo: "🟡 Pack Performance à faire",
    in_progress: "🔵 Pack en cours",
    waiting: "🔵 Validation attendue",
    audit_generated: "📄 Audit généré",
    pdf_generated: "📄 PDF généré",
    pdf_reviewed: "🔍 PDF vérifié",
    sent: "🟢 Audit envoyé",
    completed: "✔ Clos",
  },
};

const getBusinessState = (order) => (
  businessStateLabels[order.offer_code]?.[order.task_status || "todo"] || "🟡 À traiter"
);

const hasAuditEmailBeenMarkedSent = (order) => String(order.notes || "").includes("[audit_email_sent]");

const getFilterQuery = () => {
  const params = new URLSearchParams();
  const formData = new FormData(filtersForm);
  ["search", "status", "offer", "environment"].forEach((key) => {
    const value = String(formData.get(key) || "").trim();
    if (value) params.set(key, value);
  });
  params.set("limit", "50");
  return params.toString();
};

const renderOrders = (orders) => {
  if (!ordersBody) return;
  if (!orders.length) {
    ordersBody.innerHTML = `<tr><td colspan="11" class="admin-empty">Aucune commande trouvée.</td></tr>`;
    return;
  }

  ordersBody.innerHTML = orders.map((order) => `
    <tr class="admin-clickable-row ${order.task_status === "completed" ? "is-completed-row" : ""}" data-order-url="/admin-order?id=${encodeURIComponent(order.order_id)}">
      <td>
        <strong>${escapeHtml(order.company_name || "—")}</strong>
        <div class="admin-muted">${escapeHtml(order.email || "")}</div>
      </td>
      <td>${escapeHtml(order.city || "—")}</td>
      <td>${escapeHtml(formatCustomerName(order.customer_name) || "—")}</td>
      <td>${escapeHtml(offerLabels[order.offer_code] || order.offer_name || "—")}</td>
      <td>${formatMoney(order.amount_total, order.currency)}</td>
      <td>${formatDate(order.created_at)}</td>
      <td><span class="admin-muted">${escapeHtml(formatRelativeTime(order.created_at))}</span></td>
      <td><span class="admin-badge is-${escapeHtml(order.task_status || "todo")}">${escapeHtml(statusLabels[order.task_status] || "À faire")}</span></td>
      <td><span class="admin-badge is-business is-business-${escapeHtml(order.task_status || "todo")}">${escapeHtml(getBusinessState(order))}</span></td>
      <td><span class="admin-badge is-${escapeHtml(order.environment)}">${escapeHtml(String(order.environment || "unknown").toUpperCase())}</span></td>
      <td>
        <div class="admin-row-actions">
          <a class="admin-icon-button" href="/admin-order?id=${encodeURIComponent(order.order_id)}" title="Voir la commande" aria-label="Voir la commande">👁</a>
          <a class="admin-icon-button" href="${escapeHtml(buildGoogleBusinessUrl(order))}" target="_blank" rel="noopener" title="Ouvrir Google" aria-label="Ouvrir Google">🌍</a>
          <a class="admin-icon-button ${hasAuditEmailBeenMarkedSent(order) ? "is-mail-sent" : ""}" href="mailto:${escapeHtml(order.email || "")}" data-email-action="${escapeHtml(order.task_id || "")}" data-current-status="${escapeHtml(order.task_status || "todo")}" data-current-notes="${escapeHtml(order.notes || "")}" title="Envoyer audit" aria-label="Envoyer audit">✉️</a>
          <button class="admin-icon-button" type="button" data-quick-complete="${escapeHtml(order.task_id || "")}" title="Marquer terminé" aria-label="Marquer terminé" ${order.task_id ? "" : "disabled"}>✔</button>
        </div>
      </td>
    </tr>
  `).join("");
};

const buildFreeDiagnosticToolUrl = (analysisId) => (
  `/admin/free-diagnostic-production?analysisId=${encodeURIComponent(analysisId)}`
);

const renderDiagnostics = (diagnostics) => {
  if (!diagnosticsBody) return;
  if (!diagnostics.length) {
    diagnosticsBody.innerHTML = `<tr><td colspan="9" class="admin-empty">Aucun diagnostic gratuit à traiter.</td></tr>`;
    return;
  }

  diagnosticsBody.innerHTML = diagnostics.map((diagnostic) => `
    <tr>
      <td><strong>${escapeHtml(diagnostic.company || "—")}</strong></td>
      <td>${escapeHtml(diagnostic.city || "—")}</td>
      <td>${escapeHtml(diagnostic.firstName || "—")}</td>
      <td>${escapeHtml(diagnostic.email || "—")}</td>
      <td>${formatDate(diagnostic.submittedAt)}</td>
      <td><span class="admin-badge is-${escapeHtml(diagnostic.status || "awaiting_review")}">${escapeHtml(diagnosticStatusLabels[diagnostic.status] || diagnostic.status || "À traiter")}</span></td>
      <td><span class="admin-badge is-mailerlite-${escapeHtml(diagnostic.mailerLiteStatus || "pending")}">${escapeHtml(mailerLiteStatusLabels[diagnostic.mailerLiteStatus] || diagnostic.mailerLiteStatus || "En attente")}</span></td>
      <td>${escapeHtml(reportTypeLabels[diagnostic.reportType] || diagnostic.reportType || "—")}</td>
      <td>
        <a class="admin-button admin-diagnostic-action" href="${buildFreeDiagnosticToolUrl(diagnostic.analysisId)}">Ouvrir Score Efficia</a>
      </td>
    </tr>
  `).join("");
};

const draftResumeUrl = (draft) => draft.reportType === "free"
  ? `/admin/free-diagnostic-production?analysisId=${encodeURIComponent(draft.analysisId)}`
  : `/admin/audit-review/${encodeURIComponent(draft.analysisId)}`;

const completedAuditUrl = (audit) => audit.reportType === "free"
  ? `/admin/free-diagnostic-production?analysisId=${encodeURIComponent(audit.analysisId)}&readonly=1`
  : `/admin/audit-review/${encodeURIComponent(audit.analysisId)}?readonly=1`;

const renderDrafts = (drafts) => {
  if (!draftsBody) return;
  if (!drafts.length) {
    draftsBody.innerHTML = `<tr><td colspan="6" class="admin-empty">Aucun audit en cours.</td></tr>`;
    return;
  }
  draftsBody.innerHTML = drafts.map((draft) => `
    <tr>
      <td><strong>${escapeHtml(draft.company || "—")}</strong></td>
      <td>${escapeHtml(draft.city || "—")}</td>
      <td><span class="admin-badge is-audit-kind">${escapeHtml(draft.auditLabel || reportTypeLabels[draft.reportType] || draft.reportType)}</span></td>
      <td>${escapeHtml(draft.currentStep || "questionnaire")}</td>
      <td>${formatDate(draft.updatedAt)}</td>
      <td><div class="admin-row-actions">
        <a class="admin-button" href="${draftResumeUrl(draft)}">Reprendre</a>
        <button class="admin-button is-danger" type="button" data-delete-draft="${escapeHtml(draft.draftId)}">Supprimer</button>
      </div></td>
    </tr>
  `).join("");
};

const loadDrafts = async () => {
  if (!draftsBody) return;
  const response = await fetch("/api/admin/audit-drafts", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) return redirectToLogin();
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    draftsBody.innerHTML = `<tr><td colspan="6" class="admin-empty">Impossible de charger les brouillons.</td></tr>`;
    return;
  }
  renderDrafts(data.drafts || []);
};

const renderCompletedAudits = (audits) => {
  if (!completedAuditsBody) return;
  if (!audits.length) {
    completedAuditsBody.innerHTML = `<tr><td colspan="5" class="admin-empty">Aucun audit terminé.</td></tr>`;
    return;
  }
  completedAuditsBody.innerHTML = audits.map((audit) => `
    <tr>
      <td><strong>${escapeHtml(audit.company || "—")}</strong></td>
      <td>${escapeHtml(audit.city || "—")}</td>
      <td><span class="admin-badge is-audit-kind">${escapeHtml(audit.auditLabel || reportTypeLabels[audit.reportType] || audit.reportType)}</span></td>
      <td>${formatDate(audit.finalizedAt)}</td>
      <td><div class="admin-row-actions">
        <a class="admin-button" href="${completedAuditUrl(audit)}">Consulter</a>
        <button class="admin-button is-secondary" type="button" data-duplicate-audit="${escapeHtml(audit.analysisId)}">Dupliquer pour nouvelle version</button>
        ${audit.reportType === "free" && audit.answersVersion === "score-efficia-questionnaire-v4" ? `
          <button class="admin-button is-secondary" type="button"
            data-transfer-premium="${escapeHtml(audit.analysisId)}"
            data-transfer-company="${escapeHtml(audit.company || "—")}"
            data-transfer-city="${escapeHtml(cleanAdministrativeCity(audit.city))}">
            Créer un audit Premium à partir de ce diagnostic
          </button>` : ""}
      </div></td>
    </tr>
  `).join("");
};

const loadCompletedAudits = async () => {
  if (!completedAuditsBody) return;
  const response = await fetch("/api/admin/audit-snapshots", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) return redirectToLogin();
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    completedAuditsBody.innerHTML = `<tr><td colspan="5" class="admin-empty">Impossible de charger les audits terminés.</td></tr>`;
    return;
  }
  renderCompletedAudits(data.audits || []);
};

completedAuditsBody?.addEventListener("click", async (event) => {
  const transferButton = event.target.closest("[data-transfer-premium]");
  if (transferButton) {
    transferButton.dataset.idempotencyKey ||= crypto.randomUUID();
    pendingTransfer = {
      analysisId: transferButton.dataset.transferPremium,
      company: transferButton.dataset.transferCompany || "—",
      city: transferButton.dataset.transferCity || "",
      idempotencyKey: transferButton.dataset.idempotencyKey,
    };
    if (transferCompany) transferCompany.textContent = pendingTransfer.company;
    if (transferCity) transferCity.textContent = pendingTransfer.city || "Ville à renseigner";
    if (transferError) {
      transferError.hidden = true;
      transferError.textContent = "";
    }
    transferConfirm.disabled = false;
    transferDialog?.showModal();
    return;
  }
  const button = event.target.closest("[data-duplicate-audit]");
  if (!button || button.disabled) return;
  button.disabled = true;
  button.dataset.idempotencyKey ||= crypto.randomUUID();
  const response = await fetch(`/api/admin/audit-snapshots/${encodeURIComponent(button.dataset.duplicateAudit)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "duplicate", idempotencyKey: button.dataset.idempotencyKey }),
  });
  if (response.status === 401) return redirectToLogin();
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    button.disabled = false;
    return;
  }
  window.location.href = draftResumeUrl(data.duplicate);
});

transferConfirm?.addEventListener("click", async () => {
  if (!pendingTransfer || transferConfirm.disabled) return;
  transferConfirm.disabled = true;
  const originalLabel = transferConfirm.textContent;
  transferConfirm.textContent = "Création en cours…";
  try {
    const response = await fetch("/api/admin/audit-premium-transfers", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        operation: "create_premium_from_free",
        sourceAnalysisId: pendingTransfer.analysisId,
        idempotencyKey: pendingTransfer.idempotencyKey,
        referenceCity: pendingTransfer.city,
      }),
    });
    if (response.status === 401) return redirectToLogin();
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success || !data.transfer?.analysisId) {
      const reference = data.reference ? ` Référence : ${data.reference}.` : "";
      throw new Error(`Le transfert n’a pas pu être créé.${reference}`);
    }
    window.location.href = data.links?.review || `/admin/audit-review/${encodeURIComponent(data.transfer.analysisId)}`;
  } catch (error) {
    if (transferError) {
      transferError.textContent = error.message || "Le transfert n’a pas pu être créé.";
      transferError.hidden = false;
    }
    transferConfirm.disabled = false;
    transferConfirm.textContent = originalLabel;
  }
});

draftsBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-draft]");
  if (!button || !window.confirm("Supprimer définitivement ce brouillon ?")) return;
  button.disabled = true;
  const response = await fetch(`/api/admin/audit-drafts/${encodeURIComponent(button.dataset.deleteDraft)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) return redirectToLogin();
  await loadDrafts();
});

const markTaskCompleted = async (taskId) => {
  if (!taskId) return;
  const response = await fetch(`/admin/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ status: "completed" }),
  });

  if (response.status === 401) {
    redirectToLogin();
    return;
  }

  if (response.ok) loadOrders();
};

const markEmailSent = async ({ taskId, currentStatus, currentNotes }) => {
  if (!taskId || String(currentNotes || "").includes("[audit_email_sent]")) return;
  const stamp = new Date().toISOString();
  const notes = `${String(currentNotes || "").trim()}${currentNotes ? "\n" : ""}[audit_email_sent] Audit ouvert pour envoi le ${stamp}`;

  await fetch(`/admin/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      status: currentStatus || "todo",
      notes,
    }),
  }).catch(() => {});
};

const loadOrders = async () => {
  if (!ordersBody) return;
  ordersBody.innerHTML = `<tr><td colspan="11" class="admin-empty">Chargement...</td></tr>`;

  const query = getFilterQuery();
  const response = await fetch(`/admin/orders?${query}`, {
    headers: { "Accept": "application/json" },
  });

  if (response.status === 401) {
    redirectToLogin();
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    ordersBody.innerHTML = `<tr><td colspan="11" class="admin-empty">Impossible de charger les commandes.</td></tr>`;
    return;
  }

  setStats(data.stats);
  renderOrders(data.orders || []);
};

const loadDiagnostics = async () => {
  if (!diagnosticsBody) return;
  diagnosticsBody.innerHTML = `<tr><td colspan="9" class="admin-empty">Chargement...</td></tr>`;

  const response = await fetch("/api/admin/diagnostic-requests?limit=50", {
    credentials: "same-origin",
    headers: { "Accept": "application/json" },
  });

  if (response.status === 401) {
    redirectToLogin();
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    if (diagnosticCount) diagnosticCount.textContent = "—";
    diagnosticsBody.innerHTML = `<tr><td colspan="9" class="admin-empty">Impossible de charger les diagnostics gratuits.</td></tr>`;
    return;
  }

  if (diagnosticCount) diagnosticCount.textContent = String(data.pendingCount || 0);
  renderDiagnostics(data.diagnostics || []);
};

const logout = async () => {
  await fetch("/admin/logout", {
    method: "POST",
    headers: { "Accept": "application/json" },
  }).catch(() => {});
  redirectToLogin();
};

filtersForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadOrders();
});

logoutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});

ordersBody?.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("a, button");
  if (actionTarget) {
    const taskId = actionTarget.getAttribute("data-quick-complete");
    if (taskId) {
      event.preventDefault();
      markTaskCompleted(taskId);
    }
    const emailTaskId = actionTarget.getAttribute("data-email-action");
    if (emailTaskId) {
      markEmailSent({
        taskId: emailTaskId,
        currentStatus: actionTarget.getAttribute("data-current-status") || "todo",
        currentNotes: actionTarget.getAttribute("data-current-notes") || "",
      });
      actionTarget.classList.add("is-mail-sent");
    }
    return;
  }

  const row = event.target.closest("[data-order-url]");
  if (row) window.location.href = row.getAttribute("data-order-url");
});

loadOrders();
loadDiagnostics();
loadDrafts();
loadCompletedAudits();
