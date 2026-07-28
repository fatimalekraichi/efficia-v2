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
      <span>${safeText(label || model.hero?.businessName || "Diagnostic Efficia")}</span>
      <span>Efficia Digital</span>
    </footer>
  `;
}

function evidenceLine(evidence) {
  if (!evidence) return "Preuve non disponible";
  const value = present(evidence.value) ? `${safeNumber(evidence.value)}${evidence.unit ? ` ${safeText(evidence.unit, "")}` : ""}` : null;
  const median = present(evidence.competitorMedian)
    ? `référence observée : ${safeNumber(evidence.competitorMedian)}${evidence.unit ? ` ${safeText(evidence.unit, "")}` : ""}`
    : null;
  return [value, median].filter(Boolean).join(" · ") || safeText(evidence.source || "Observation");
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

function heroSection(model) {
  const hero = model.hero || {};
  const potential = hero.improvementPotential || {};
  const proofItems = methodologyProofItems(model);
  return `
    <section class="page cover-page">
      ${header()}
      <div class="cover-grid">
        <div class="cover-copy">
          <p class="eyebrow">Diagnostic Google Business</p>
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
      ${header("Les 3 priorités")}
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

function limitsSection(model) {
  return `
    <section class="page">
      ${header("Axes d'amélioration")}
      <div class="section-intro">
        <p class="eyebrow">Visibilité et conversion</p>
        <h2>Ce qui limite aujourd'hui votre visibilité</h2>
        <p>Les cartes restent volontairement pédagogiques : elles expliquent ce qui peut être renforcé, sans ton alarmiste.</p>
      </div>
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
      .insight-card,
      .action-card,
      .method-card {
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

      .section-intro {
        max-width: 760px;
        padding: 54px 0 30px;
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

      .priority-card {
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
        .action-content dl {
          grid-template-columns: 1fr;
        }

        h1 { font-size: 42px; }
        h2 { font-size: 28px; }

        .priority-rank {
          min-height: auto;
          padding: 18px;
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
        .priority-grid div {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .doc-footer {
          position: absolute;
          left: 12mm;
          right: 12mm;
          bottom: 8mm;
        }
      }
    </style>
  `;
}

export function renderAnalysisHtml(documentModel = {}) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Diagnostic Efficia - ${safeText(documentModel.hero?.businessName || "Analyse")}</title>
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
