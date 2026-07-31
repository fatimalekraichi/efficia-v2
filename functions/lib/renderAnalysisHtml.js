const EFFICIA_BLUE = "#2563eb";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function present(value) {
  return value !== null && value !== undefined && value !== "";
}

function safeText(value, fallback = "Non disponible") {
  return escapeHtml(present(value) ? value : fallback);
}

function safeNumber(value, fallback = "Non disponible") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return escapeHtml(fallback);
  return escapeHtml(Number.isInteger(parsed) ? parsed : parsed.toFixed(1));
}

const LABEL_TRANSLATIONS = {
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
  easy: "Facile",
  moderate: "Modéré",
  hard: "Difficile",
  critical: "Critique",
  trust: "Confiance",
  conversion: "Conversion",
  visibility: "Visibilité",
  completeness: "Complétude",
};

function safeLabel(value, fallback = "Non disponible") {
  if (!present(value)) return escapeHtml(fallback);
  return safeText(LABEL_TRANSLATIONS[String(value)] || value, fallback);
}

function stars(count) {
  const value = Number(count);
  const total = Number.isFinite(value) ? Math.max(0, Math.min(5, Math.round(value))) : 0;
  return `${"★".repeat(total)}${"☆".repeat(5 - total)}`;
}

function icon(name) {
  const attrs = `width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const icons = {
    check: `<svg ${attrs}><path d="M20 6 9 17l-5-5"/></svg>`,
    trend: `<svg ${attrs}><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>`,
    target: `<svg ${attrs}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3"/></svg>`,
    shield: `<svg ${attrs}><path d="M20 13c0 5-3.5 7.5-8 8.5C7.5 20.5 4 18 4 13V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-5"/></svg>`,
    clock: `<svg ${attrs}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    spark: `<svg ${attrs}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M5 19v-2M4 18h2M19 5V3M18 4h2"/></svg>`,
    arrow: `<svg ${attrs}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`,
  };
  return icons[name] || icons.check;
}

function logo() {
  return `
    <div class="brand" aria-label="Efficia Digital">
      <svg class="brand-logo" viewBox="0 0 1536 864" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="efficia-logo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff149d"/>
            <stop offset=".45" stop-color="#7728ff"/>
            <stop offset="1" stop-color="#00d4ff"/>
          </linearGradient>
        </defs>
        <path d="M285 645 C200 565 145 500 145 440 C145 365 205 305 287 305 C330 305 370 322 398 352 L362 385 C343 366 318 354 289 354 C233 354 194 393 194 445 C194 494 235 545 289 600 C343 545 417 477 449 423 L449 505 C410 555 353 606 289 652 Z" fill="url(#efficia-logo-gradient)"/>
        <polyline points="235,525 282,480 327,507 438,410" fill="none" stroke="url(#efficia-logo-gradient)" stroke-width="48" stroke-linejoin="round"/>
        <polygon points="385,388 450,376 441,444" fill="#13ccee"/>
        <rect x="294" y="510" width="31" height="92" rx="8" fill="url(#efficia-logo-gradient)"/>
        <rect x="250" y="535" width="31" height="65" rx="8" fill="url(#efficia-logo-gradient)"/>
        <text x="495" y="553" font-family="Arial, Helvetica, sans-serif" font-size="160" font-weight="800" fill="#030748">Efficia</text>
        <text x="1030" y="553" font-family="Arial, Helvetica, sans-serif" font-size="150" font-weight="300" fill="#2467ff">Digital</text>
      </svg>
    </div>
  `;
}

function header(label = "Diagnostic Efficia™") {
  return `
    <header class="doc-header">
      ${logo()}
      <span>${safeText(label)}</span>
    </header>
  `;
}

function methodologyProofItems(model) {
  const methodology = model.footer?.methodology || "";
  return [
    "120+ signaux analysés",
    methodology.includes("comparaison")
      ? methodology.replace(/^Analyse issue des observations publiques ·\s*/i, "")
      : "comparaison concurrentielle selon les données disponibles",
    "méthode Efficia™",
  ];
}

function footer(model, label = "") {
  return `
    <footer class="doc-footer">
      <span>${safeText(label || model.hero?.businessName || model.vocabulary?.reportLabel || "Diagnostic Efficia")}</span>
      <span>Efficia Digital</span>
    </footer>
  `;
}

// Point 1 du plan (2026-07-31, Sprint 1 "Constats irréfutables") : au lieu
// d'une seule ligne "valeur · référence observée", on affiche jusqu'à 3
// lignes (vous / moyenne concurrents / meilleure fiche observée nommée)
// quand la donnée existe — sans rien inventer : chaque ligne est omise si sa
// valeur n'est pas disponible (present() déjà utilisé partout ailleurs dans
// ce fichier pour ce même principe).
function evidenceLine(evidence) {
  if (!evidence) return "Preuve non disponible";
  const unitSuffix = evidence.unit ? ` ${safeText(evidence.unit, "")}` : "";
  const lines = [];

  if (present(evidence.value)) lines.push(`Vous : ${safeNumber(evidence.value)}${unitSuffix}`);
  if (present(evidence.competitorMedian)) lines.push(`Moyenne concurrents : ${safeNumber(evidence.competitorMedian)}${unitSuffix}`);
  if (evidence.topCompetitor && present(evidence.topCompetitor.value)) {
    lines.push(`Meilleure observée : ${safeNumber(evidence.topCompetitor.value)}${unitSuffix} (${safeText(evidence.topCompetitor.name, "")})`);
  }

  return lines.length ? lines.join("<br>") : safeText(evidence.source || "Observation");
}

