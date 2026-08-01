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
const popupFallback = document.querySelector("[data-admin-audit-popup-fallback]");
const popupFallbackLink = document.querySelector("[data-admin-audit-popup-link]");
const readyIndicator = document.querySelector("[data-admin-audit-ready]");

// Mission "rendre l'identification de l'entreprise suffisamment robuste pour
// le lancement de la bêta" — Objectif 2 : sélecteur de candidats ambigus.
const candidatesCard = document.querySelector("[data-admin-audit-candidates]");
const candidatesMessage = document.querySelector("[data-admin-candidates-message]");
const candidatesList = document.querySelector("[data-admin-candidates-list]");
const candidatesConfirmButton = document.querySelector("[data-admin-candidates-confirm]");
const candidatesNoneButton = document.querySelector("[data-admin-candidates-none]");
const candidatesError = document.querySelector("[data-admin-candidates-error]");

let isSubmitting = false;
let linkedOrder = null;
let linkedTask = null;
// Payload en attente de confirmation manuelle (Objectif 2) : conservé tel
// quel entre la réponse "AMBIGUOUS_CANDIDATES" et le clic de confirmation,
// pour pouvoir relancer exactement la même demande avec un `selectedPlaceId`
// en plus — jamais de choix arbitraire côté client.
let pendingAmbiguousPayload = null;
// Mission "logique métier déterministe" — Objectif 5 : liste complète des
// candidats reçus (avec leur champ `raw`), conservée pour pouvoir renvoyer
// le candidat CHOISI en entier (`selectedCandidate`) au moment de la
// confirmation, plutôt que son seul place_id — évite tout nouvel appel amont
// côté serveur, donc tout risque de SELECTED_CANDIDATE_NOT_FOUND.
let pendingCandidates = [];

// Seules Observation et Benchmark s'exécutent réellement lors de la génération d'un nouvel audit.
// Knowledge/Reasoning/Composer ne tournent qu'après validation humaine, sur la page de génération
// du rapport : ils ne font donc plus partie de cette page.
const STAGES = ["observation", "benchmark"];
const STAGE_LABELS = {
  observation: "Observation",
  benchmark: "Benchmark",
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
  if (candidatesCard) candidatesCard.hidden = true;
  if (readyIndicator) readyIndicator.hidden = true;
  resetProgress();
  setStage("observation", "running", "En cours");
}

function formatConfidencePercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)} %` : "—";
}

// Objectif 2 — jamais de sélection automatique arbitraire entre les deux
// seuils : on présente les candidats plausibles tels que renvoyés par
// collectFiche (déjà triés par confiance décroissante), l'administrateur
// choisit, ou indique qu'aucun ne correspond.
function showCandidates(payload, data) {
  if (!candidatesCard || !candidatesList) return;
  pendingAmbiguousPayload = payload;
  candidatesMessage.textContent = data.message || "Nous avons trouvé plusieurs entreprises pouvant correspondre.";
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  pendingCandidates = candidates;
  candidatesList.innerHTML = candidates.map((candidate, index) => `
    <li class="admin-candidate-item">
      <label>
        <input type="radio" name="admin-audit-candidate" value="${escapeHtml(candidate.placeId)}" ${index === 0 ? "checked" : ""}>
        <span class="admin-candidate-name">${escapeHtml(candidate.name || "(sans nom)")}</span>
        <span class="admin-candidate-confidence">Confiance : ${escapeHtml(formatConfidencePercent(candidate.confidence))}</span>
        <span class="admin-candidate-meta">${escapeHtml([candidate.city, candidate.address].filter(Boolean).join(" — ") || "Adresse inconnue")}</span>
      </label>
    </li>
  `).join("");
  if (candidatesConfirmButton) candidatesConfirmButton.disabled = candidates.length === 0;
  if (candidatesError) candidatesError.textContent = "";
  candidatesCard.hidden = false;
  progressCard.hidden = true;
  resultCard.hidden = true;
}

function collectPayload() {
  const data = new FormData(form);
  return {
    orderId: linkedOrder?.order_id || new URLSearchParams(window.location.search).get("orderId") || "",
    taskId: linkedTask?.task_id || "",
    // Cette page ne sert plus qu'à lancer des Audits Premium : la valeur est
    // fixée en arrière-plan, il n'existe plus aucun contrôle pour la changer.
    reportType: "premium",
    googleBusinessUrl: String(data.get("googleBusinessUrl") || "").trim(),
    companyName: String(data.get("companyName") || "").trim(),
    city: String(data.get("city") || "").trim(),
    email: String(data.get("email") || "").trim(),
    internalNotes: String(data.get("internalNotes") || "").trim(),
  };
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
  fillIfEmpty("googleBusinessUrl", linkedOrder.google_business_url);
  fillIfEmpty("companyName", linkedOrder.company_name);
  fillIfEmpty("city", linkedOrder.city);
  fillIfEmpty("email", linkedOrder.email);
}

function prefillFromUrl() {
  const params = new URLSearchParams(window.location.search);
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

// Deux façons équivalentes d'identifier l'entreprise : l'URL Google Business
// seule (Mode 1), ou le Nom + la Ville (Mode 2). Le formulaire est valide dès
// que l'une des deux voies est complète — voir aussi updateRequiredState(),
// qui garde les attributs `required` du HTML cohérents avec cette même règle.
function hasIdentification(payload) {
  const hasUrl = Boolean(payload.googleBusinessUrl);
  const hasNameAndCity = Boolean(payload.companyName) && Boolean(payload.city);
  return hasUrl || hasNameAndCity;
}

function validatePayload(payload) {
  if (!hasIdentification(payload)) {
    return "Veuillez renseigner soit l’URL Google Business, soit le nom de l’entreprise et sa ville.";
  }
  if (payload.googleBusinessUrl && !isValidGoogleUrl(payload.googleBusinessUrl)) {
    return "L’URL doit être une adresse Google Maps ou Google Business valide.";
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return "L’adresse e-mail n’est pas valide.";
  return "";
}

// Garde les attributs `required`/`aria-required` cohérents avec la validation
// conditionnelle ci-dessus : l'URL n'est requise que si Nom+Ville ne sont pas
// déjà tous les deux renseignés, et inversement. Appelée à chaque saisie dans
// l'un des trois champs, ainsi qu'après tout pré-remplissage programmatique
// (prefillFromUrl/loadOrderFromQuery, qui ne déclenchent pas d'événement
// "input").
function updateRequiredState() {
  const urlField = form?.elements?.googleBusinessUrl;
  const nameField = form?.elements?.companyName;
  const cityField = form?.elements?.city;
  if (!urlField || !nameField || !cityField) return;

  const hasNameAndCity = Boolean(nameField.value.trim()) && Boolean(cityField.value.trim());
  const hasUrl = Boolean(urlField.value.trim());

  const urlRequired = !hasNameAndCity;
  const nameCityRequired = !hasUrl;

  urlField.required = urlRequired;
  urlField.setAttribute("aria-required", String(urlRequired));
  nameField.required = nameCityRequired;
  nameField.setAttribute("aria-required", String(nameCityRequired));
  cityField.required = nameCityRequired;
  cityField.setAttribute("aria-required", String(nameCityRequired));
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

// Factorisé hors de submitAudit pour être également appelable depuis la
// confirmation de candidat (Objectif 2) : même flux exact, seul le payload
// change (ajout de selectedPlaceId). Doit toujours être appelée directement
// depuis un gestionnaire de clic (pas après un premier `await`) : window.open()
// doit rester dans le prolongement direct du geste utilisateur, sinon la
// plupart des navigateurs bloquent l'ouverture.
async function runAudit(payload) {
  let pendingReviewTab = null;
  try {
    pendingReviewTab = window.open("about:blank", "_blank");
  } catch {
    pendingReviewTab = null;
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
      if (pendingReviewTab) pendingReviewTab.close();
      redirectToLogin();
      return;
    }

    // Objectif 2 — plusieurs entreprises sont plausibles : aucune collecte
    // n'a eu lieu, on arrête le pipeline et on demande une confirmation
    // humaine avant de continuer. On referme l'onglet vide (rien à y ouvrir
    // pour l'instant) et on conserve le payload pour le relancer une fois le
    // choix fait.
    if (response.status === 409 && data.error === "AMBIGUOUS_CANDIDATES") {
      if (pendingReviewTab) pendingReviewTab.close();
      showCandidates(payload, data);
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
    if (readyIndicator) readyIndicator.hidden = false;
    renderResult(data);

    // Le pipeline (observation + benchmark) est terminé : on remplace l'URL de l'onglet déjà
    // ouvert par la page de validation. Aucun nouvel appel à window.open() ici.
    if (data.analysisId) {
      const reviewUrl = data.links?.review || `/admin/audit-review/${encodeURIComponent(data.analysisId)}`;
      if (pendingReviewTab) {
        pendingReviewTab.location.replace(reviewUrl);
        if (popupFallback) popupFallback.hidden = true;
      } else if (popupFallback) {
        if (popupFallbackLink) popupFallbackLink.href = reviewUrl;
        popupFallback.hidden = false;
      }
    }
  } catch (error) {
    // Le pipeline a échoué : on referme l'onglet vide et on affiche l'erreur sur la page actuelle.
    if (pendingReviewTab) pendingReviewTab.close();
    setError(error.message || "Une erreur est survenue. Merci de réessayer dans quelques instants.");
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Générer l’audit";
  }
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

  pendingAmbiguousPayload = null;
  await runAudit(payload);
}

["googleBusinessUrl", "companyName", "city"].forEach((name) => {
  form?.elements?.[name]?.addEventListener("input", updateRequiredState);
});

form?.addEventListener("submit", submitAudit);
prefillFromUrl();
updateRequiredState();
loadOrderFromQuery().then(updateRequiredState);

resetButton?.addEventListener("click", () => {
  resultCard.hidden = true;
  progressCard.hidden = true;
  if (candidatesCard) candidatesCard.hidden = true;
  pendingAmbiguousPayload = null;
  resetProgress();
  setError("");
  form?.querySelector("input[name='googleBusinessUrl']")?.focus();
});

// Objectif 2 — confirmation manuelle : relance exactement la même demande,
// enrichie du candidat choisi par l'administrateur. collectFiche() bascule
// alors dessus sans repasser par le score de confiance (voir
// functions/lib/collectFiche.js) : le choix humain prime toujours.
// Mission "logique métier déterministe" — Objectif 5 : on envoie le candidat
// COMPLET (`selectedCandidate`, retrouvé dans `pendingCandidates` via son
// place_id), pas seulement `selectedPlaceId` — collectFiche() l'utilise
// alors directement, sans jamais rappeler le service amont pour le "retrouver".
candidatesConfirmButton?.addEventListener("click", async () => {
  const selected = candidatesList?.querySelector("input[name='admin-audit-candidate']:checked");
  if (!selected || !pendingAmbiguousPayload) {
    if (candidatesError) candidatesError.textContent = "Sélectionnez une entreprise avant de confirmer.";
    return;
  }
  const chosenCandidate = pendingCandidates.find((c) => c.placeId === selected.value);
  const payload = {
    ...pendingAmbiguousPayload,
    selectedPlaceId: selected.value,
    ...(chosenCandidate?.raw ? { selectedCandidate: chosenCandidate.raw } : {}),
  };
  pendingAmbiguousPayload = null;
  pendingCandidates = [];
  candidatesCard.hidden = true;
  await runAudit(payload);
});

// Objectif 3 — aucune des propositions ne correspond : on n'insiste pas,
// on laisse l'administrateur affiner sa recherche (nom/ville, ou URL Google
// Business directe) plutôt que de forcer un choix approximatif.
candidatesNoneButton?.addEventListener("click", () => {
  pendingAmbiguousPayload = null;
  candidatesCard.hidden = true;
  setError("Aucune de ces entreprises ne correspond. Affinez le nom et la ville, ou renseignez directement l’URL Google Business, puis relancez.");
  form?.querySelector("input[name='companyName']")?.focus();
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
