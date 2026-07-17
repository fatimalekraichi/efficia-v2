const ordersBody = document.querySelector("[data-admin-orders]");
const filtersForm = document.querySelector("[data-admin-filters]");
const logoutButtons = document.querySelectorAll("[data-admin-logout]");
const statElements = document.querySelectorAll("[data-stat]");

const statusLabels = {
  todo: "🟡 À faire",
  in_progress: "🟠 En cours",
  waiting: "🔵 En attente",
  completed: "🟢 Terminé",
};

const offerLabels = {
  audit: "Audit",
  visibility: "Pack Visibilité",
  performance: "Pack Performance",
};

const formatMoney = (amount, currency = "eur") => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: String(currency || "eur").toUpperCase(),
}).format(Number(amount || 0) / 100);

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
    in_progress: "🟠 Audit commencé",
    waiting: "🔵 Audit en attente",
    completed: "🟢 Audit envoyé",
  },
  visibility: {
    todo: "🟡 Optimisation à faire",
    in_progress: "🟠 Optimisation commencée",
    waiting: "🔵 Validation attendue",
    completed: "✔ Clos",
  },
  performance: {
    todo: "🟡 Pack Performance à faire",
    in_progress: "🟠 Pack commencé",
    waiting: "🔵 Validation attendue",
    completed: "✔ Clos",
  },
};

const getBusinessState = (order) => (
  businessStateLabels[order.offer_code]?.[order.task_status || "todo"] || "🟡 À traiter"
);

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
    <tr class="admin-clickable-row" data-order-url="/admin-order?id=${encodeURIComponent(order.order_id)}">
      <td>
        <strong>${escapeHtml(order.company_name || "—")}</strong>
        <div class="admin-muted">${escapeHtml(order.email || "")}</div>
      </td>
      <td>${escapeHtml(order.city || "—")}</td>
      <td>${escapeHtml(order.customer_name || "—")}</td>
      <td>${escapeHtml(offerLabels[order.offer_code] || order.offer_name || "—")}</td>
      <td>${formatMoney(order.amount_total, order.currency)}</td>
      <td>${formatDate(order.created_at)}</td>
      <td><span class="admin-muted">${escapeHtml(formatRelativeTime(order.created_at))}</span></td>
      <td><span class="admin-badge is-${escapeHtml(order.task_status || "todo")}">${escapeHtml(statusLabels[order.task_status] || "À faire")}</span></td>
      <td><span class="admin-badge is-business">${escapeHtml(getBusinessState(order))}</span></td>
      <td><span class="admin-badge is-${escapeHtml(order.environment)}">${escapeHtml(String(order.environment || "unknown").toUpperCase())}</span></td>
      <td>
        <div class="admin-row-actions">
          <a class="admin-icon-button" href="/admin-order?id=${encodeURIComponent(order.order_id)}" title="Voir la commande" aria-label="Voir la commande">👁</a>
          <a class="admin-icon-button" href="${escapeHtml(buildGoogleBusinessUrl(order))}" target="_blank" rel="noopener" title="Ouvrir Google" aria-label="Ouvrir Google">🌍</a>
          <a class="admin-icon-button" href="mailto:${escapeHtml(order.email || "")}" title="Envoyer audit" aria-label="Envoyer audit">📧</a>
          <button class="admin-icon-button" type="button" data-quick-complete="${escapeHtml(order.task_id || "")}" title="Marquer terminé" aria-label="Marquer terminé" ${order.task_id ? "" : "disabled"}>✔</button>
        </div>
      </td>
    </tr>
  `).join("");
};

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
    return;
  }

  const row = event.target.closest("[data-order-url]");
  if (row) window.location.href = row.getAttribute("data-order-url");
});

loadOrders();