function scoreGauge(score) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const circumference = 2 * Math.PI * 48;
  const offset = circumference * (1 - value / 100);
  return `
    <div class="score-gauge-wrap" aria-label="Score ${safeNumber(value)} sur 100">
      <svg class="score-gauge" viewBox="0 0 120 120">
        <circle class="score-gauge-bg" cx="60" cy="60" r="48"></circle>
        <circle class="score-gauge-value" cx="60" cy="60" r="48" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
      </svg>
      <div class="score-gauge-center">
        <strong>${safeNumber(value)}</strong>
        <span>/100</span>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------------ */
/* Audit Efficia™ premium — renderPremiumAuditHtml                          */
/* Extrait à l'identique de l'ancien renderAnalysisHtml() (Étape B) :       */
/* aucune section, aucun texte, aucune donnée n'a été modifié ici.          */
/* ------------------------------------------------------------------------ */

// Point 11 du plan : bloc "VOUS / Meilleure fiche observée" — première chose
// lue, comme demandé. Chaque colonne n'affiche que les valeurs disponibles
// (aucune valeur inventée). Réutilise stars() (déjà utilisé pour le
// Potentiel d'amélioration) pour l'échelle 0-5.
function comparisonColumn(entity) {
  const ratingKnown = present(entity.rating);
  return `
    <div class="comparison-col">
      <p class="comparison-label">${safeText(entity.label)}</p>
      ${ratingKnown ? `<p class="comparison-stars">${stars(Math.round(entity.rating))}</p>` : ""}
      <p class="comparison-rating">${ratingKnown ? `${safeNumber(entity.rating)}/5` : "Non disponible"}</p>
      <p class="comparison-meta">
        ${present(entity.reviews) ? `${safeNumber(entity.reviews)} avis` : "Avis non disponibles"}
        ·
        ${present(entity.photos) ? `${safeNumber(entity.photos)} photo${Number(entity.photos) > 1 ? "s" : ""}` : "Photos non disponibles"}
      </p>
      ${entity.photosLabel && entity.photosIsEstimate ? `<p class="comparison-note">Photos : ${safeText(entity.photosLabel)}</p>` : ""}
      ${entity.name ? `<p class="comparison-name">${safeText(entity.name)}</p>` : ""}
    </div>
  `;
}

function comparisonSection(hero) {
  const card = hero.comparison;
  if (!card) return "";
  return `
    <div class="comparison-card">
      ${comparisonColumn(card.you)}
      <div class="comparison-divider" aria-hidden="true"></div>
      ${comparisonColumn(card.best)}
    </div>
    ${hero.rank?.text ? `<p class="comparison-rank">${safeText(hero.rank.text)}</p>` : ""}
  `;
}

function heroSection(model) {
  const hero = model.hero || {};
  const potential = hero.improvementPotential || {};
  const proofItems = methodologyProofItems(model);
  return `
    <section class="page cover-page">
      ${header(model.vocabulary?.reportLabel)}
      <div class="cover-grid">
        <div class="cover-copy">
          <p class="eyebrow">${safeText(model.vocabulary?.eyebrow || "Diagnostic Google Business")}</p>
          <h1>${safeText(hero.businessName, "Votre entreprise")}</h1>
          <p class="cover-meta">${[hero.category, hero.city, hero.date].filter(Boolean).map((item) => safeText(item, "")).join(" · ")}</p>
          <p class="headline">${safeText(hero.headline, "")}</p>
        </div>
        <div class="score-card">
          <span class="score-label">Score Efficia™</span>
          ${scoreGauge(hero.score)}
          <div class="score-band">${safeText(hero.scoreBand, "Score analysé")}</div>
          <p class="score-interpretation">Vous faites déjà mieux que de nombreuses entreprises locales. Les recommandations de ce rapport visent à transformer cet avantage en davantage de visibilité et de contacts.</p>
        </div>
      </div>
      ${comparisonSection(hero)}
      <div class="cover-bottom">
        <article class="hero-card executive-card">
          <div>
            <p class="letter-label">Note d'analyse</p>
            <h2>Résumé exécutif</h2>
            <p>${safeText(model.executiveSummary?.text, "Résumé non disponible.")}</p>
          </div>
        </article>
        <div class="cover-side">
          <article class="hero-card potential-card">
            <div class="potential-top">
              <span>${safeText(potential.title, "Potentiel d'amélioration")}</span>
              <strong>${safeText(stars(potential.stars), "")}</strong>
            </div>
            <div class="potential-score">
              <strong>${safeNumber(potential.score)}</strong>
              <span>${safeText(potential.label, "")}</span>
            </div>
            <p class="potential-title">${safeText(potential.driversTitle, "Vos principaux leviers")}</p>
            <ul class="driver-list">
              ${(potential.drivers || []).map((driver) => `<li>${icon("check")}<span>${safeText(driver.label)}</span></li>`).join("")}
            </ul>
            <small>${safeText(potential.note, "")}</small>
          </article>
          <article class="method-proof-card">
            <p>Analyse réalisée à partir de</p>
            <ul>
              ${proofItems.map((item) => `<li>${icon("check")}<span>${safeText(item)}</span></li>`).join("")}
            </ul>
          </article>
        </div>
      </div>
      ${footer(model, "Page de couverture")}
    </section>
  `;
}

function priorityCard(item) {
  return `
    <article class="priority-card">
      <div class="priority-rank">Priorité ${safeNumber(item.rank)}</div>
      <div class="priority-body">
        <h3>${safeText(item.title)}</h3>
        <div class="priority-grid">
          <div>
            <span>Pourquoi c'est important</span>
            <p>${safeText(item.reasoning)}</p>
          </div>
          <div>
            <span>Preuve</span>
            <p>${evidenceLine(item.evidence)}</p>
          </div>
          <div>
            <span>Impact</span>
            <p>${safeLabel(item.severity)}</p>
          </div>
          <div>
            <span>Temps estimé</span>
            <p>${safeText(item.actionability?.estimatedTime)}</p>
          </div>
        </div>
      </div>
    </article>
  `;
}

function prioritiesSection(model) {
  const items = model.priorities || [];
  return `
    <section class="page">
      ${header(model.vocabulary?.prioritiesTitle || "Les 3 priorités")}
      <div class="section-intro">
        <p class="eyebrow">Priorités</p>
        <h2>Les actions qui méritent votre attention en premier</h2>
        <p>Nous avons isolé les sujets qui peuvent le plus améliorer la perception de votre fiche et guider davantage de prospects vers une prise de contact.</p>
      </div>
      <div class="priority-list">
        ${items.length ? items.map(priorityCard).join("") : `<p class="empty">Aucune priorité majeure à afficher.</p>`}
      </div>
      ${footer(model, "Priorités")}
    </section>
  `;
}

function strengthCard(item) {
  return `
    <article class="insight-card strength-card">
      <div class="card-icon">${icon("shield")}</div>
      <h3>${safeText(item.title)}</h3>
      <p>${safeText(item.message)}</p>
      <div class="proof">${evidenceLine(item.evidence)}</div>
    </article>
  `;
}

function strengthsSection(model) {
  return `
    <section class="page">
      ${header("Vos points forts")}
      <div class="section-intro positive">
        <p class="eyebrow">Confiance</p>
        <h2>Ce qui joue déjà en votre faveur</h2>
        <p>Ces points constituent une base de confiance. Ils montrent ce que votre fiche fait déjà bien lorsque quelqu'un compare plusieurs entreprises.</p>
      </div>
      <div class="card-grid">
        ${(model.strengths || []).map(strengthCard).join("") || `<p class="empty">Aucun point fort prioritaire à afficher.</p>`}
      </div>
      ${footer(model, "Points forts")}
    </section>
  `;
}

function issueCard(item, type) {
  const iconName = type === "opportunity" ? "trend" : "target";
  return `
    <article class="insight-card ${type === "opportunity" ? "opportunity-card" : "weakness-card"}">
      <div class="card-icon">${icon(iconName)}</div>
      <h3>${safeText(item.title)}</h3>
      <p>${safeText(item.message)}</p>
      <div class="proof">${evidenceLine(item.evidence)}</div>
    </article>
  `;
}

// Point 3 du plan : score par domaine, déjà calculé (buildDomains(),
// composer-engine/narrativeModel.js) — simple tableau récapitulatif, aucun
// nouveau calcul.
function domainRow(domain) {
  const pct = Number.isFinite(domain.pct) ? Math.round(domain.pct * 100) : null;
  return `
    <div class="domain-row">
      <span class="domain-label">${safeText(domain.label)}</span>
      <div class="domain-bar-track">
        <div class="domain-bar-fill" style="width:${pct !== null ? Math.max(0, Math.min(100, pct)) : 0}%;"></div>
      </div>
      <span class="domain-value">${pct !== null ? `${pct}%` : "Non évalué"}</span>
    </div>
  `;
}

function domainsBlock(domains) {
  if (!Array.isArray(domains) || !domains.length) return "";
  return `
    <div class="domains-block">
      <h3 class="column-title">Score par domaine</h3>
      <div class="domain-list">${domains.map(domainRow).join("")}</div>
    </div>
  `;
}

function limitsSection(model) {
  return `
    <section class="page">
      ${header("Axes d'amélioration")}
      <div class="section-intro">
        <p class="eyebrow">Visibilité et conversion</p>
        <h2>Ce qui limite aujourd'hui votre visibilité</h2>
        <p>Les cartes restent volontairement pédagogiques : elles expliquent ce qui peut être renforcé, sans ton alarmiste.</p>
      </div>
      ${domainsBlock(model.domains)}
      <div class="split-grid">
        <div>
          <h3 class="column-title">À renforcer</h3>
          <div class="stack">${(model.weaknesses || []).map((item) => issueCard(item, "weakness")).join("") || `<p class="empty">Aucune limite majeure.</p>`}</div>
        </div>
        <div>
          <h3 class="column-title">Opportunités</h3>
          <div class="stack">${(model.opportunities || []).map((item) => issueCard(item, "opportunity")).join("") || `<p class="empty">Aucune opportunité prioritaire.</p>`}</div>
        </div>
      </div>
      ${footer(model, "Axes d'amélioration")}
    </section>
  `;
}

function boolLabel(value) {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  return "À confirmer";
}

function actionCard(item) {
  return `
    <article class="action-card">
      <div class="timeline-dot">${safeNumber(item.order)}</div>
      <div class="action-content">
        <h3>${safeText(item.action)}</h3>
        <dl>
          <div><dt>Difficulté</dt><dd>${safeLabel(item.difficulty)}</dd></div>
          <div><dt>Temps</dt><dd>${safeText(item.estimatedTime)}</dd></div>
          <div><dt>Automatisable par Efficia</dt><dd>${boolLabel(item.canEfficiaAutomate)}</dd></div>
          <div><dt>Impact attendu</dt><dd>${safeLabel(item.impactType)}</dd></div>
        </dl>
      </div>
    </article>
  `;
}

function actionPlanSection(model) {
  return `
    <section class="page">
      ${header("Plan d'action")}
      <div class="section-intro">
        <p class="eyebrow">Séquence recommandée</p>
        <h2>Un plan d'action simple à suivre</h2>
        <p>Les actions sont présentées dans un ordre pragmatique : commencer par ce qui clarifie vite la fiche, puis renforcer les signaux les plus visibles.</p>
      </div>
      <div class="timeline">
        ${(model.actionPlan || []).map(actionCard).join("") || `<p class="empty">Aucune action prioritaire à afficher.</p>`}
      </div>
      ${footer(model, "Plan d'action")}
    </section>
  `;
}

function methodologySection(model) {
  return `
    <section class="page final-page">
      ${header("Méthodologie")}
      <div class="section-intro">
        <p class="eyebrow">Décision</p>
        <h2>Pourquoi agir maintenant</h2>
        <p>${safeText(model.whyNow?.text, "Aucun texte de cadrage disponible.")}</p>
        ${model.vocabulary?.upsellNote ? `<p class="upsell-note">${safeText(model.vocabulary.upsellNote)}</p>` : ""}
      </div>
      <div class="method-grid">
        <article class="method-card">
          <h3>Méthodologie</h3>
          <p>${safeText(model.footer?.methodology)}</p>
        </article>
        <article class="method-card">
          <h3>Cadre de lecture</h3>
          <p>${safeText(model.footer?.disclaimer)}</p>
        </article>
        <article class="method-card">
          <h3>Versions</h3>
          <p>Composer ${safeText(model.footer?.versions?.composer)} · Reasoning ${safeText(model.footer?.versions?.reasoning)}</p>
        </article>
      </div>
      ${footer(model, "Méthodologie")}
    </section>
  `;
}

export function renderPremiumAuditHtml(documentModel = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(documentModel.vocabulary?.reportLabel || "Diagnostic Efficia")} - ${safeText(documentModel.hero?.businessName || "Analyse")}</title>
  ${styles()}
</head>
<body>
  <main class="report-shell">
    ${heroSection(documentModel)}
    ${prioritiesSection(documentModel)}
    ${strengthsSection(documentModel)}
    ${limitsSection(documentModel)}
    ${actionPlanSection(documentModel)}
    ${methodologySection(documentModel)}
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------------------ */
/* Diagnostic Efficia™ gratuit — renderFreeDiagnosticHtml (Étape B)          */
/* Reproduit les 6 pages du PDF de référence validé (Auto Service Fischer). */
/* N'utilise QUE des données déjà présentes dans documentModel/freeDiagnostic */
/* (Étape A) : aucun recalcul, aucune nouvelle recommandation.              */
/* ------------------------------------------------------------------------ */

// Qualificatifs d'affichage (présentation uniquement — ne recalculent ni ne
// modifient aucune donnée du Score Efficia). Seuils repris À L'IDENTIQUE du
// générateur historique retrouvé dans l'archive Git (commit a9e3241,
// outil-score-efficia-auto-v5.html) :
//   - indices prospect → fonction styleIndice()  : >=75 Solide, >=50 À
//     renforcer, sinon Prioritaire (échelle 0-100) ;
//   - domaines → fonction statutDomaine() : >=80 Solide, >=60 Correct, >=40 À
//     renforcer, sinon Prioritaire (échelle 0-1, soit 0-100 %).
// Les seuils utilisés lors des sprints précédents (70/30 et 0.8/0.55/0.3)
// étaient une reconstruction approximative ; ce sont désormais les vraies
// valeurs historiques.
function indexStatusLabel(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value >= 75) return "Solide";
  if (value >= 50) return "À renforcer";
  return "Prioritaire";
}

function domainStatusLabel(pct) {
  const value = Number(pct);
  if (!Number.isFinite(value)) return null;
  if (value >= 0.8) return "Solide";
  if (value >= 0.6) return "Correct";
  if (value >= 0.4) return "À renforcer";
  return "Prioritaire";
}

const STATUS_CLASS_BY_LABEL = {
  "Solide": "status-good",
  "Correct": "status-ok",
  "À renforcer": "status-warn",
  "Prioritaire": "status-bad",
};

function statusClass(label) {
  return STATUS_CLASS_BY_LABEL[label] || "status-ok";
}

// Symboles de la synthèse des critères (page 3), repris à l'identique de
// checklistHtml() dans le générateur historique : ✓ conforme / ! à améliorer
// / ✕ prioritaire / ○ à confirmer.
const CRITERION_ICON_BY_STATUS = {
  compliant: ["chk-ok", "✓"],
  partial: ["chk-warn", "!"],
  deficient: ["chk-ko", "✕"],
  not_verified: ["chk-unknown", "○"],
};

function criterionIcon(status) {
  return CRITERION_ICON_BY_STATUS[status] || CRITERION_ICON_BY_STATUS.not_verified;
}

function freeIndexCard(label, value) {
  const statusLabel = indexStatusLabel(value);
  return `
    <article class="index-card ${statusClass(statusLabel)}">
      <span class="index-label">${escapeHtml(label)}</span>
      <strong class="index-value">${safeNumber(value)}<small>/100</small></strong>
      ${statusLabel ? `<span class="index-status">${escapeHtml(statusLabel)}</span>` : ""}
    </article>
  `;
}

function freeIndicesRow(indices = {}) {
  return `
    <div class="index-row">
      ${freeIndexCard("Visibilité", indices?.visibilite)}
      ${freeIndexCard("Confiance", indices?.confiance)}
      ${freeIndexCard("Conversion", indices?.conversion)}
    </div>
  `;
}

// "Ce qu'il faut en retenir" — reprend la structure exacte de significationV2()
// (meaning-box / summary-line / summary-icon, glyphes ✓ / ! / ○) : jusqu'à 2
// points forts, jusqu'à 2 priorités, puis la note « à confirmer ». Aucune
// donnée inventée : uniquement des champs déjà présents dans documentModel.
function freeNotVerifiedNote(criteriaSummary) {
  const count = criteriaSummary?.counts?.not_verified || 0;
  if (!count) return null;
  return `${count > 1 ? `${count} points ne sont` : "1 point n'est"} pas vérifiables de l'extérieur — plutôt que de les deviner, nous les avons marqués « à confirmer ».`;
}

