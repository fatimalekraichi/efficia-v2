const logoutButtons = document.querySelectorAll("[data-admin-logout]");
const orderTitle = document.querySelector("[data-order-title]");
const orderSubtitle = document.querySelector("[data-order-subtitle]");
const orderInfo = document.querySelector("[data-order-info]");
const taskInfo = document.querySelector("[data-task-info]");
const taskNotes = document.querySelector("[data-task-notes]");
const productionInfo = document.querySelector("[data-production-info]");
const openScoreToolButton = document.querySelector("[data-open-score-tool]");
const productionButtons = document.querySelectorAll("[data-production-status]");
const errorBox = document.querySelector("[data-order-error]");
const taskButtons = document.querySelectorAll("[data-task-status]");
const saveNotesButton = document.querySelector("[data-save-notes]");

const statusLabels = {
  todo: "Audit à faire",
  in_progress: "Audit en cours",
  waiting: "En attente",
  pdf_generated: "PDF généré",
  pdf_reviewed: "PDF vérifié",
  sent: "Audit envoyé",
  completed: "Dossier terminé",
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

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const redirectToLogin = () => {
  window.location.href = "/admin-login";
};

const setError = (message) => {
  if (errorBox) errorBox.textContent = message;
};

const infoItem = (label, value) => `
  <div class="admin-info-item">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value || "—")}</strong>
  </div>
`;

const buildGoogleBusinessUrl = (order) => {
  if (order.google_business_url) return order.google_business_url;
  const query = [order.company_name, order.city].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

const getFirstName = (order) => {
  if (order.first_name) return order.first_name;
  const parts = String(order.customer_name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 2 && parts[0] === parts[0].toUpperCase() && parts[1] !== parts[1].toUpperCase()) {
    return parts[1];
  }
  return parts[0];
};

const buildScoreToolUrl = (order, task) => {
  const params = new URLSearchParams({
    company: order.company_name || "",
    city: order.city || "",
    firstName: getFirstName(order),
    email: order.email || "",
    offer: order.offer_code || "",
    orderId: order.order_id || "",
    taskId: task?.task_id || "",
    googleBusinessUrl: order.google_business_url || "",
  });
  return `/outil-score-efficia-auto-v5.html?${params.toString()}`;
};

let currentTask = null;
let currentOrder = null;

const renderOrder = ({ order, tasks }) => {
  currentOrder = order;
  currentTask = tasks?.[0] || null;

  if (orderTitle) orderTitle.textContent = order.company_name || "Commande";
  if (orderSubtitle) {
    orderSubtitle.textContent = `${order.offer_name || "Offre"} · ${formatMoney(order.amount_total, order.currency)} · ${formatDate(order.created_at)}`;
  }

  if (orderInfo) {
    orderInfo.innerHTML = [
      infoItem("Client", order.customer_name),
      infoItem("Entreprise", order.company_name),
      infoItem("Ville", order.city),
      infoItem("Email", order.email),
      infoItem("Offre", order.offer_name),
      infoItem("Montant", formatMoney(order.amount_total, order.currency)),
      infoItem("Date", formatDate(order.created_at)),
      infoItem("Environnement", String(order.environment || "unknown").toUpperCase()),
      infoItem("Session Stripe", order.stripe_session_id),
      infoItem("Payment Intent", order.stripe_payment_intent_id),
      infoItem("Lien Google Business", order.google_business_url),
      `<a class="admin-button" href="${escapeHtml(buildGoogleBusinessUrl(order))}" target="_blank" rel="noopener">Ouvrir la fiche Google</a>`,
    ].join("");
  }

  if (taskInfo) {
    taskInfo.innerHTML = currentTask ? [
      infoItem("Tâche", currentTask.title),
      infoItem("Statut", statusLabels[currentTask.status] || currentTask.status),
      infoItem("Mise à jour", formatDate(currentTask.updated_at)),
      infoItem("Terminée le", formatDate(currentTask.completed_at)),
    ].join("") : `<p class="admin-empty">Aucune tâche liée à cette commande.</p>`;
  }

  if (productionInfo) {
    productionInfo.innerHTML = [
      infoItem("Entreprise", order.company_name),
      infoItem("Ville", order.city),
      infoItem("Prénom", getFirstName(order)),
      infoItem("Email", order.email),
      infoItem("Offre", order.offer_name),
      infoItem("Order ID", order.order_id),
      infoItem("Task ID", currentTask?.task_id),
      infoItem("Statut actuel", currentTask ? (statusLabels[currentTask.status] || currentTask.status) : "—"),
      infoItem("Nom du fichier PDF", currentTask?.pdf_filename),
      infoItem("Date de génération", formatDate(currentTask?.pdf_generated_at)),
      infoItem("Date d’envoi", formatDate(currentTask?.sent_at)),
      infoItem("Notes internes", currentTask?.notes),
    ].join("");
  }

  if (openScoreToolButton) {
    openScoreToolButton.href = currentTask ? buildScoreToolUrl(order, currentTask) : "#";
    openScoreToolButton.classList.toggle("is-disabled", !currentTask);
  }

  if (taskNotes) taskNotes.value = currentTask?.notes || "";
  taskButtons.forEach((button) => {
    button.disabled = !currentTask;
  });
  if (saveNotesButton) saveNotesButton.disabled = !currentTask;
  productionButtons.forEach((button) => {
    button.disabled = !currentTask;
  });
};

const loadOrder = async () => {
  const orderId = new URLSearchParams(window.location.search).get("id");
  if (!orderId) {
    setError("Identifiant de commande manquant.");
    return;
  }

  const response = await fetch(`/admin/orders/${encodeURIComponent(orderId)}`, {
    headers: { "Accept": "application/json" },
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

  renderOrder(data);
};

const updateTask = async ({ status, notes }) => {
  if (!currentTask?.task_id) return;
  setError("");

  const body = { status };
  if (notes !== undefined) body.notes = notes;

  const response = await fetch(`/admin/tasks/${encodeURIComponent(currentTask.task_id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    redirectToLogin();
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    setError("Impossible de mettre à jour la tâche.");
    return;
  }

  currentTask = data.task;
  renderOrder({
    order: currentOrder,
    tasks: [currentTask],
  });
};

const logout = async () => {
  await fetch("/admin/logout", {
    method: "POST",
    headers: { "Accept": "application/json" },
  }).catch(() => {});
  redirectToLogin();
};

taskButtons.forEach((button) => {
  button.addEventListener("click", () => {
    updateTask({
      status: button.getAttribute("data-task-status"),
      notes: taskNotes?.value,
    });
  });
});

productionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    updateTask({
      status: button.getAttribute("data-production-status"),
      notes: taskNotes?.value,
    });
  });
});

saveNotesButton?.addEventListener("click", () => {
  updateTask({
    status: currentTask?.status || "todo",
    notes: taskNotes?.value,
  });
});

logoutButtons.forEach((button) => {
  button.addEventListener("click", logout);
});

loadOrder();
