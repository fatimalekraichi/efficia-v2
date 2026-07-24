function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isPresent(value) {
  return value !== null && value !== undefined && value !== "";
}

function text(value, fallback = "Non disponible") {
  return escapeHtml(isPresent(value) ? value : fallback);
}

function number(value, fallback = "Non disponible") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return escapeHtml(fallback);
  return escapeHtml(Number.isInteger(parsed) ? parsed : parsed.toFixed(1));
}

function score(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Non disponible";
  return `${Math.round(parsed)}/100`;
}

function listSection(items, emptyText) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p class="empty">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <ul class="finding-list">
      ${items.map((item) => `
        <li>
          <strong>${text(item.signal || item.id || "Point analysé")}</strong>
          <span>${text(item.message || item.summary || item.recommendation || item)}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

function findTopCompetitorPhotos(analysis) {
  const topName = analysis?.benchmark?.topCompetitor?.name;
  const competitors = analysis?.business?.competitors;
  if (!topName || !Array.isArray(competitors)) return null;

  const match = competitors.find((competitor) => competitor?.name === topName);
  return match?.photos_count ?? match?.photosCount ?? null;
}

function renderBenchmarkRows(analysis) {
  const business = analysis?.business || {};
  const topCompetitor = analysis?.benchmark?.topCompetitor || {};
  const topPhotos = findTopCompetitorPhotos(analysis);

  const rows = [
    ["Note", number(business.rating), number(topCompetitor.rating)],
    ["Avis", number(business.reviews), number(topCompetitor.reviews)],
    ["Photos", number(business.photosCount), number(topPhotos)],
  ];

  return rows.map(([label, businessValue, competitorValue]) => `
    <tr>
      <th>${label}</th>
      <td>${businessValue}</td>
      <td>${competitorValue}</td>
    </tr>
  `).join("");
}

export function renderAnalysisHtml(analysis) {
  const business = analysis?.business || {};
  const benchmark = analysis?.benchmark || {};
  const knowledge = analysis?.knowledge || {};
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Analyse Efficia - ${text(business.name || business.nom || analysis?.analysisId, "Analyse")}</title>
  <style>
    :root {
      color-scheme: light;
      --blue: #2563eb;
      --blue-soft: #eff6ff;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --panel: #f8fafc;
      --white: #ffffff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: #f8fbff;
      line-height: 1.55;
    }

    .page {
      width: min(1080px, calc(100% - 32px));
      margin: 32px auto;
      padding: 42px;
      background: var(--white);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.6fr);
      gap: 28px;
      align-items: stretch;
      padding-bottom: 30px;
      border-bottom: 1px solid var(--line);
    }

    .eyebrow {
      margin: 0 0 12px;
      color: var(--blue);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(34px, 5vw, 56px);
      line-height: 0.98;
      letter-spacing: -0.04em;
    }

    h2 {
      margin: 0 0 18px;
      font-size: 26px;
      letter-spacing: -0.03em;
    }

    .meta {
      margin-top: 18px;
      color: var(--muted);
      font-weight: 700;
    }

    .score-card {
      padding: 24px;
      border-radius: 24px;
      background: linear-gradient(180deg, var(--blue-soft), #fff);
      border: 1px solid #bfdbfe;
    }

    .score-card strong {
      display: block;
      margin-top: 10px;
      font-size: 48px;
      line-height: 1;
      letter-spacing: -0.05em;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 18px;
    }

    .metric {
      padding: 14px;
      border-radius: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
    }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .metric strong {
      display: block;
      margin-top: 4px;
      font-size: 22px;
      letter-spacing: -0.03em;
    }

    section {
      margin-top: 34px;
    }

    .summary {
      padding: 22px 24px;
      border-radius: 22px;
      background: var(--panel);
      border: 1px solid var(--line);
      color: #334155;
      font-size: 18px;
      font-weight: 700;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
    }

    .panel {
      padding: 22px;
      border: 1px solid var(--line);
      border-radius: 22px;
      background: var(--white);
    }

    .finding-list {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .finding-list li {
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--panel);
      border: 1px solid var(--line);
    }

    .finding-list strong {
      display: block;
      margin-bottom: 4px;
      color: var(--blue);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .finding-list span {
      display: block;
      color: #334155;
      font-weight: 650;
    }

    .empty {
      margin: 0;
      color: var(--muted);
      font-weight: 650;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--white);
    }

    th, td {
      padding: 15px 16px;
      text-align: left;
      border-bottom: 1px solid var(--line);
    }

    tr:last-child th,
    tr:last-child td {
      border-bottom: 0;
    }

    thead th {
      background: var(--panel);
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    tbody th {
      width: 28%;
      color: var(--muted);
    }

    footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    @media (max-width: 760px) {
      .page {
        width: min(100% - 20px, 1080px);
        margin: 10px auto;
        padding: 24px;
        border-radius: 20px;
      }

      .hero,
      .grid,
      .metrics {
        grid-template-columns: 1fr;
      }

      footer {
        display: grid;
      }
    }

    @media print {
      body { background: #fff; }
      .page {
        width: auto;
        margin: 0;
        padding: 24mm 18mm;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">Diagnostic Efficia</p>
        <h1>${text(business.name || business.nom, "Entreprise non renseignée")}</h1>
        <p class="meta">${text(business.ville, "Ville non renseignée")} · ${text(business.activity || business.fiche?.category || business.normalized?.category, "Catégorie non renseignée")}</p>
      </div>

      <aside class="score-card" aria-label="Score benchmark">
        <span>Score Benchmark</span>
        <strong>${score(benchmark.score)}</strong>
      </aside>
    </header>

    <div class="metrics" aria-label="Indicateurs Google">
      <div class="metric">
        <span>Note Google</span>
        <strong>${number(business.rating)}</strong>
      </div>
      <div class="metric">
        <span>Nombre d'avis</span>
        <strong>${number(business.reviews)}</strong>
      </div>
      <div class="metric">
        <span>Photos</span>
        <strong>${number(business.photosCount)}</strong>
      </div>
    </div>

    <section aria-labelledby="summary-title">
      <h2 id="summary-title">Résumé exécutif</h2>
      <div class="summary">${text(knowledge.summary, "Résumé non disponible.")}</div>
    </section>

    <section class="grid" aria-label="Forces et faiblesses">
      <div class="panel">
        <h2>Forces</h2>
        ${listSection(knowledge.strengths, "Aucune force prioritaire n'a été remontée.")}
      </div>
      <div class="panel">
        <h2>Faiblesses</h2>
        ${listSection(knowledge.weaknesses, "Aucune faiblesse prioritaire n'a été remontée.")}
      </div>
    </section>

    <section class="grid" aria-label="Opportunités et priorités">
      <div class="panel">
        <h2>Opportunités prioritaires</h2>
        ${listSection(knowledge.opportunities, "Aucune opportunité prioritaire n'a été remontée.")}
      </div>
      <div class="panel">
        <h2>Priorités</h2>
        ${listSection(knowledge.top_priorities, "Aucune priorité n'a été calculée.")}
      </div>
    </section>

    <section aria-labelledby="benchmark-title">
      <h2 id="benchmark-title">Benchmark</h2>
      <table>
        <thead>
          <tr>
            <th>Indicateur</th>
            <th>Entreprise</th>
            <th>Meilleur concurrent</th>
          </tr>
        </thead>
        <tbody>
          ${renderBenchmarkRows(analysis)}
        </tbody>
      </table>
    </section>

    <footer>
      <span>Date de génération : ${text(generatedAt)}</span>
      <span>Version du moteur : ${text(knowledge.version)}</span>
    </footer>
  </main>
</body>
</html>`;
}