function freeMeaningBox(model) {
  const free = model.freeDiagnostic || {};
  const strengths = (model.strengths || []).slice(0, 2);
  const priorities = (free.priorities || []).slice(0, 2);
  const notVerifiedNote = freeNotVerifiedNote(free.criteriaSummary);

  const lines = [
    ...strengths.map((item) => ({ symbolClass: "summary-icon--ok", symbol: "✓", text: item.message || item.title })),
    ...priorities.map((item) => ({ symbolClass: "summary-icon--warning", symbol: "!", text: item.observed || item.title })),
    ...(notVerifiedNote ? [{ symbolClass: "summary-icon--unknown", symbol: "○", text: notVerifiedNote }] : []),
  ].filter((item) => present(item.text));

  if (!lines.length) return "";
  return `
    <div class="meaning-box">
      <h3>Ce qu'il faut en retenir</h3>
      <ul>
        ${lines.map((item) => `<li class="summary-line"><span class="summary-icon ${item.symbolClass}">${item.symbol}</span><span><strong>${safeText(item.text)}</strong></span></li>`).join("")}
      </ul>
    </div>
  `;
}

function freeSituationSection(model) {
  const hero = model.hero || {};
  const free = model.freeDiagnostic || {};
  const showPotential = Number.isFinite(free.projectedScore) && free.projectedScore > (Number(hero.score) || 0) + 2;

  return `
    <section class="page page-hero" data-free-page="1">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 1 · VOTRE FICHE AUJOURD'HUI</div>
      <h1>Votre situation aujourd'hui</h1>
      <p class="cover-meta">${[hero.businessName, hero.category, hero.city, hero.date].filter(Boolean).map((item) => safeText(item, "")).join(" · ")}</p>
      <div class="score-hero">
        <div>
          ${scoreGauge(hero.score)}
          ${showPotential ? `
            <div class="score-potential">Potentiel estimé : <span>${safeNumber(free.projectedScore)}/100</span></div>
            <div class="score-mini-story"><b>${safeNumber(hero.score)}</b><span>→</span><b>${safeNumber(free.projectedScore)}</b></div>
          ` : ""}
        </div>
        <div>
          <span class="score-level"><i style="background:${safeText(free.band?.couleur, "#2563eb")}"></i>${safeText(free.band?.nom, hero.scoreBand || "Score analysé")}</span>
          <div class="score-direct">${safeText(free.band?.verdict, "")}</div>
          <p class="hero-analysis-text">${safeText(model.executiveSummary?.text, "Résumé non disponible.")}</p>
        </div>
      </div>
      ${freeIndicesRow(free.indices)}
      ${freeMeaningBox(model)}
      <p class="methode-note">Méthode — analyse réalisée sur l'état public de votre fiche Google Business. ${safeNumber(free.criteriaSummary?.total)} points de contrôle passés en revue, sur les 40+ de l'Audit Efficia™ complet.</p>
      <div class="next-hint">Page suivante : comprendre d'où vient ce score <b>→</b></div>
      ${footer(model, "Page 1/6")}
    </section>
  `;
}

// Jauges de domaines — reprend la structure exacte de statutDomaine() +
// barre-cat/statut-domaine/barre-fond/barre-rempli du générateur historique.
function freeDomainRow(domain) {
  const pct = Number.isFinite(domain.pct) ? Math.max(0, Math.min(1, domain.pct)) : 0;
  const statusLabel = domainStatusLabel(domain.pct);
  return `
    <div class="barre-cat ${statusClass(statusLabel)}">
      <div class="ligne">
        <span>${safeText(domain.label)}</span>
        <strong>${safeNumber(domain.points)}/${safeNumber(domain.max)}</strong>
        ${statusLabel ? `<span class="statut-domaine">${escapeHtml(statusLabel)}</span>` : ""}
      </div>
      <div class="barre-fond"><div class="barre-rempli" style="width:${Math.round(pct * 100)}%"></div></div>
    </div>
  `;
}

function freeScoreExplanationSection(model) {
  const free = model.freeDiagnostic || {};
  const domains = free.domains || [];
  return `
    <section class="page" data-free-page="2">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 2 · POURQUOI CE SCORE</div>
      <h1>Pourquoi obtenez-vous ce score&nbsp;?</h1>
      <p class="rapport-subtitle">Votre score se construit sur six domaines. Voici, d'un coup d'œil, où votre fiche est déjà solide — et où elle perd des points aujourd'hui.</p>
      <div class="domain-list">
        ${domains.length ? domains.map(freeDomainRow).join("") : `<p class="empty">Répartition par domaine non disponible.</p>`}
      </div>
      <div class="next-hint">Page suivante : le détail des points analysés <b>→</b></div>
      ${footer(model, "Page 2/6")}
    </section>
  `;
}

// Synthèse des critères par domaine — reprend checklistHtml() : chk-grid /
// chk-rubrique / chk-item / chk-ic, avec les mêmes symboles ✓ / ! / ✕ / ○.
function freeCriteriaDomainCard(domain) {
  const criteria = domain.criteria || [];
  const conformes = criteria.filter((item) => item.status === "compliant").length;
  return `
    <div class="chk-rubrique">
      <h3>${safeText(domain.label)}<span>${conformes}/${criteria.length} conformes</span></h3>
      ${criteria.map((item) => {
        const [iconClass, symbol] = criterionIcon(item.status);
        return `<div class="chk-item"><span class="chk-ic ${iconClass}">${symbol}</span><span>${safeText(item.question)}</span></div>`;
      }).join("")}
    </div>
  `;
}

