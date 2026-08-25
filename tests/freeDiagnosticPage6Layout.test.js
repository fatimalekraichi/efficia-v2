import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const generatorPath = join(projectRoot, "admin/free-diagnostic-production/index.html");
const generator = readFileSync(generatorPath, "utf8");
const css = generator.match(/<style>([\s\S]*?)<\/style>/u)?.[1] || "";
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const hasChrome = existsSync(chrome);

// Empêche toute régression silencieuse du garde-fou historique : le
// correctif de mise en page de la page 6 (page-offres) ne doit jamais
// modifier validerMiseEnPageRapport() ni sa tolérance de 12px.
test("le garde-fou validerMiseEnPageRapport() et sa tolérance de 12px restent inchangés", () => {
  assert.match(generator, /function validerMiseEnPageRapport\(\)\{/u);
  assert.match(generator, /if\(contentBottom > footerTop - 12\)\{/u);
  assert.match(generator, /Erreur de mise en page : le contenu de la page \$\{layout\.page\}/u);
});

// Logo placeholder qui "charge" réellement (SVG data URI, 170×52) pour
// reproduire la hauteur d'entête réelle (52px, cf. .rapport-logo img en CSS)
// — le fallback texte (image absente/CORS) rend un en-tête plus court et
// sous-estimerait le risque de débordement par rapport à la production.
const LOGO_SRC = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='170' height='52'%3E%3C/svg%3E";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 15) return "environ 10 à 15 minutes";
  if (m < 60) {
    const pas = m <= 30 ? 10 : 15;
    const bas = Math.max(10, Math.floor(m / pas) * pas);
    const haut = Math.min(60, Math.max(bas + pas, Math.ceil(m / pas) * pas));
    return `environ ${bas} à ${haut} minutes`;
  }
  const heures = m / 60;
  const bas = Math.max(1, Math.floor(heures));
  const haut = Math.max(bas + 1, Math.ceil(heures));
  return `environ ${bas} à ${haut} heures`;
}

// Reproduction fidèle du template réel de la PAGE 6 (.page-offres) tel que
// produit par genererRapport() dans admin/free-diagnostic-production/index.html
// (même approche que freeDiagnosticPage3Layout.test.js pour la page 3 :
// fixture autonome important la vraie feuille de styles, sans dépendre de
// tout l'état applicatif — formulaire, grille de critères, session — requis
// par genererRapport() lui-même).
function pageOffresFixture({
  business,
  withProjection = true,
  withEffort = true,
  withConcurrents = false,
  withDeduction = true,
  tempsDiy = 90,
  score = 42,
  scoreProjete = 78,
}) {
  const bandeCouleur = score < 40 ? "#dc2626" : score < 60 ? "#d97706" : score < 80 ? "#2563eb" : "#059669";
  const deductionNote = withDeduction
    ? "Les 99 € sont déduits si vous commandez un pack éligible dans les 30 jours."
    : "";
  const projectionBloc = withProjection
    ? `
    <div class="projection-grid">
      <div class="proj-col"><div class="lab">Aujourd'hui</div><div class="num" style="color:${bandeCouleur}">${score}<span style="font-size:.9rem;color:#64748b">/100</span></div></div>
      <div class="proj-fleche">→</div>
      <div class="proj-col"><div class="lab">Objectif réaliste</div><div class="num" style="color:#059669">${scoreProjete}<span style="font-size:.9rem;color:#64748b">/100</span></div></div>
    </div>
    <p style="color:#8a97a8;font-size:.62rem;line-height:1.35;margin-top:5px">Projection du score de complétude Efficia après correction des critères directement maîtrisables. Elle ne constitue pas une garantie de classement Google, d'appels ou de chiffre d'affaires.</p>`
    : "";
  const effortBloc = withEffort
    ? `
    <div class="effort-grid">
      <div class="effort-card">Appliquer vous-même l'ensemble des recommandations<b>${formatMinutes(tempsDiy)}</b>au total, selon les éléments déjà disponibles et les vérifications nécessaires</div>
      <div class="effort-card" style="border-color:#93c5fd;background:#f8fbff">Avec le Pack Visibilité<b>20 à 30 minutes</b>de votre côté : transmettre les informations, puis valider avant publication</div>
    </div>`
    : "";
  const concurrentsClause = withConcurrents
    ? ", et sur les données publiques agrégées de fiches concurrentes de votre zone"
    : "";

  return `<div class="page page-offres">
    <header class="rapport-header report-header"><div class="rapport-logo report-logo-wrap"><img class="report-logo" src="${LOGO_SRC}" alt="Efficia Digital"><span class="fallback">Efficia Digital</span></div><span class="rap-etiquette">Diagnostic Efficia™</span></header>
    <div class="chapitre">Étape 6 · Passer à l'action</div>
    <h1 class="rapport-title">Deux façons d'améliorer votre fiche</h1>
    <p class="rapport-subtitle">Vous pouvez appliquer ces trois priorités vous-même, ou confier à Efficia l'ensemble des optimisations de la fiche de ${escapeHtml(business)}.</p>
    ${projectionBloc}
    ${effortBloc}
    <div class="choice-note">Le Pack permet de prendre en charge les priorités détectées, sans que vous ayez à modifier la fiche vous-même.</div>
    <div class="offer-grid">
      <div class="offer-card offer-choice primary">
        <span class="offer-badge">Je le fais moi-même</span>
        <h3>Audit complet Google Business</h3>
        <div class="offer-price">99 € <small>TTC</small></div>
        <p class="offer-main">Vous recevez tout ce qu'il faut pour agir vous-même, dans le bon ordre.</p>
        <ul class="offer-check">
          <li><span><strong>Analyse détaillée</strong> de la fiche</span></li>
          <li><span><strong>Comparaison</strong> avec les concurrents pertinents</span></li>
          <li><span><strong>Corrections classées par priorité</strong></span></li>
          <li><span><strong>Textes et recommandations personnalisés</strong></span></li>
          <li><span><strong>Plan d'action directement applicable</strong></span></li>
        </ul>
        <p class="offer-note">Prévoyez ensuite ${formatMinutes(tempsDiy)} au total pour appliquer les recommandations vous-même, selon les éléments déjà disponibles et les vérifications nécessaires.${deductionNote ? " " + deductionNote : ""}</p>
        <a class="payment-button payment-button--audit" data-pdf-link="payment" href="https://www.efficiadigital.com/achat?offre=audit" target="_blank" rel="noopener noreferrer">Je veux savoir quoi corriger en premier</a>
      </div>
      <div class="offer-card offer-choice">
        <span class="offer-badge">Efficia s'occupe de tout</span>
        <h3>Pack Visibilité Google</h3>
        <div class="offer-price">349 €</div>
        <p class="offer-main">Vous préférez que les optimisations soient prises en charge ? Nous réalisons les optimisations à votre place.</p>
        <ul class="offer-check">
          <li><span><strong>Optimisation complète</strong> de votre fiche par nos soins</span></li>
          <li><span><strong>Description, services et catégories</strong> retravaillés</span></li>
          <li><span><strong>Parcours de collecte d'avis</strong> mis en place</span></li>
          <li><span><strong>Validation finale</strong> avec vous avant publication</span></li>
        </ul>
        <p class="offer-note"><strong>Les trois priorités identifiées dans ce diagnostic font partie des optimisations incluses.</strong> Votre seule tâche : nous transmettre quelques informations, puis valider avant publication (20 à 30 minutes de votre côté).</p>
        <a class="payment-button payment-button--pack" data-pdf-link="payment" href="https://www.efficiadigital.com/achat?offre=visibilite" target="_blank" rel="noopener noreferrer">Optimiser ma fiche maintenant</a>
      </div>
    </div>
    <div class="process-note"><b>Après votre commande</b> — Audit : vous recevez votre rapport complet sous 24 heures ouvrées. Pack : nous préparons les optimisations puis vous les faisons valider avant toute publication.</div>
    <div class="signature-bloc">
      <div class="avatar-fallback">E</div>
      <div style="font-size:.8rem;color:#475569;line-height:1.5">
        <b style="color:#071a3a">Diagnostic réalisé par l'équipe Efficia Digital</b><br>Une question sur un point du diagnostic ? Répondez simplement à cet e-mail.
      </div></div>
    <div class="email-choice-box">
      <div class="email-choice-box__title">Vous préférez échanger avant de choisir ?</div>
      <div class="email-choice-box__instruction">Répondez simplement à l'e-mail avec AUDIT ou PACK.</div>
    </div>
    <p style="text-align:center;color:#64748b;font-size:.7rem;margin-top:7px"><a class="rapport-link" href="https://efficiadigital.com">efficiadigital.com</a> • <a class="rapport-link" href="mailto:contact@efficiadigital.com">contact@efficiadigital.com</a> — réponse sous 24 h ouvrées, sans engagement.</p>
    <p class="legal-note">Ce Diagnostic Efficia™ est offert, sans engagement. Les constats reposent sur l'état public de votre fiche Google Business au 25 août 2026${concurrentsClause}. Efficia Digital n'est pas affilié à Google. Conformément à notre charte : aucun faux avis, uniquement des optimisations conformes aux règles Google.</p>
    <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport" data-page="6">Page 6/6</span></div>
  </div>`;
}

function layoutHtmlPage(pageHtml) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="rapport-contenu">${pageHtml}</div><output id="layout-result"></output><script>
    addEventListener("load", () => {
      const page = document.querySelector(".page"); const footer = page.querySelector(".pied");
      const content = [...page.children].filter((element) => !element.classList.contains("pied"));
      const contentBottom = Math.max(...content.map((element) => element.offsetTop + element.offsetHeight));
      const rect = (element) => { const value = element.getBoundingClientRect(); return { top:value.top, bottom:value.bottom }; };
      const pageRect = rect(page); const footerRect = rect(footer);
      const clippedByPage = content.some((element) => element.getBoundingClientRect().bottom > pageRect.bottom + 0.5);
      // Chaque bloc direct de la page (offer-card compris) doit contenir tout
      // son propre contenu : détecte un texte qui déborderait visuellement de
      // sa carte (chevauchement / masquage) sans forcément dépasser la page.
      // getBoundingClientRect() partout (même référentiel) : offsetTop/Height
      // des enfants sont relatifs à leur offsetParent positionné le plus
      // proche (ici la page), pas à leur parent direct — les mélanger avec
      // le offsetHeight du parent donnerait un faux positif systématique.
      const overflowingBlocks = [...page.querySelectorAll(".offer-card, .offer-grid, .projection-grid, .effort-grid")].filter((element) => {
        const kids = [...element.children];
        if (!kids.length) return false;
        const parentBottom = element.getBoundingClientRect().bottom;
        const kidsBottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
        return kidsBottom > parentBottom + 0.5;
      }).map((element) => element.className);
      // Les deux cartes d'offre (grille 2 colonnes) ne doivent jamais se
      // chevaucher visuellement.
      const cards = [...page.querySelectorAll(".offer-card")].map(rect);
      let cardsOverlap = false;
      for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
          const a = cards[i], b = cards[j];
          if (a.top < b.bottom && a.bottom > b.top) {
            const ael = page.querySelectorAll(".offer-card")[i].getBoundingClientRect();
            const bel = page.querySelectorAll(".offer-card")[j].getBoundingClientRect();
            if (ael.left < bel.right && ael.right > bel.left) cardsOverlap = true;
          }
        }
      }
      const result = {
        contentBottom,
        footerTop: footer.offsetTop,
        footerBottom: footerRect.bottom,
        pageBottom: pageRect.bottom,
        marginPx: footer.offsetTop - contentBottom,
        clipped: clippedByPage,
        overflowingBlocks,
        cardsOverlap,
        exportAlert: contentBottom > footer.offsetTop - 12,
      };
      document.querySelector("#layout-result").textContent = JSON.stringify(result);
    });
  <\/script></body></html>`;
}

function measureLayout(directory, name, opts) {
  const htmlPath = join(directory, `${name}.html`);
  writeFileSync(htmlPath, layoutHtmlPage(pageOffresFixture(opts)));
  const output = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom", pathToFileURL(htmlPath).href], { encoding: "utf8", maxBuffer: 5_000_000 });
  const encoded = output.match(/<output id="layout-result">([^<]+)<\/output>/u)?.[1];
  assert.ok(encoded, `${name}: mesures DOM absentes`);
  return JSON.parse(encoded.replaceAll("&quot;", '"'));
}

test("page 6 : scénarios de contenu variables — marge >= 24px, sans alerte, sans coupe ni chevauchement", { skip: !hasChrome }, () => {
  const directory = mkdtempSync(join(tmpdir(), "efficia-page6-layout-"));
  try {
    const scenarios = [
      { name: "baseline-courte", opts: { business: "Chez Marc", withProjection: false, withEffort: false, tempsDiy: 20 } },
      // Scénario "B&V dense" : nom long avec esperluette, blocs projection +
      // effort, mention concurrents, DIY long — le scénario qui reproduisait
      // le débordement de production (analyse 802efbfc-…).
      { name: "bv-dense", opts: { business: "B&V Électricité Générale — Installations, Dépannages & Domotique", withProjection: true, withEffort: true, withConcurrents: true, tempsDiy: 240 } },
      { name: "projection-seule", opts: { business: "Garage Dupont", withProjection: true, withEffort: false, tempsDiy: 20 } },
      { name: "effort-seul", opts: { business: "Garage Dupont", withProjection: false, withEffort: true, tempsDiy: 90 } },
      { name: "projection-et-effort", opts: { business: "Cabinet Dentaire du Parc", withProjection: true, withEffort: true, tempsDiy: 90 } },
      { name: "avec-concurrents", opts: { business: "Restaurant La Table Ronde", withProjection: true, withEffort: true, withConcurrents: true, tempsDiy: 60 } },
      { name: "diy-en-heures", opts: { business: "Plomberie Chauffage Sanitaire Dupuis & Fils", withProjection: true, withEffort: true, tempsDiy: 300 } },
      { name: "sans-deduction", opts: { business: "Fleuriste Belle Époque", withProjection: true, withEffort: true, withDeduction: false, tempsDiy: 90 } },
      { name: "nom-long-concurrents-effort", opts: { business: "Menuiserie Ébénisterie Traditionnelle et Sur-Mesure Lemoine & Associés", withProjection: false, withEffort: true, withConcurrents: true, tempsDiy: 180 } },
      // Pire scénario à intitulés longs : nom d'entreprise extrême + tous
      // les blocs optionnels activés + DIY maximal.
      { name: "pire-scenario-intitules-longs", opts: { business: "Cabinet d'Électricité Générale, Domotique, Sécurité Incendie et Bornes de Recharge B&V — Arlon, Habay, Attert et Environs", withProjection: true, withEffort: true, withConcurrents: true, withDeduction: true, tempsDiy: 300 } },
    ];
    for (const { name, opts } of scenarios) {
      const layout = measureLayout(directory, name, opts);
      assert.equal(layout.exportAlert, false, `${name}: validerMiseEnPageRapport() déclencherait l'alerte (contentBottom=${layout.contentBottom} > footerTop-12=${layout.footerTop - 12})`);
      assert.ok(layout.marginPx >= 24, `${name}: marge de ${layout.marginPx}px sous le minimum robuste de 24px`);
      assert.ok(layout.footerBottom <= layout.pageBottom + 0.5, `${name}: pied de page hors des limites de la page`);
      assert.equal(layout.clipped, false, `${name}: du contenu dépasse la page (coupé)`);
      assert.deepEqual(layout.overflowingBlocks, [], `${name}: bloc(s) dont le contenu déborde de leur propre carte : ${layout.overflowingBlocks.join(", ")}`);
      assert.equal(layout.cardsOverlap, false, `${name}: les deux cartes d'offre se chevauchent`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// --- Génération PDF réelle (jsPDF + html2canvas, mêmes CDN et mêmes options
// que telechargerPDF()) sur le scénario B&V dense --------------------------
//
// Nécessite Chrome ET un accès réseau aux CDN listés dans PDF_SCRIPT_URLS
// (mêmes URLs que la production) : ce test est ignoré (skip, pas échec) si
// l'un des deux manque, à l'image du reste de cette suite qui tolère
// l'absence de Chrome. Il ne dépend d'aucun paquet npm supplémentaire — le
// projet n'a aucune dépendance déclarée et cette suite le respecte.
const CDN_PROBE_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

async function cdnReachable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(CDN_PROBE_URL, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

function minimalOtherPage(n, cls) {
  return `<div class="page ${cls}" style="position:relative"><h1 class="rapport-title">Page ${n}</h1><div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport" data-page="${n}">Page ${n}/6</span></div></div>`;
}

function pdfHtmlPage(pageOffresHtml) {
  const otherPages = [
    minimalOtherPage(1, "page-hero"),
    minimalOtherPage(2, "page-benchmark"),
    minimalOtherPage(3, "page-action"),
    minimalOtherPage(4, "page-priorites"),
    minimalOtherPage(5, "page-plan"),
  ].join("\n");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head>
  <body>
  <div id="rapport-contenu">${otherPages}${pageOffresHtml}</div>
  <output id="pdf-result"></output>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
    window.__alerts = [];
    window.alert = (message) => { window.__alerts.push(message); };
    // Reproduit exactement la boucle de génération de telechargerPDF() :
    // même sélecteur de pages, mêmes options html2canvas, même addImage.
    addEventListener("load", async () => {
      try {
        const pages = [...document.querySelectorAll("#rapport-contenu .page")];
        const result = { pageCount: pages.length };
        if (pages.length === 6) {
          const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
          const html2canvasFn = window.html2canvas;
          const pdf = new jsPDFCtor({ unit: "mm", format: "a4", orientation: "portrait" });
          for (const [index, page] of pages.entries()) {
            const canvas = await html2canvasFn(page, { scale: 1, useCORS: true, allowTaint: false, backgroundColor: "#ffffff" });
            if (index > 0) pdf.addPage("a4", "portrait");
            pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297);
          }
          result.totalPdfPages = pdf.internal.getNumberOfPages();
          result.pdfBytes = pdf.output("blob").size;
        }
        result.alerts = window.__alerts;
        document.querySelector("#pdf-result").textContent = JSON.stringify(result);
      } catch (e) {
        document.querySelector("#pdf-result").textContent = JSON.stringify({ error: String(e && e.message || e) });
      }
    });
  <\/script>
  </body></html>`;
}

test("page 6 : génération PDF réelle jsPDF/html2canvas (scénario B&V dense) — 6 pages, sans alerte", { skip: !hasChrome }, async (t) => {
  if (!(await cdnReachable())) {
    t.skip("CDN jsPDF/html2canvas injoignable depuis cet environnement");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "efficia-page6-pdf-"));
  try {
    const pageOffresHtml = pageOffresFixture({
      business: "B&V Électricité Générale — Installations, Dépannages & Domotique",
      withProjection: true, withEffort: true, withConcurrents: true, tempsDiy: 240,
    });
    const htmlPath = join(directory, "bv-dense-pdf.html");
    writeFileSync(htmlPath, pdfHtmlPage(pageOffresHtml));
    const output = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=30000", "--dump-dom", pathToFileURL(htmlPath).href], { encoding: "utf8", maxBuffer: 20_000_000, timeout: 45_000 });
    const encoded = output.match(/<output id="pdf-result">([^<]*)<\/output>/u)?.[1];
    assert.ok(encoded, "résultat de génération PDF absent du DOM");
    const result = JSON.parse(encoded.replaceAll("&quot;", '"'));
    assert.equal(result.error, undefined, `génération PDF en échec : ${result.error}`);
    assert.equal(result.pageCount, 6, `le rapport contient ${result.pageCount} pages au lieu de 6`);
    assert.equal(result.totalPdfPages, 6, `le PDF généré contient ${result.totalPdfPages} pages au lieu de 6`);
    assert.ok(result.pdfBytes > 0, "le PDF généré est vide");
    assert.deepEqual(result.alerts, [], `alerte(s) déclenchée(s) pendant la génération : ${(result.alerts || []).join(", ")}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
