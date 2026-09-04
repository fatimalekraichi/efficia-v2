import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectPageResultWithIsolatedChrome } from "./chromeHeadlessHarness.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const generatorPath = join(projectRoot, "admin/free-diagnostic-production/index.html");
const generator = readFileSync(generatorPath, "utf8");
const css = generator.match(/<style>([\s\S]*?)<\/style>/u)?.[1] || "";
function chromeForTestingPath() {
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  try {
    const versions = readdirSync(cache).filter((name) => name.startsWith("chromium-")).sort().reverse();
    return versions.map((version) => join(cache, version, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing")).find(existsSync) || "";
  } catch {
    return "";
  }
}

// Chrome for Testing est isolé du navigateur quotidien et évite les tâches
// macOS du profil utilisateur qui empêchent parfois --dump-dom de se fermer.
const chrome = [process.env.CHROME_BIN, chromeForTestingPath(), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((candidate) => candidate && existsSync(candidate));
const hasChrome = existsSync(chrome);

// Le garde-fou V3.2 doit mesurer le DOM réel (footer, largeur et contenu),
// plutôt que masquer un dépassement avec overflow:hidden.
test("le garde-fou V3.2 contrôle le footer et les limites réelles de chaque page", () => {
  assert.match(generator, /function validerMiseEnPageRapport\(\)\{/u);
  assert.match(generator, /function mesuresPageRapport\(page\)/u);
  assert.match(generator, /contentBottom <= footerRect\.top - securityGap/u);
  assert.match(generator, /contentLeft >= pageRect\.left - 1/u);
  assert.match(generator, /contentRight <= pageRect\.right \+ 1/u);
  assert.match(generator, /appliquerCompactionLocaleRapport\(\)/u);
  assert.doesNotMatch(generator, /\.page\{[^}]*overflow:hidden/u);
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
function pageOffresFixture({ business, withConcurrents = false, withDeduction = true }) {
  const deductionNote = withDeduction
    ? "Les 99 € sont déduits si vous commandez un pack éligible dans les 30 jours."
    : "Ce diagnostic vous aide à choisir la prochaine action la plus utile.";
  const concurrentsClause = withConcurrents
    ? ", et sur les données publiques agrégées de fiches concurrentes de votre zone"
    : "";

  // Reproduction fidèle de la page 6 V3.2 réellement produite par
  // genererRapport(). Cette fixture ne conserve aucun des anciens blocs de
  // projection/d'effort : leur présence aurait masqué une régression de la
  // nouvelle grille compacte des offres.
  return `<div class="page page-offres report-v3">
    <header class="rapport-header report-header"><div class="rapport-logo report-logo-wrap"><img class="report-logo" src="${LOGO_SRC}" alt="Efficia Digital"><span class="fallback">Efficia Digital</span></div><span class="rap-etiquette">Diagnostic Efficia™</span></header>
    <div class="chapitre">Étape 6 · Les solutions</div>
    <h1 class="rapport-title">Deux façons d'améliorer votre fiche</h1>
    <p class="v3-solution-lead">Vous pouvez appliquer les priorités vous-même, ou confier à Efficia l'ensemble des optimisations de la fiche de ${escapeHtml(business)}.</p>
    <section class="v3-offer-grid">
      <article class="v3-offer">
        <span class="v3-offer-tag">Je le fais moi-même</span>
        <h2>Audit complet Google Business</h2>
        <div class="offer-price">99 € <small>TTC</small></div>
        <p>Vous recevez tout ce qu'il faut pour agir vous-même, dans le bon ordre.</p>
        <ul>
          <li>Analyse détaillée de la fiche</li><li>Comparaison avec les concurrents pertinents</li><li>Corrections classées par priorité</li><li>Textes et recommandations personnalisés</li><li>Plan d'action directement applicable</li>
        </ul>
        <p class="offer-note">${deductionNote}</p>
        <a class="payment-button payment-button--audit" data-pdf-link="payment" href="https://www.efficiadigital.com/achat?offre=audit" target="_blank" rel="noopener noreferrer">Je veux savoir quoi corriger en premier</a>
      </article>
      <article class="v3-offer v3-offer--pack">
        <span class="v3-offer-tag">Efficia s'occupe de tout</span>
        <h2>Pack Visibilité Google</h2>
        <div class="offer-price">349 €</div>
        <p>Vous préférez que les optimisations soient prises en charge ? Nous les réalisons à votre place.</p>
        <ul>
          <li>Optimisation complète de votre fiche</li><li>Description, services et catégories retravaillés</li><li>Parcours de collecte d'avis mis en place</li><li>Validation finale avec vous avant publication</li>
        </ul>
        <p class="offer-note"><strong>Les trois priorités identifiées dans ce diagnostic font partie des optimisations incluses.</strong> Votre seule tâche : nous transmettre quelques informations, puis valider.</p>
        <a class="payment-button payment-button--pack" data-pdf-link="payment" href="https://www.efficiadigital.com/achat?offre=visibilite" target="_blank" rel="noopener noreferrer">Optimiser ma fiche maintenant</a>
      </article>
    </section>
    <section class="v3-after"><div><b>Après votre commande — Audit</b>Vous recevez votre rapport complet sous 24 heures ouvrées.</div><div><b>Après votre commande — Pack</b>Nous préparons les optimisations puis vous les faisons valider avant toute publication.</div></section>
    <div class="v3-signature"><b>Diagnostic réalisé par l'équipe Efficia Digital</b> · Une question ? Répondez simplement à l'e-mail.</div>
    <p class="v3-legal">Ce Diagnostic Efficia™ est offert, sans engagement. Les constats reposent sur l'état public de votre fiche Google Business au 25 août 2026${concurrentsClause}. Efficia Digital n'est pas affilié à Google. Conformément à notre charte : aucun faux avis, uniquement des optimisations conformes aux règles Google.</p>
    <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport" data-page="6">Page 6/6</span></div>
  </div>`;
}

function layoutHtmlPages(pagesHtml) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="rapport-contenu">${pagesHtml}</div><output id="layout-result"></output><script>
    addEventListener("load", () => {
      const result = Object.fromEntries([...document.querySelectorAll(".page-offres[data-layout-scenario]")].map((page) => {
        const footer = page.querySelector(".pied");
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
        const overflowingBlocks = [...page.querySelectorAll(".v3-offer, .v3-offer-grid, .v3-after")].filter((element) => {
        const kids = [...element.children];
        if (!kids.length) return false;
        const parentBottom = element.getBoundingClientRect().bottom;
        const kidsBottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
        return kidsBottom > parentBottom + 0.5;
      }).map((element) => element.className);
      // Les deux cartes d'offre (grille 2 colonnes) ne doivent jamais se
      // chevaucher visuellement.
        const cards = [...page.querySelectorAll(".v3-offer")].map(rect);
        let cardsOverlap = false;
        for (let i = 0; i < cards.length; i += 1) {
          for (let j = i + 1; j < cards.length; j += 1) {
            const a = cards[i], b = cards[j];
            if (a.top < b.bottom && a.bottom > b.top) {
              const ael = page.querySelectorAll(".v3-offer")[i].getBoundingClientRect();
              const bel = page.querySelectorAll(".v3-offer")[j].getBoundingClientRect();
              if (ael.left < bel.right && ael.right > bel.left) cardsOverlap = true;
            }
          }
        }
        return [page.dataset.layoutScenario, {
          contentBottom,
          footerTop: footer.offsetTop,
          footerBottom: footerRect.bottom,
          pageBottom: pageRect.bottom,
          marginPx: footer.offsetTop - contentBottom,
          clipped: clippedByPage,
          overflowingBlocks,
          cardsOverlap,
          exportAlert: contentBottom > footer.offsetTop - 12,
        }];
      }));
      document.querySelector("#layout-result").textContent = JSON.stringify(result);
    });
  <\/script></body></html>`;
}

/* Chrome headless ne doit jamais hériter du profil interactif macOS : il y
   lance alors des tâches de fond (installations d'applications, sync, etc.)
   qui peuvent empêcher --dump-dom de se terminer. Chaque suite page 6
   reçoit donc son profil éphémère et toute attente est bornée avec la phase
   concernée dans le message d'erreur. */
async function serveTemporaryDirectory(directory) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const filename = (pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, ""));
    if(filename.includes("..")) { response.writeHead(400).end(); return; }
    let content;
    try { content = readFileSync(join(directory, filename)); }
    catch { response.writeHead(404).end(); return; }
    response.writeHead(200, {
      "content-type": filename.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
      connection: "close",
    });
    response.end(content);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    url: (filename) => `http://127.0.0.1:${port}/${filename}`,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections?.();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function measureLayouts(directory, profileDir, scenarios, server) {
  const htmlPath = join(directory, "scenarios.html");
  const pages = scenarios.map(({ name, opts }) => pageOffresFixture(opts).replace('class="page page-offres report-v3"', `class="page page-offres report-v3" data-layout-scenario="${name}"`)).join("\n");
  writeFileSync(htmlPath, layoutHtmlPages(pages));
  const result = await collectPageResultWithIsolatedChrome({ chrome, url: server.url("scenarios.html"), profileDir, phase: "page 6 / scénarios de mise en page", selector: "#layout-result" });
  assert.ok(result, "page 6 : mesures DOM absentes");
  return JSON.parse(result);
}

test("page 6 : scénarios de contenu variables — marge >= 24px, sans alerte, sans coupe ni chevauchement", { skip: !hasChrome, timeout: 25_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "efficia-page6-layout-"));
  let server;
  try {
    const profileDir = join(directory, "chrome-profile");
    server = await serveTemporaryDirectory(directory);
    const scenarios = [
      { name: "baseline-courte", opts: { business: "Chez Marc", withDeduction: false } },
      // Scénario "B&V dense" : nom long avec esperluette, blocs projection +
      // effort, mention concurrents, DIY long — le scénario qui reproduisait
      // le débordement de production (analyse 802efbfc-…).
      { name: "bv-dense", opts: { business: "B&V Électricité Générale — Installations, Dépannages & Domotique", withConcurrents: true } },
      { name: "garage", opts: { business: "Garage Dupont" } },
      { name: "cabinet", opts: { business: "Cabinet Dentaire du Parc" } },
      { name: "accents-et-apostrophes", opts: { business: "L'Électricité d'Œsling — Réparation & Dépannage" } },
      { name: "avec-concurrents", opts: { business: "Restaurant La Table Ronde", withConcurrents: true } },
      { name: "sans-deduction", opts: { business: "Fleuriste Belle Époque", withDeduction: false } },
      { name: "nom-long-concurrents", opts: { business: "Menuiserie Ébénisterie Traditionnelle et Sur-Mesure Lemoine & Associés", withConcurrents: true } },
      { name: "contenu-complet", opts: { business: "Entreprise locale de chauffage, électricité et solutions d'énergie" } },
      // Pire scénario à intitulés longs : nom d'entreprise extrême + tous
      // les blocs optionnels activés + DIY maximal.
      { name: "pire-scenario-intitules-longs", opts: { business: "Cabinet d'Électricité Générale, Domotique, Sécurité Incendie et Bornes de Recharge B&V — Arlon, Habay, Attert et Environs", withConcurrents: true, withDeduction: true } },
    ];
    const layouts = await measureLayouts(directory, profileDir, scenarios, server);
    for (const { name } of scenarios) {
      const layout = layouts[name];
      assert.ok(layout, `${name}: mesures DOM absentes`);
      assert.equal(layout.exportAlert, false, `${name}: validerMiseEnPageRapport() déclencherait l'alerte (contentBottom=${layout.contentBottom} > footerTop-12=${layout.footerTop - 12})`);
      assert.ok(layout.marginPx >= 24, `${name}: marge de ${layout.marginPx}px sous le minimum robuste de 24px`);
      assert.ok(layout.footerBottom <= layout.pageBottom + 0.5, `${name}: pied de page hors des limites de la page`);
      assert.equal(layout.clipped, false, `${name}: du contenu dépasse la page (coupé)`);
      assert.deepEqual(layout.overflowingBlocks, [], `${name}: bloc(s) dont le contenu déborde de leur propre carte : ${layout.overflowingBlocks.join(", ")}`);
      assert.equal(layout.cardsOverlap, false, `${name}: les deux cartes d'offre se chevauchent`);
    }
  } finally {
    await server?.close();
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
const HTML2CANVAS_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";

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

async function html2canvasReachable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(HTML2CANVAS_CDN_URL, { method: "HEAD", signal: controller.signal });
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

test("page 6 : 10 scénarios génèrent chacun un PDF réel jsPDF/html2canvas de 6 pages, sans alerte", { skip: !hasChrome, timeout: 120_000 }, async (t) => {
  if (!(await cdnReachable())) {
    t.skip("CDN jsPDF/html2canvas injoignable depuis cet environnement");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "efficia-page6-pdf-"));
  let server;
  try {
    server = await serveTemporaryDirectory(directory);
    const scenarios = [
      ["minimal", { business: "Chez Marc", withDeduction: false }],
      ["b-and-v", { business: "B&V Électricité Générale — Installations, Dépannages & Domotique", withConcurrents: true }],
      ["garage", { business: "Garage Dupont" }],
      ["cabinet", { business: "Cabinet Dentaire du Parc" }],
      ["accents", { business: "L'Électricité d'Œsling — Réparation & Dépannage" }],
      ["restaurant", { business: "Restaurant La Table Ronde", withConcurrents: true }],
      ["fleuriste", { business: "Fleuriste Belle Époque", withDeduction: false }],
      ["menuiserie", { business: "Menuiserie Ébénisterie Traditionnelle et Sur-Mesure Lemoine & Associés", withConcurrents: true }],
      ["services", { business: "Entreprise locale de chauffage, électricité et solutions d'énergie" }],
      ["intitules-longs", { business: "Cabinet d'Électricité Générale, Domotique, Sécurité Incendie et Bornes de Recharge B&V — Arlon, Habay, Attert et Environs", withConcurrents: true }],
    ];
    for (const [name, options] of scenarios) {
      const filename = `${name}-pdf.html`;
      writeFileSync(join(directory, filename), pdfHtmlPage(pageOffresFixture(options)));
      const resultText = await collectPageResultWithIsolatedChrome({
        chrome,
        url: server.url(filename),
        profileDir: join(directory, `chrome-profile-${name}`),
        phase: `page 6 / PDF ${name}`,
        timeout: 35_000,
        selector: "#pdf-result",
      });
      assert.ok(resultText, `${name}: résultat de génération PDF absent du DOM`);
      const result = JSON.parse(resultText);
      assert.equal(result.error, undefined, `${name}: génération PDF en échec : ${result.error}`);
      assert.equal(result.pageCount, 6, `${name}: le rapport contient ${result.pageCount} pages au lieu de 6`);
      assert.equal(result.totalPdfPages, 6, `${name}: le PDF généré contient ${result.totalPdfPages} pages au lieu de 6`);
      assert.ok(result.pdfBytes > 0, `${name}: le PDF généré est vide`);
      assert.deepEqual(result.alerts, [], `${name}: alerte(s) déclenchée(s) : ${(result.alerts || []).join(", ")}`);
    }
  } finally {
    await server?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

// Le défaut historique ne vient pas du DOM : il apparaît pendant la capture
// html2canvas de certaines pages éloignées du long rapport. Cette fixture
// reproduit six pages A4 avec le vrai logo PNG et vérifie à la fois la
// géométrie du DOM source, celle du clone html2canvas et le canvas capturé.
const LOGO_PNG_DATA_URL = `data:image/png;base64,${readFileSync(join(projectRoot, "assets", "logo", "logo-efficia-digital.png")).toString("base64")}`;

function sixPagesLogoFixture() {
  const pages = Array.from({ length: 6 }, (_, index) => {
    const page = index + 1;
    return `<section class="page page-logo-test page-${page}">
      <header class="rapport-header report-header"><div class="rapport-logo report-logo-wrap"><img class="report-logo" src="${LOGO_PNG_DATA_URL}" alt="Efficia Digital"></div><span class="rap-etiquette">Diagnostic Efficia™</span></header>
      <div class="chapitre">Étape ${page} · Vérification</div><h1 class="rapport-title">Page ${page}</h1>
      <p class="rapport-subtitle">Contenu de contrôle du diagnostic gratuit.</p>
      <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport">Page ${page}/6</span></div>
    </section>`;
  }).join("\n");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${css}</style>
  <main id="rapport-contenu">${pages}</main><output id="logo-layout-result"></output>
  <script src="${HTML2CANVAS_CDN_URL}"></script><script>
    async function waitForImages(container) {
      const images = [...container.querySelectorAll("img")];
      await Promise.all(images.map(async (img) => {
        if (!img.complete) await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
        if (typeof img.decode === "function") { try { await img.decode(); } catch (_) {} }
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    function captureOptions(pageIndex, clones) {
      return { scale: 1, useCORS: true, allowTaint: false, backgroundColor: "#ffffff", onclone(doc) {
        const page = doc.querySelectorAll("#rapport-contenu .page")[pageIndex];
        const pageRect = page.getBoundingClientRect(); const image = page.querySelector(".rapport-logo img"); const logo = image.getBoundingClientRect();
        const header = page.querySelector(".rapport-header").getBoundingClientRect();
        const captureLogo = doc.createElement("span");
        captureLogo.style.cssText = "display:block;flex:0 0 auto;width:" + logo.width + "px;height:" + logo.height + "px;background-image:url(\\\"" + image.currentSrc + "\\\");background-repeat:no-repeat;background-position:center;background-size:contain";
        image.replaceWith(captureLogo);
        const replacement = captureLogo.getBoundingClientRect();
        clones.push({ page: pageIndex + 1, pageTop: pageRect.top, logoTop: replacement.top - pageRect.top, logoBottom: replacement.bottom - pageRect.top, logoWidth: replacement.width, logoHeight: replacement.height, headerTop: header.top - pageRect.top, headerOverflow: getComputedStyle(page.querySelector(".rapport-header")).overflow });
      }};
    }
    function countInk(context, x, y, width, height) {
      const pixels = context.getImageData(x, y, width, height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 235 || pixels[index + 1] < 235 || pixels[index + 2] < 235) count += 1;
      return count;
    }
    addEventListener("load", async () => {
      try {
        const pages = [...document.querySelectorAll("#rapport-contenu .page")];
        await waitForImages(document.querySelector("#rapport-contenu"));
        const source = pages.map((page, index) => { const pageRect = page.getBoundingClientRect(); const logo = page.querySelector(".rapport-logo img").getBoundingClientRect(); const header = page.querySelector(".rapport-header").getBoundingClientRect(); return { page: index + 1, logoTop: logo.top - pageRect.top, logoBottom: logo.bottom - pageRect.top, logoWidth: logo.width, logoHeight: logo.height, headerTop: header.top - pageRect.top, headerOverflow: getComputedStyle(page.querySelector(".rapport-header")).overflow }; });
        const clones = [], canvases = [];
        for (const [index, page] of pages.entries()) {
          const canvas = await window.html2canvas(page, captureOptions(index, clones));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          canvases.push({ page: index + 1, width: canvas.width, height: canvas.height, topInk: countInk(context, 90, 5, 500, 38), logoInk: countInk(context, 90, 48, 500, 70) });
        }
        document.querySelector("#logo-layout-result").textContent = JSON.stringify({ pageCount: pages.length, source, clones, canvases });
      } catch (error) { document.querySelector("#logo-layout-result").textContent = JSON.stringify({ error: String(error && error.message || error) }); }
    });
  <\/script></html>`;
}

test("logo du diagnostic gratuit : les six pages gardent une marge haute dans le DOM et le canvas html2canvas", { skip: !hasChrome, timeout: 45_000 }, async (t) => {
  if (!(await html2canvasReachable())) {
    t.skip("CDN html2canvas injoignable depuis cet environnement");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "efficia-free-logo-layout-"));
  let server;
  try {
    server = await serveTemporaryDirectory(directory);
    writeFileSync(join(directory, "six-pages-logo.html"), sixPagesLogoFixture());
    const result = JSON.parse(await collectPageResultWithIsolatedChrome({
      chrome,
      url: server.url("six-pages-logo.html"),
      profileDir: join(directory, "chrome-profile"),
      phase: "logo rapport gratuit / six pages",
      timeout: 35_000,
      selector: "#logo-layout-result",
    }));
    assert.equal(result.error, undefined, `capture html2canvas en échec : ${result.error}`);
    assert.equal(result.pageCount, 6, "le rapport doit contenir exactement six pages");
    assert.equal(result.source.length, 6);
    assert.equal(result.clones.length, 6);
    assert.equal(result.canvases.length, 6);
    const headerTops = result.source.map((entry) => entry.headerTop);
    for (const entry of result.source) {
      assert.ok(entry.logoTop > 0, `page ${entry.page}: logo collé ou coupé par le haut (${entry.logoTop}px)`);
      assert.ok(entry.logoBottom > entry.logoTop, `page ${entry.page}: hauteur logo nulle`);
      assert.ok(entry.logoWidth > 0 && entry.logoHeight > 0, `page ${entry.page}: dimensions logo invalides`);
      assert.equal(entry.headerOverflow, "visible", `page ${entry.page}: header susceptible de couper le logo`);
      assert.ok(Math.abs(entry.headerTop - headerTops[0]) <= 0.5, `page ${entry.page}: header décalé par rapport à la page 1`);
    }
    for (const entry of result.clones) {
      const source = result.source[entry.page - 1];
      assert.ok(entry.pageTop >= 0, `page ${entry.page}: position clone invalide`);
      assert.ok(entry.logoTop > 0 && entry.logoBottom > entry.logoTop, `page ${entry.page}: logo coupé dans le clone`);
      assert.ok(entry.logoWidth > 0 && entry.logoHeight > 0, `page ${entry.page}: logo absent du clone`);
      assert.equal(entry.headerOverflow, "visible", `page ${entry.page}: header du clone masque le logo`);
      assert.ok(Math.abs(entry.logoTop - source.logoTop) <= 0.5, `page ${entry.page}: logo décalé entre DOM et clone`);
      assert.ok(Math.abs(entry.headerTop - source.headerTop) <= 0.5, `page ${entry.page}: header décalé entre DOM et clone`);
    }
    for (const entry of result.canvases) {
      assert.ok(entry.width > 0 && entry.height > 0, `page ${entry.page}: canvas vide`);
      assert.equal(entry.topInk, 0, `page ${entry.page}: contenu rasterisé avant la marge haute`);
      assert.ok(entry.logoInk > 0, `page ${entry.page}: logo absent du canvas`);
    }
  } finally {
    await server?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("le renderer gratuit stabilise seulement le clone html2canvas de son logo", () => {
  assert.match(generator, /function optionsCapturePdfDiagnostic\(\)/u);
  assert.match(generator, /clonedDoc\.querySelectorAll\("#rapport-contenu \.rapport-logo img"\)/u);
  assert.match(generator, /logoCapture\.style\.backgroundImage/u);
  assert.match(generator, /img\.replaceWith\(logoCapture\)/u);
  const freeRenderer = generator.slice(generator.indexOf("async function telechargerPDF(){"));
  assert.match(freeRenderer, /await waitForReportImages\(document\.getElementById\("rapport-contenu"\)\)/u);
  assert.match(freeRenderer, /html2canvasFn\(page, optionsCapturePdfDiagnostic\(\)\)/u);
  const premiumStart = generator.indexOf("async function telechargerAuditPremium(){");
  assert.ok(premiumStart >= 0, "renderer Premium introuvable");
  const premiumRenderer = generator.slice(premiumStart, generator.indexOf("async function telechargerPDF(){"));
  assert.doesNotMatch(premiumRenderer, /optionsCapturePdfDiagnostic/u);
  assert.doesNotMatch(premiumRenderer, /logoCapture/u);
});