function freeCriteriaSection(model) {
  const hero = model.hero || {};
  const free = model.freeDiagnostic || {};
  const summary = free.criteriaSummary || { total: 0, counts: {}, byDomain: [] };
  const counts = summary.counts || {};
  const notVerifiedCount = counts.not_verified || 0;

  return `
    <section class="page page-criteria" data-free-page="3">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 3 · CE QUE NOUS AVONS VÉRIFIÉ</div>
      <h1>Ce que nous avons analysé</h1>
      <p class="rapport-subtitle">Pour établir ce diagnostic, nous avons passé la fiche de ${safeText(hero.businessName, "votre entreprise")} au crible de ${safeNumber(summary.total)} vérifications.</p>
      <div class="chk-compteur">
        <span class="count-tag status-compliant">${safeNumber(counts.compliant)} conformes</span>
        <span class="count-tag status-partial">${safeNumber(counts.partial)} à améliorer</span>
        <span class="count-tag status-deficient">${safeNumber(counts.deficient)} prioritaires</span>
        <span class="count-tag status-not_verified">${safeNumber(counts.not_verified)} à confirmer</span>
      </div>
      <div class="chk-grid">
        ${(summary.byDomain || []).map(freeCriteriaDomainCard).join("") || `<p class="empty">Détail des critères non disponible.</p>`}
      </div>
      <div class="chk-legend">Légende — <span class="chk-ok">✓</span> conforme&nbsp;&nbsp;·&nbsp;&nbsp;<span class="chk-warn">!</span> à améliorer&nbsp;&nbsp;·&nbsp;&nbsp;<span class="chk-ko">✕</span> prioritaire&nbsp;&nbsp;·&nbsp;&nbsp;<span class="chk-unknown">○</span> à confirmer manuellement.</div>
      <p class="rapport-note">Rassurez-vous : il n'est ni nécessaire ni utile de tout corriger d'un coup. Nous avons retenu les trois points qui, pour votre fiche précisément, changeront le plus de choses.${notVerifiedCount ? ` Les ${notVerifiedCount} point${notVerifiedCount > 1 ? "s" : ""} « à confirmer » ne sont vérifiables que depuis l'intérieur du compte Google Business — c'est la première chose que couvre l'Audit complet.` : ""}</p>
      <div class="next-hint">Page suivante : vos trois priorités <b>→</b></div>
      ${footer(model, "Page 3/6")}
    </section>
  `;
}

// Cartes de priorité — reprend rendrePriorite() : priority-kicker,
// priority-title, priority-flow (Observation → Ce que voit votre client →
// Action immédiate + résultat attendu + temps estimé).
function freePriorityCard(item) {
  return `
    <article class="priority-card">
      <div class="priority-card-head">
        <div class="priority-kicker">Priorité ${safeNumber(item.rank)}</div>
        <span class="priority-kicker priority-kicker--impact">${safeLabel(item.impact)}</span>
      </div>
      <h3 class="priority-title">${safeText(item.title)}</h3>
      <div class="priority-flow">
        <div class="priority-step priority-step--observation">
          <div class="priority-step-label">Observation</div>
          <p>${safeText(item.observed)}</p>
        </div>
        <div class="priority-arrow">↓</div>
        <div class="priority-step priority-step--client">
          <div class="priority-step-label">Ce que voit votre client</div>
          <p>${safeText(item.prospectView)}</p>
        </div>
        <div class="priority-arrow">↓</div>
        <div class="priority-step priority-step--action">
          <div class="priority-step-label">Action immédiate</div>
          <p>${safeText(item.firstAction)}</p>
          ${present(item.expectedResult) ? `<p class="priority-resultat"><b>Résultat attendu :</b> ${safeText(item.expectedResult)}</p>` : ""}
          <span class="priority-time">Temps estimé : ${safeText(item.estimatedTime)}</span>
        </div>
      </div>
    </article>
  `;
}

// Page 4 — comme dans le générateur historique (prioritesPage4), seules les
// DEUX premières priorités figurent ici ; la troisième est page 5, avec la
// synthèse des bénéfices (mêmes pages que le PDF Fischer validé).
function freePrioritiesSection(model) {
  const items = (model.freeDiagnostic?.priorities || []).slice(0, 2);
  return `
    <section class="page page-priorities" data-free-page="4">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 4 · VOS TROIS PRIORITÉS</div>
      <h1>Par où commencer</h1>
      <div class="priority-list">
        ${items.length ? items.map(freePriorityCard).join("") : `<p class="empty">Nous n'avons pas trouvé de priorité majeure : votre fiche est remarquablement bien tenue.</p>`}
      </div>
      <div class="next-hint">Page suivante : votre troisième priorité, et ce qu'elle peut changer <b>→</b></div>
      ${footer(model, "Page 4/6")}
    </section>
  `;
}

const AUDIT_COMPLET_ITEMS = [
  "Cohérence des catégories",
  "Stratégie d'avis",
  "SEO local",
  "Optimisation des services",
  "Questions / réponses (FAQ)",
  "Publications",
  "Photos",
  "Mots-clés",
  "Liens d'action (devis, RDV)",
  "Signaux de confiance",
];

// Icônes de bénéfice (page 5) : un choix simple par nature d'impact, sans
// inventer de nouvelle catégorisation ("famille") comme le faisait l'ancien
// pipeline — seul l'impact déjà calculé (item.impact) est réutilisé.
const BENEFIT_ICON_BY_IMPACT = {
  visibility: "trend",
  trust: "shield",
  conversion: "spark",
};

function freeBenefitCard(item) {
  const iconName = BENEFIT_ICON_BY_IMPACT[item.impact] || "spark";
  return `
    <div class="benefit-card">
      <b>${icon(iconName)}<span>${safeLabel(item.impact)}</span></b>
      ${safeText(item.expectedResult)}
    </div>
  `;
}

function freeResolutionSection(model) {
  const free = model.freeDiagnostic || {};
  const priorities = free.priorities || [];
  const thirdPriority = priorities[2];
  const reportLabel = model.vocabulary?.reportLabel || "Diagnostic Efficia™";

  return `
    <section class="page page-benefits" data-free-page="5">
      ${header(reportLabel)}
      <div class="chapitre">ÉTAPE 5 · COMMENT LES RÉSOUDRE</div>
      ${thirdPriority
        ? freePriorityCard(thirdPriority)
        : `<div class="bloc-item"><div class="t">Dernier ajustement</div><div class="d">Votre fiche ne demande pas de troisième chantier prioritaire. La meilleure suite consiste à consolider les deux actions précédentes et à vérifier les points restés à confirmer.</div></div>`}
      <h2 class="section-h2">Ce que ces trois priorités peuvent améliorer</h2>
      <div class="benefit-grid">
        ${priorities.length ? priorities.map(freeBenefitCard).join("") : ""}
      </div>
      <div class="paid-audit-box">
        <h3>Ce diagnostic gratuit couvre uniquement les freins visibles de l'extérieur.</h3>
        <p>${safeText(reportLabel)} analyse les signaux publiquement observables. L'Audit Efficia™ complet analyse plus de 40 critères supplémentaires, notamment :</p>
        <div class="teaser-grid">
          ${AUDIT_COMPLET_ITEMS.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        <p class="teaser-more">…et de nombreux autres critères ayant un impact direct sur votre visibilité.</p>
      </div>
      <div class="next-hint">Page suivante : deux façons de passer à l'action <b>→</b></div>
      ${footer(model, "Page 5/6")}
    </section>
  `;
}

function freeOfferCard({ badge, title, price, features, cta, recommended }) {
  return `
    <article class="offer-card${recommended ? " offer-recommended" : ""}">
      <span class="offer-badge">${escapeHtml(badge)}</span>
      <h3>${escapeHtml(title)}</h3>
      <div class="offer-price">${escapeHtml(price)}</div>
      <ul class="offer-features">
        ${features.map((item) => `<li>${icon("check")}<span>${escapeHtml(item)}</span></li>`).join("")}
      </ul>
      <div class="offer-cta">${escapeHtml(cta)}</div>
    </article>
  `;
}

function freeActionSection(model) {
  const hero = model.hero || {};
  const free = model.freeDiagnostic || {};
  const showProjection = Number.isFinite(free.projectedScore) && free.projectedScore > (Number(hero.score) || 0) + 2;
  return `
    <section class="page final-page page-offers" data-free-page="6">
      ${header(model.vocabulary?.reportLabel)}
      <div class="chapitre">ÉTAPE 6 · PASSER À L'ACTION</div>
      <h1>Deux façons d'améliorer votre fiche</h1>
      <p class="rapport-subtitle">Vous pouvez appliquer ces trois priorités vous-même, ou confier à Efficia l'ensemble des optimisations de la fiche de ${safeText(hero.businessName, "votre entreprise")}.</p>
      ${showProjection ? `
        <div class="projection-grid">
          <div class="proj-col"><span>Votre score aujourd'hui</span><strong>${safeNumber(hero.score)}/100</strong></div>
          <div class="proj-fleche">${icon("arrow")}</div>
          <div class="proj-col"><span>Score projeté après optimisation</span><strong>${safeNumber(free.projectedScore)}/100</strong></div>
        </div>
      ` : ""}
      <div class="choice-note">Le Pack permet de corriger immédiatement les priorités détectées, sans que vous ayez à modifier la fiche vous-même.</div>
      <div class="offer-grid">
        ${freeOfferCard({
          badge: "Je le fais moi-même",
          title: "Audit Efficia complet",
          price: "99 €",
          features: [
            "Analyse complète — plus de 40 critères passés en revue",
            "Plan d'action détaillé, prêt à appliquer",
            "Ordre précis des priorités",
            "Recommandations point par point",
          ],
          cta: "Recevoir l'Audit complet — 99 €",
        })}
        ${freeOfferCard({
          badge: "Efficia s'occupe de tout",
          title: "Pack Visibilité Google",
          price: "349 €",
          features: [
            "Optimisation complète de votre fiche par nos soins",
            "Description, services et catégories retravaillés",
            "Parcours de collecte d'avis mis en place",
            "Validation finale avec vous avant publication",
          ],
          cta: "Choisir le Pack — 349 €",
          recommended: true,
        })}
      </div>
      ${footer(model, "Page 6/6")}
    </section>
  `;
}

export function renderFreeDiagnosticHtml(documentModel = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(documentModel.vocabulary?.reportLabel || "Diagnostic Efficia")} - ${safeText(documentModel.hero?.businessName || "Analyse")}</title>
  ${styles()}
</head>
<body>
  <main class="report-shell free-diagnostic">
    ${freeSituationSection(documentModel)}
    ${freeScoreExplanationSection(documentModel)}
    ${freeCriteriaSection(documentModel)}
    ${freePrioritiesSection(documentModel)}
    ${freeResolutionSection(documentModel)}
    ${freeActionSection(documentModel)}
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------------------ */
/* Routeur — seul point qui choisit entre les deux renderers.               */
/* ------------------------------------------------------------------------ */

export function renderAnalysisHtml(documentModel = {}) {
  return documentModel?.reportType === "free"
    ? renderFreeDiagnosticHtml(documentModel)
    : renderPremiumAuditHtml(documentModel);
}

function styles() {
  return `
    <style>
      :root {
        --blue: ${EFFICIA_BLUE};
        --blue-soft: #eff6ff;
        --ink: #071a3d;
        --muted: #64748b;
        --soft: #f8fafc;
        --line: #e2e8f0;
        --green: #167a4a;
        --green-soft: #eef8f1;
        --orange: #b45309;
        --orange-soft: #fff7ed;
        --red: #dc2626;
        --white: #ffffff;
      }

      * { box-sizing: border-box; }

      html { scroll-behavior: auto; }

      body {
        margin: 0;
        color: var(--ink);
        background: #f6f9ff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 1.6;
      }

      .page {
        position: relative;
        width: min(1120px, calc(100% - 40px));
        min-height: 980px;
        margin: 32px auto;
        padding: 46px 46px 92px;
        background: var(--white);
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 30px;
        box-shadow: 0 30px 90px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }

      .doc-header,
      .doc-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 24px;
      }

      .doc-header {
        padding-bottom: 30px;
        border-bottom: 1px solid var(--line);
      }

      .doc-header > span {
        color: var(--blue);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        min-height: 42px;
      }

      .brand-logo {
        width: 184px;
        height: auto;
        display: block;
      }

      .doc-footer {
        position: absolute;
        left: 46px;
        right: 46px;
        bottom: 28px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
        color: #94a3b8;
        font-size: 12px;
        font-weight: 750;
      }

      .cover-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 390px;
        gap: 58px;
        align-items: center;
        padding: 58px 0 44px;
      }

      .eyebrow {
        margin: 0 0 14px;
        color: var(--blue);
        font-size: 13px;
        font-weight: 850;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      h1, h2, h3, p { overflow-wrap: anywhere; }

      h1 {
        margin: 0;
        max-width: 760px;
        font-size: clamp(48px, 5vw, 64px);
        line-height: 0.98;
        letter-spacing: -0.055em;
      }

      h2 {
        margin: 0;
        font-size: 32px;
        line-height: 1.08;
        letter-spacing: -0.035em;
      }

      h3 {
        margin: 0;
        font-size: 24px;
        line-height: 1.18;
        letter-spacing: -0.025em;
      }

      p {
        margin: 0;
        color: #475569;
      }

      .cover-meta {
        margin-top: 20px;
        color: var(--muted);
        font-weight: 750;
      }

      .headline {
        max-width: 760px;
        margin-top: 30px;
        color: #26364f;
        font-size: 23px;
        line-height: 1.55;
        font-weight: 750;
      }

      .score-card,
      .hero-card,
      .priority-card,
      .free-priority-card,
      .insight-card,
      .action-card,
      .method-card,
      .index-card,
      .criteria-domain-card,
      .offer-card {
        border: 1px solid var(--line);
        background: var(--white);
        border-radius: 26px;
        box-shadow: 0 18px 54px rgba(15, 23, 42, 0.055);
      }

      .score-card {
        padding: 34px 34px 30px;
        text-align: center;
        background: radial-gradient(circle at 50% 15%, rgba(37, 99, 235, 0.08), transparent 42%), linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        border-color: rgba(191, 219, 254, 0.85);
      }

      .score-gauge-wrap {
        position: relative;
        width: 278px;
        height: 278px;
        margin: 0 auto;
      }

      .score-gauge {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .score-gauge-bg,
      .score-gauge-value {
        fill: none;
        stroke-width: 12;
      }

      .score-gauge-bg { stroke: #e8eef8; }
      .score-gauge-value { stroke: var(--blue); transition: none; }

      .score-gauge-center {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        text-align: center;
      }

      .score-gauge-center strong {
        font-size: 78px;
        line-height: 0.9;
        letter-spacing: -0.06em;
      }

      .score-gauge-center span {
        margin-top: 8px;
        color: var(--muted);
        font-weight: 850;
      }

      .score-band {
        margin-top: 18px;
        color: var(--blue);
        font-size: 19px;
        font-weight: 900;
      }

      .score-label {
        display: inline-flex;
        margin-bottom: 18px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .score-interpretation {
        max-width: 300px;
        margin: 18px auto 0;
        color: #334155;
        font-size: 15px;
        line-height: 1.65;
        font-weight: 720;
      }

      .cover-bottom {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 376px;
        gap: 24px;
      }

      .hero-card {
        padding: 28px;
        display: flex;
        gap: 18px;
      }

      .hero-card h2 {
        margin-bottom: 14px;
        font-size: 28px;
      }

      .hero-card p {
        font-size: 18px;
        line-height: 1.7;
      }

      .executive-card {
        padding: 34px 38px;
        border-color: rgba(226, 232, 240, 0.62);
        box-shadow: none;
      }

      .executive-card p:not(.letter-label) {
        max-width: 720px;
        color: #26364f;
        font-size: 19px;
        line-height: 1.85;
      }

      .letter-label {
        margin-bottom: 10px;
        color: var(--blue);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .cover-side {
        display: grid;
        gap: 16px;
      }

      .card-icon {
        flex: 0 0 44px;
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        color: var(--blue);
        background: var(--blue-soft);
      }

      .potential-card {
        display: block;
        border-color: rgba(226, 232, 240, 0.72);
        box-shadow: none;
      }

      .potential-top,
      .potential-score {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 18px;
      }

      .potential-top span,
      .potential-title {
        color: var(--muted);
        font-size: 13px;
        font-weight: 850;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .potential-top strong {
        color: #f59e0b;
        letter-spacing: 0.04em;
      }

      .potential-score {
        margin-top: 18px;
      }

      .potential-score strong {
        font-size: 46px;
        line-height: 1;
        letter-spacing: -0.05em;
      }

      .potential-score span {
        color: var(--ink);
        font-size: 18px;
        font-weight: 850;
      }

      .potential-title { margin-top: 22px; }

      .driver-list {
        display: grid;
        gap: 10px;
        margin: 14px 0 18px;
        padding: 0;
        list-style: none;
      }

      .driver-list li {
        display: flex;
        gap: 10px;
        align-items: center;
        color: #334155;
        font-weight: 780;
      }

      .driver-list svg { color: var(--blue); }

      small {
        display: block;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1.45;
      }

      .method-proof-card {
        padding: 20px 22px;
        border-radius: 24px;
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, 0.72);
      }

      .method-proof-card p {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .method-proof-card ul {
        display: grid;
        gap: 10px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
      }

      .method-proof-card li {
        display: flex;
        gap: 10px;
        align-items: center;
        color: #26364f;
        font-size: 14px;
        font-weight: 780;
      }

      .method-proof-card svg {
        color: var(--blue);
      }

      .section-intro,
      .section-lead {
        max-width: 760px;
      }

      .section-intro {
        padding: 54px 0 30px;
      }

      .section-lead {
        margin-top: 20px;
        font-size: 18px;
        line-height: 1.65;
      }

      .section-intro p:not(.eyebrow) {
        margin-top: 16px;
        font-size: 18px;
        line-height: 1.65;
      }

      .positive .eyebrow { color: var(--green); }

      .priority-list,
      .stack,
      .timeline {
        display: grid;
        gap: 18px;
      }

      .priority-card,
      .free-priority-card {
        display: grid;
        grid-template-columns: 150px 1fr;
        padding: 0;
        overflow: hidden;
      }

      .priority-rank {
        display: grid;
        place-items: center;
        min-height: 210px;
        color: var(--blue);
        background: var(--blue-soft);
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        text-align: center;
        padding: 18px;
      }

      .priority-body {
        padding: 28px;
      }

      .priority-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-top: 22px;
      }

      .priority-grid div {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--soft);
      }

      .priority-grid span,
      .column-title {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .priority-grid p {
        margin-top: 8px;
        color: #243044;
        font-weight: 700;
      }

      .priority-meta {
        display: flex;
        gap: 24px;
        margin-top: 18px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 800;
      }

      .card-grid,
      .split-grid,
      .method-grid {
        display: grid;
        gap: 22px;
      }

      .card-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .split-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .method-grid {
        grid-template-columns: 1fr;
      }

      .insight-card,
      .method-card {
        padding: 26px;
      }

      .insight-card .card-icon {
        margin-bottom: 18px;
      }

      .insight-card p,
      .method-card p {
        margin-top: 14px;
      }

      .strength-card {
        border-color: #c8ead5;
        background: linear-gradient(180deg, #ffffff, #f8fffb);
      }

      .strength-card .card-icon {
        color: var(--green);
        background: var(--green-soft);
      }

      .weakness-card {
        background: #ffffff;
      }

      .opportunity-card {
        border-color: #fed7aa;
        background: linear-gradient(180deg, #ffffff, #fffaf5);
      }

      .opportunity-card .card-icon {
        color: var(--orange);
        background: var(--orange-soft);
      }

      .proof {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
        font-weight: 780;
      }

      .column-title {
        margin: 0 0 14px;
      }

      .timeline {
        position: relative;
        padding-left: 34px;
      }

      .timeline::before {
        content: "";
        position: absolute;
        left: 15px;
        top: 20px;
        bottom: 20px;
        width: 2px;
        background: #d7e5ff;
      }

      .action-card {
        position: relative;
        display: grid;
        grid-template-columns: 46px 1fr;
        gap: 18px;
        padding: 24px;
        box-shadow: none;
      }

      .timeline-dot {
        position: relative;
        z-index: 1;
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        color: var(--blue);
        background: #edf4ff;
        font-weight: 900;
      }

      .action-content dl {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 18px 0 0;
      }

      .action-content dl div {
        padding: 13px;
        border-radius: 16px;
        background: var(--soft);
      }

      dt {
        color: var(--muted);
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      dd {
        margin: 6px 0 0;
        color: #243044;
        font-weight: 820;
      }

      .final-page .section-intro {
        max-width: 860px;
      }

      .method-card {
        box-shadow: none;
        background: var(--soft);
      }

      .empty {
        margin: 0;
        padding: 20px;
        border: 1px dashed var(--line);
        border-radius: 18px;
        color: var(--muted);
      }

      /* — Point 11 (Sprint 1, 2026-07-31) : comparaison VOUS / Meilleure     */
      /*   fiche observée, sur la page de couverture.                       */
      .comparison-card {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 28px;
        margin: 0 0 28px;
        padding: 26px 30px;
        border: 1px solid var(--line);
        border-radius: 26px;
        background: var(--soft);
      }

      .comparison-col { text-align: center; }

      .comparison-divider {
        width: 1px;
        align-self: stretch;
        background: var(--line);
      }

      .comparison-label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .comparison-stars {
        margin-top: 10px;
        color: #f59e0b;
        font-size: 20px;
        letter-spacing: 0.06em;
      }

      .comparison-rating {
        margin-top: 6px;
        color: var(--ink);
        font-size: 30px;
        font-weight: 900;
        letter-spacing: -0.03em;
      }

      .comparison-meta {
        margin-top: 8px;
        color: #334155;
        font-size: 14px;
        font-weight: 780;
      }

      .comparison-note {
        margin-top: 4px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
      }

      .comparison-name {
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 780;
      }

      .comparison-rank {
        margin: 0 0 28px;
        color: #334155;
        font-size: 15px;
        font-weight: 780;
      }

      /* — Point 3 (Sprint 1, 2026-07-31) : score par domaine, page "Axes    */
      /*   d'amélioration" — passthrough du Score Efficia déjà calculé.      */
      .domains-block {
        margin-bottom: 30px;
      }

      .domain-list {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }

      .domain-row {
        display: grid;
        grid-template-columns: 180px 1fr 64px;
        align-items: center;
        gap: 14px;
      }

      .domain-label {
        color: #26364f;
        font-size: 14px;
        font-weight: 780;
      }

      .domain-bar-track {
        height: 10px;
        border-radius: 999px;
        background: #e8eef8;
        overflow: hidden;
      }

      .domain-bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--blue);
      }

      .domain-value {
        text-align: right;
        color: var(--muted);
        font-size: 13px;
        font-weight: 850;
      }

      /* ------------------------------------------------------------------ */
      /* Diagnostic Efficia gratuit — port fidèle du générateur historique   */
      /* (commit a9e3241, outil-score-efficia-auto-v5.html, archivé sous     */
      /* archive/ancien-diagnostic-efficia-v5.html). Tout est scopé sous     */
      /* .free-diagnostic : aucune règle premium ci-dessus n'est modifiée.   */
      /* Les couleurs réutilisent les tokens --green/--blue/--orange/--red   */
      /* déjà partagés (mêmes teintes que statutDomaine()/styleIndice()      */
      /* historiques : vert/bleu/orange/rouge), plutôt que de dupliquer des  */
      /* valeurs hexadécimales, pour rester cohérent avec les critères.      */
      /* ------------------------------------------------------------------ */

      /* — Pages A4 physiques (width/height/page-break), comme l'ancien      */
      /*   générateur : chaque .page est un feuillet A4 complet.            */
      /* Marge verticale corrigée : haut 13mm / bas 14mm (au lieu de 20mm),  */
      /* dans la fourchette professionnelle demandée (haut 12-16mm, bas      */
      /* 10-14mm) — ne touche pas à la marge horizontale (16mm, inchangée).  */
      .free-diagnostic .page {
        width: 210mm;
        height: 297mm;
        min-height: 0;
        margin: 0 auto 24px;
        padding: 13mm 16mm 14mm;
        border-radius: 8px;
        box-sizing: border-box;
        /* Écran uniquement : overflow visible pour pouvoir inspecter les     */
        /* débordements pendant le développement. Le print reste en hidden   */
        /* (règle explicite dans @media print ci-dessous).                   */
        overflow: visible;
      }

      /* Espace entre l'en-tête (logo + libellé) et le chapitre : le        */
      /* padding-bottom partagé (.doc-header, 30px ≈ 8mm, utilisé aussi par  */
      /* le premium) est réduit ICI uniquement pour le gratuit, sans changer */
      /* la règle .doc-header elle-même.                                    */
      .free-diagnostic .doc-header {
        padding-bottom: 14px;
      }

      /* Logo : le ratio naturel du SVG (viewBox 1536x864) est correct — le  */
      /* problème est que .brand-logo (partagé, non modifié ici) l'affiche   */
      /* en largeur:184px/height:auto SANS plafond de hauteur, ce qui rend   */
      /* le bloc logo ~103px de haut au lieu des ~52px historiques           */
      /* (.rapport-logo img,.report-logo{width:170px;height:auto;            */
      /* max-height:52px;object-fit:contain}), et gonfle donc l'en-tête sur  */
      /* les 6 pages. On restaure ici exactement ces dimensions historiques, */
      /* uniquement pour le gratuit (object-fit:contain conserve le ratio    */
      /* naturel, aucun transform/scale, aucune hauteur fixe concurrente).   */
      .free-diagnostic .brand-logo {
        width: 170px;
        height: auto;
        max-height: 52px;
        object-fit: contain;
        display: block;
      }

      .free-diagnostic h1,
      .free-diagnostic h2,
      .free-diagnostic h3 {
        overflow-wrap: anywhere;
      }

      /* — Chapitre (repère d'étape) : reprend .chapitre — libellé + filet    */
      /*   horizontal, distinct du .eyebrow premium (non touché).           */
      .free-diagnostic .chapitre {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--blue);
      }

      .free-diagnostic .chapitre::after {
        content: "";
        flex: 1;
        height: 1px;
        background: var(--line);
      }

      .free-diagnostic h1 {
        font-size: clamp(30px, 3.4vw, 40px);
        line-height: 1.05;
        letter-spacing: -0.03em;
        margin: 0 0 8px;
      }

      .free-diagnostic h2 {
        font-size: 22px;
        line-height: 1.15;
      }

      .free-diagnostic .rapport-subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .free-diagnostic .rapport-note {
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      .free-diagnostic .next-hint {
        margin-top: 10px;
        text-align: right;
        font-size: 11px;
        font-weight: 700;
        color: var(--muted);
      }

      .free-diagnostic .next-hint b { color: var(--blue); font-weight: 800; }

      /* — Statuts (indices / domaines) : couleurs partagées avec les        */
      /*   critères (status-compliant etc.), seuils historiques exacts.     */
      .status-good { border-color: #c8ead5; background: var(--green-soft); }
      .status-good .index-label,
      .status-good .index-value,
      .status-good .ligne { color: var(--green); }
      .status-good .barre-rempli { background: var(--green); }
      .status-good .statut-domaine,
      .status-good .index-status { color: var(--green); background: var(--green-soft); }

      .status-ok { border-color: #bfdbfe; background: var(--blue-soft); }
      .status-ok .index-label,
      .status-ok .index-value,
      .status-ok .ligne { color: var(--blue); }
      .status-ok .barre-rempli { background: var(--blue); }
      .status-ok .statut-domaine,
      .status-ok .index-status { color: var(--blue); background: var(--blue-soft); }

      .status-warn { border-color: #fed7aa; background: var(--orange-soft); }
      .status-warn .index-label,
      .status-warn .index-value,
      .status-warn .ligne { color: var(--orange); }
      .status-warn .barre-rempli { background: var(--orange); }
      .status-warn .statut-domaine,
      .status-warn .index-status { color: var(--orange); background: var(--orange-soft); }

      .status-bad { border-color: #fecaca; background: #fef2f2; }
      .status-bad .index-label,
      .status-bad .index-value,
      .status-bad .ligne { color: var(--red); }
      .status-bad .barre-rempli { background: var(--red); }
      .status-bad .statut-domaine,
      .status-bad .index-status { color: var(--red); background: #fef2f2; }

      /* — Page 1 : score-hero (jauge + verdict), repris de .score-hero. */
      .free-diagnostic .score-hero {
        display: grid;
        grid-template-columns: 190px 1fr;
        gap: 22px;
        align-items: center;
        margin-top: 10px;
      }

      .free-diagnostic .score-gauge-wrap {
        width: 170px;
        height: 170px;
      }

      .free-diagnostic .score-potential {
        margin-top: 6px;
        text-align: center;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
      }

      .free-diagnostic .score-potential span { color: var(--ink); }

      .free-diagnostic .score-mini-story {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 4px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 800;
      }

      .free-diagnostic .score-mini-story b { color: var(--ink); font-size: 15px; }

      .free-diagnostic .score-level {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 800;
        background: var(--soft);
        border: 1px solid var(--line);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .free-diagnostic .score-level i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }

      .free-diagnostic .score-direct {
        margin-top: 7px;
        font-size: 16px;
        font-weight: 800;
        line-height: 1.38;
        color: var(--ink);
      }

      .free-diagnostic .hero-analysis-text {
        margin-top: 7px;
        font-size: 12.5px;
        line-height: 1.5;
        color: #44546a;
      }

      .free-diagnostic .index-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 10px;
      }

      .free-diagnostic .index-card {
        padding: 12px 14px;
        text-align: center;
        border: 1px solid var(--line);
        background: var(--white);
        border-radius: 14px;
      }

      .free-diagnostic .index-label {
        display: block;
        color: var(--muted);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .free-diagnostic .index-value {
        display: block;
        margin-top: 6px;
        font-size: 24px;
        letter-spacing: -0.03em;
      }

      .free-diagnostic .index-value small {
        display: inline;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
      }

      .free-diagnostic .index-status {
        display: inline-block;
        margin-top: 6px;
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* — "Ce qu'il faut en retenir" : .meaning-box / .summary-line, repris  */
      /*   à l'identique de significationV2().                              */
      .free-diagnostic .meaning-box {
        margin-top: 9px;
        padding: 11px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--soft);
      }

      .free-diagnostic .meaning-box h3 { font-size: 14px; margin-bottom: 6px; }

      .free-diagnostic .meaning-box ul {
        display: grid;
        gap: 3px;
        margin: 6px 0 0;
        padding: 0;
        list-style: none;
      }

      .free-diagnostic .summary-line {
        display: flex;
        gap: 9px;
        align-items: flex-start;
        font-size: 12px;
        line-height: 1.4;
        color: #26364f;
      }

      .free-diagnostic .summary-icon {
        flex: 0 0 auto;
        min-width: 16px;
        height: 16px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 10px;
        margin-top: 1px;
      }

      .free-diagnostic .summary-icon--ok { color: var(--green); background: var(--green-soft); }
      .free-diagnostic .summary-icon--warning { color: var(--orange); background: var(--orange-soft); }
      .free-diagnostic .summary-icon--unknown { color: var(--muted); background: var(--line); }

      .free-diagnostic .methode-note {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 10.5px;
        line-height: 1.5;
      }

      /* — Page 2 : jauges de domaine, repris de .barre-cat/.statut-domaine/  */
      /*   .barre-fond/.barre-rempli (statutDomaine()).                      */
      .free-diagnostic .domain-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .free-diagnostic .barre-cat {
        padding: 10px 14px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--white);
      }

      .free-diagnostic .ligne {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 10px;
        align-items: center;
        font-size: 13px;
        font-weight: 800;
        color: #26364f;
      }

      .free-diagnostic .statut-domaine {
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 10px;
        font-weight: 850;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .free-diagnostic .barre-fond {
        margin-top: 7px;
        height: 9px;
        border-radius: 999px;
        background: #e8eef8;
        overflow: hidden;
      }

      .free-diagnostic .barre-rempli {
        height: 100%;
        border-radius: 999px;
        background: var(--blue);
      }

      /* — Page 3 : synthèse des critères, repris de .chk-grid/.chk-rubrique/ */
      /*   .chk-item/.chk-ic/.chk-compteur/.chk-legend (checklistHtml()).     */
      .free-diagnostic .chk-compteur {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 9px 0 1px;
      }

      .free-diagnostic .count-tag {
        padding: 6px 13px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 850;
        border: 1px solid var(--line);
      }

      .status-compliant { color: var(--green); background: var(--green-soft); border-color: #c8ead5; }
      .status-partial { color: var(--orange); background: var(--orange-soft); border-color: #fed7aa; }
      .status-deficient { color: var(--red); background: #fef2f2; border-color: #fecaca; }
      .status-not_verified { color: var(--muted); background: var(--soft); border-color: var(--line); }

      .free-diagnostic .chk-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 11px;
        margin-top: 10px;
      }

      .free-diagnostic .chk-rubrique {
        padding: 10px 13px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--white);
      }

      .free-diagnostic .chk-rubrique h3 {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        font-size: 12.5px;
        margin-bottom: 8px;
        color: var(--ink);
      }

      .free-diagnostic .chk-rubrique h3 span {
        font-size: 10px;
        font-weight: 700;
        color: var(--muted);
      }

      .free-diagnostic .chk-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 11px;
        line-height: 1.38;
        color: #334155;
        padding: 3px 0;
      }

      .free-diagnostic .chk-ic {
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        min-width: 14px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: 900;
        margin-top: 1px;
      }

      .free-diagnostic .chk-ic.chk-ok { color: var(--green); background: var(--green-soft); }
      .free-diagnostic .chk-ic.chk-warn { color: var(--orange); background: var(--orange-soft); }
      .free-diagnostic .chk-ic.chk-ko { color: var(--red); background: #fef2f2; }
      .free-diagnostic .chk-ic.chk-unknown { color: var(--muted); background: var(--soft); }

      .free-diagnostic .chk-legend {
        margin-top: 7px;
        padding: 6px 10px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--soft);
        color: var(--muted);
        font-size: 10.5px;
      }

      .free-diagnostic .chk-legend .chk-ok { color: var(--green); font-weight: 900; }
      .free-diagnostic .chk-legend .chk-warn { color: var(--orange); font-weight: 900; }
      .free-diagnostic .chk-legend .chk-ko { color: var(--red); font-weight: 900; }
      .free-diagnostic .chk-legend .chk-unknown { color: var(--muted); font-weight: 900; }

      /* — Pages 4/5 : cartes de priorité, reprises de .priority-card/         */
      /*   .priority-kicker/.priority-title/.priority-flow/.priority-step*/   */
      /*   .priority-arrow/.priority-resultat/.priority-time (rendrePriorite()). */
      .free-diagnostic .priority-list {
        display: grid;
        gap: 8px;
      }

      /* Valeurs par défaut = historique .page-priorites (page 4, 2 cartes). */
      /* .page-benefits (page 5, 1 carte) reçoit les valeurs plus généreuses */
      /* de l'historique .page-plan un peu plus bas.                        */
      .free-diagnostic .priority-card {
        border: 1px solid var(--line);
        background: var(--white);
        border-radius: 16px;
        padding: 10px 14px;
        margin-top: 4px;
      }

      .free-diagnostic .page-benefits .priority-card {
        padding: 14px 16px;
        margin-top: 6px;
      }

      .free-diagnostic .priority-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
      }

      .free-diagnostic .page-benefits .priority-card-head {
        margin-bottom: 10px;
      }

      .free-diagnostic .priority-kicker {
        display: inline-flex;
        border-radius: 999px;
        background: var(--blue-soft);
        color: var(--blue);
        border: 1px solid #dce8fa;
        padding: 4px 10px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .free-diagnostic .priority-kicker--impact {
        background: var(--soft);
        color: var(--muted);
        border-color: var(--line);
      }

      .free-diagnostic .priority-title {
        margin: 0 0 3px;
        font-size: 17px;
        font-weight: 850;
        line-height: 1.2;
        letter-spacing: -0.02em;
        color: var(--ink);
      }

      .free-diagnostic .page-benefits .priority-title {
        margin: 0 0 6px;
      }

      .free-diagnostic .priority-flow {
        display: grid;
        gap: 3px;
      }

      .free-diagnostic .priority-step {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 7px 11px;
        background: #fbfcfe;
      }

      .free-diagnostic .page-benefits .priority-step {
        padding: 9px 12px;
      }

      .free-diagnostic .priority-step--observation {
        background: var(--blue-soft);
        border-left: 4px solid var(--blue);
      }

      .free-diagnostic .priority-step--action {
        background: var(--green-soft);
        border-left: 4px solid var(--green);
      }

      .free-diagnostic .priority-step-label {
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 3px;
      }

      .free-diagnostic .page-benefits .priority-step-label {
        margin-bottom: 4px;
      }

      .free-diagnostic .priority-step--observation .priority-step-label { color: var(--blue); }
      .free-diagnostic .priority-step--action .priority-step-label { color: var(--green); }

      .free-diagnostic .priority-step p {
        margin: 0;
        font-size: 11.5px;
        line-height: 1.38;
        color: #44546a;
      }

      .free-diagnostic .page-benefits .priority-step p {
        line-height: 1.45;
      }

      .free-diagnostic .priority-step--action p { color: var(--ink); font-weight: 700; }

      .free-diagnostic .priority-arrow {
        display: flex;
        justify-content: center;
        color: #b9c6d8;
        font-weight: 700;
        padding: 0;
      }

      .free-diagnostic .page-benefits .priority-arrow {
        padding: 1px 0;
      }

      .free-diagnostic .priority-resultat {
        margin: 4px 0 0;
        font-size: 10.5px;
        line-height: 1.38;
        color: #44546a;
        font-weight: 500;
      }

      .free-diagnostic .page-benefits .priority-resultat {
        margin-top: 5px;
        line-height: 1.45;
      }

      .free-diagnostic .priority-resultat b { color: var(--ink); font-weight: 800; }

      .free-diagnostic .priority-time {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 9.5px;
        font-weight: 700;
      }

      .free-diagnostic .page-benefits .priority-time {
        margin-top: 6px;
      }

      /* — Page 5 : bénéfices + rappel des limites, repris de .benefit-grid/  */
      /*   .benefit-card et .paid-audit-box/.teaser-grid/.teaser-more.        */
      .free-diagnostic .section-h2 {
        margin: 12px 0 5px;
        font-size: 15px;
      }

      .free-diagnostic .benefit-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 8px;
      }

      .free-diagnostic .benefit-card {
        border: 1px solid var(--line);
        background: #fbfcfe;
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 11px;
        color: #5b6b81;
        line-height: 1.4;
      }

      .free-diagnostic .benefit-card b {
        display: flex;
        gap: 6px;
        align-items: center;
        color: var(--ink);
        font-size: 12px;
        margin-bottom: 4px;
      }

      .free-diagnostic .benefit-card b svg { color: var(--blue); flex: 0 0 auto; }

      .free-diagnostic .paid-audit-box {
        margin-top: 11px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: linear-gradient(180deg, #fbfdff, #f4f8fe);
        color: #44546a;
        font-size: 11.5px;
        line-height: 1.5;
      }

      .free-diagnostic .paid-audit-box h3 {
        font-size: 13.5px;
        color: var(--ink);
        margin-bottom: 7px;
      }

      .free-diagnostic .teaser-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px 18px;
        margin-top: 8px;
      }

      .free-diagnostic .teaser-grid span {
        display: flex;
        gap: 6px;
        align-items: baseline;
        font-size: 10.5px;
        color: #44546a;
      }

      .free-diagnostic .teaser-grid span::before {
        content: "✓";
        color: var(--green);
        font-weight: 900;
        font-size: 9px;
      }

      .free-diagnostic .teaser-more {
        margin-top: 8px;
        font-size: 10.5px;
        font-style: italic;
        color: var(--muted);
      }

      /* — Page 6 : projection + offres, reprises de .projection-grid/       */
      /*   .proj-col/.proj-fleche et .offer-grid/.offer-card.                 */
      .free-diagnostic .projection-grid {
        display: grid;
        grid-template-columns: 1fr 50px 1fr;
        align-items: center;
        gap: 12px;
        margin-top: 7px;
        padding: 8px;
        border: 1px solid var(--line);
        border-radius: 13px;
        background: var(--green-soft);
      }

      .free-diagnostic .proj-col { text-align: center; }

      .free-diagnostic .proj-col span {
        display: block;
        color: var(--muted);
        font-size: 10.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .free-diagnostic .proj-col strong {
        display: block;
        margin-top: 6px;
        font-size: 26px;
        letter-spacing: -0.03em;
      }

      .free-diagnostic .proj-fleche {
        display: flex;
        justify-content: center;
        color: var(--green);
      }

      .free-diagnostic .choice-note {
        margin-top: 5px;
        padding: 6px 10px;
        border: 1px solid var(--line);
        background: #fbfcfe;
        border-radius: 12px;
        text-align: center;
        color: #44546a;
        font-size: 11.5px;
        font-weight: 700;
      }

      .free-diagnostic .offer-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 5px;
      }

      .free-diagnostic .offer-card {
        padding: 12px 13px;
      }

      .free-diagnostic .offer-recommended {
        border-color: var(--blue);
        box-shadow: 0 18px 54px rgba(37, 99, 235, 0.12);
      }

      .free-diagnostic .offer-badge {
        display: inline-flex;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--blue-soft);
        color: var(--blue);
        font-size: 10px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .free-diagnostic .offer-card h3 {
        margin-top: 5px;
        font-size: 17px;
      }

      .free-diagnostic .offer-price {
        margin-top: 4px;
        font-size: 26px;
        font-weight: 900;
        letter-spacing: -0.03em;
        color: var(--ink);
      }

      .free-diagnostic .offer-features {
        display: grid;
        gap: 6px;
        margin: 8px 0 0;
        padding: 0;
        list-style: none;
      }

      .free-diagnostic .offer-features li {
        display: flex;
        gap: 8px;
        align-items: center;
        color: #26364f;
        font-size: 11px;
        font-weight: 700;
      }

      .free-diagnostic .offer-features svg { color: var(--blue); flex: 0 0 auto; }

      .free-diagnostic .offer-cta {
        margin-top: 8px;
        padding: 7px 14px;
        border-radius: 12px;
        background: var(--blue);
        color: #ffffff;
        text-align: center;
        font-size: 11.5px;
        font-weight: 850;
      }

      .free-diagnostic .bloc-item {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 11px 14px;
        background: var(--white);
      }

      .free-diagnostic .bloc-item .t { font-weight: 800; font-size: 12px; color: var(--ink); }
      .free-diagnostic .bloc-item .d { color: #5b6b81; font-size: 11.5px; margin-top: 4px; line-height: 1.5; }

      @media (max-width: 900px) {
        .page {
          width: min(100% - 24px, 760px);
          min-height: auto;
          padding: 28px;
          border-radius: 24px;
        }

        .doc-footer {
          position: static;
          margin-top: 38px;
        }

        .cover-grid,
        .cover-bottom,
        .split-grid,
        .card-grid,
        .priority-card,
        .action-content dl,
        .index-row,
        .offer-grid {
          grid-template-columns: 1fr;
        }

        h1 { font-size: 42px; }
        h2 { font-size: 28px; }

        .free-diagnostic .page {
          width: 100%;
          height: auto;
        }

        .free-diagnostic .score-hero,
        .free-diagnostic .chk-grid,
        .free-diagnostic .benefit-grid,
        .free-diagnostic .projection-grid,
        .free-diagnostic .offer-grid {
          grid-template-columns: 1fr;
        }
      }

      @page {
        size: A4;
        margin: 12mm;
      }

      @media print {
        body {
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          width: 100%;
          min-height: calc(297mm - 24mm);
          margin: 0;
          padding: 12mm 12mm 24mm;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          page-break-after: always;
          break-after: page;
        }

        /* Cause réelle des 11 pages physiques au lieu de 6 : la règle @page   */
        /* ci-dessous (margin: 12mm, partagée avec le premium, non modifiée)   */
        /* réduit la zone imprimable à 297mm − 24mm = 273mm. La règle de base  */
        /* ci-dessus fixe .free-diagnostic .page à 297mm plein — un feuillet   */
        /* qui ne tient donc jamais dans la zone imprimable réelle, d'où le    */
        /* débordement sur une seconde feuille à CHAQUE page logique. Le       */
        /* premium n'a pas ce problème : son .page d'impression utilise déjà   */
        /* min-height: calc(297mm - 24mm). On applique la même compensation    */
        /* ici, sans toucher à @page (partagé) ni à la règle premium.          */
        .free-diagnostic .page {
          height: calc(297mm - 24mm);
          max-height: calc(297mm - 24mm);
          margin: 0;
          border: none;
          border-radius: 0;
          box-shadow: none;
          page-break-after: always;
          break-after: page;
          /* Explicite en print : la base écran passe désormais à overflow:   */
          /* visible (sécurité de dev pour inspecter les débordements), donc  */
          /* ce blocage doit être réaffirmé ici pour l'impression/PDF.        */
          overflow: hidden;
        }

        .page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        .priority-card,
        .insight-card,
        .action-card,
        .method-card,
        .hero-card,
        .score-card,
        .index-card,
        .criteria-domain-card,
        .offer-card,
        .priority-grid div,
        .free-diagnostic .barre-cat,
        .free-diagnostic .chk-rubrique,
        .free-diagnostic .meaning-box,
        .free-diagnostic .priority-card,
        .free-diagnostic .priority-step,
        .free-diagnostic .paid-audit-box,
        .free-diagnostic .projection-grid,
        .free-diagnostic .benefit-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .free-diagnostic h1,
        .free-diagnostic h2,
        .free-diagnostic h3 {
          break-after: avoid;
          page-break-after: avoid;
        }

        .doc-footer {
          position: absolute;
          left: 12mm;
          right: 12mm;
          bottom: 8mm;
        }

        .free-diagnostic .doc-footer {
          left: 8mm;
          right: 8mm;
          bottom: 4mm;
        }
      }
    </style>
  `;
}
