import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const domains = [
  ["Informations essentielles", ["Fiche revendiquée et vérifiée", "Catégorie principale", "Catégories secondaires", "Horaires complets", "Téléphone et site web", "Adresse / zone de service", "Attributs (accès, paiement…)", "Cohérence fiche ↔ site web", "Conformité du nom"]],
  ["Photos & visuels", ["Logo et couverture", "Volume de photos", "Photos récentes", "Variété", "Qualité"]],
  ["Avis clients", ["Note moyenne", "Volume d'avis vs concurrents", "Avis récents", "Réponses aux avis", "Qualité des réponses"]],
  ["Contenu de la fiche", ["Description remplie", "Description ciblée (ville, offre)", "Services présents", "Services détaillés", "Questions / Réponses", "Liens d'action (devis, RDV)"]],
  ["Activité & animation", ["Publication récente", "Rythme de publication"]],
  ["Visibilité locale", ["Classement local", "Confiance visible face aux concurrents — Votre fiche : 1,8/5 et 5 avis · Moyenne : 4,8/5 et 10,67 avis · Derrière"]],
];

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function pageFixture({ business, unknown = false, longLabels = false }) {
  const titre = longLabels
    ? "Clarifier les informations visibles pour une entreprise d’électricité, domotique et installations techniques de très longue dénomination"
    : "Clarifier les informations visibles avant le premier contact";
  const confirmation = unknown ? " Certaines informations restent à confirmer manuellement." : "";
  const priority = (rank, compact = false) => `<section class="priority-card${compact ? " priority-card--compact" : ""}">
    <div class="priority-kicker">Priorité n°${rank}</div><h2 class="priority-title">${rank === 1 ? escapeHtml(titre) : `Priorité ciblée ${rank}`}</h2>
    <div class="priority-step priority-step--observation"><div class="priority-step-label">Ce que le client voit</div><p>Les informations essentielles ne permettent pas encore de vérifier l’offre et les modalités de contact avec confiance.${confirmation}</p></div>
    <div class="priority-step priority-step--client"><div class="priority-step-label">Ce qu’il peut penser</div><p>Un prospect peut hésiter avant d’appeler lorsqu’il ne trouve pas les repères attendus.</p></div>
    ${compact ? '<div class="priority-audit-lock">🔒 La marche à suivre précise est détaillée dans l’Audit Efficia™.</div>' : '<div class="priority-step priority-step--action"><div class="priority-step-label">Votre premier pas</div><p>Vérifier et compléter les informations nécessaires.</p><p class="priority-resultat"><b>Résultat attendu :</b> une fiche plus claire.</p><span class="priority-time">Temps estimé : 20 minutes</span></div>'}
  </section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="rapport-contenu"><div class="page page-priorites page-priorites--four-pages">
    <div class="rapport-header"><div class="rapport-logo"><svg role="img" aria-label="Efficia Digital" viewBox="0 0 340 104"><rect width="340" height="104" fill="#fff"></rect><text x="8" y="64" font-size="34" fill="#0f3186">Efficia Digital</text></svg></div><span class="rap-etiquette">Diagnostic Efficia™</span></div>
    <div class="chapitre">Étape 4 · Vos trois priorités</div><h1 class="rapport-title">Par où commencer</h1>
    <p class="rapport-subtitle">Priorités retenues pour ${escapeHtml(business)}.</p>
    ${priority(1)}${priority(2, true)}${priority(3, true)}
    <div class="priorities-remaining"><strong>Priorités restantes :</strong> le détail est inclus dans l’Audit Efficia™.</div>
    <div class="next-hint">Page suivante : les solutions adaptées à votre situation <b>→</b></div>
    <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport">Page 3/4</span></div>
  </div></div><output id="layout-result"></output><script>
    addEventListener("load", () => {
      const page = document.querySelector(".page"); const footer = page.querySelector(".pied");
      const content = [...page.children].filter((element) => !element.classList.contains("pied"));
      const contentBottom = Math.max(...content.map((element) => element.offsetTop + element.offsetHeight));
      const rect = (element) => { const value = element.getBoundingClientRect(); return { top:value.top, right:value.right, bottom:value.bottom, left:value.left }; };
      const pageRect = rect(page); const header = rect(page.querySelector(".rapport-header")); const logo = rect(page.querySelector(".rapport-logo svg"));
      const next = rect(page.querySelector(".next-hint")); const counter = rect(page.querySelector(".pagination-rapport"));
      const overlaps = next.left < counter.right && next.right > counter.left && next.top < counter.bottom && next.bottom > counter.top;
      const clipped = content.some((element) => element.getBoundingClientRect().bottom > page.getBoundingClientRect().bottom + 0.5);
      const result = { contentBottom, footerTop:footer.offsetTop, safetyLimit:footer.offsetTop - 12, footerBottom:rect(footer).bottom, pageBottom:pageRect.bottom, pageLeft:pageRect.left, pageRight:pageRect.right, headerTop:header.top, logoTop:logo.top, logoRight:logo.right, logoBottom:logo.bottom, topInset:header.top-pageRect.top, overlaps, clipped, exportAlert:contentBottom > footer.offsetTop - 12 };
      document.querySelector("#layout-result").textContent = JSON.stringify(result);
    });
  <\/script></body></html>`;
}

test("la correction de page 3 reste locale et conserve le contrôle anti-débordement", () => {
  assert.match(css, /\.page-priorites--four-pages/u);
  assert.match(css, /\.priority-card--compact/u);
  assert.match(css, /\.priority-audit-lock/u);
  assert.match(generator, /if\(contentBottom > footerTop - 12\)/u);
  assert.match(generator, /Erreur de mise en page : le contenu de la page \$\{layout\.page\}/u);
  const compactStart = generator.indexOf('if(variante === "compacte") return `<section class="priority-card priority-card--compact">');
  const compactEnd = generator.indexOf('return `<section class="priority-card">', compactStart);
  const compactBlock = generator.slice(compactStart, compactEnd);
  assert.doesNotMatch(compactBlock, /priority-step--action|priority-resultat|priority-time|priority-sample/u);
});

test("page 3 : les scénarios variables restent au-dessus du footer sans coupe ni chevauchement", { skip: !existsSync(chrome) }, () => {
  const directory = mkdtempSync(join(tmpdir(), "efficia-page3-layout-"));
  try {
    const scenarios = [
      { name: "many-criteria", business: "Entreprise avec beaucoup de critères affichés" },
      { name: "unknowns", business: "Entreprise avec plusieurs éléments à confirmer", unknown: true },
      { name: "long-labels", business: "Entreprise générale d'électricité, domotique et installations techniques de très longue dénomination", unknown: true, longLabels: true },
      { name: "bv-electricite", business: "B&V électricité", unknown: true },
    ];
    for (const scenario of scenarios) {
      const htmlPath = join(directory, `${scenario.name}.html`);
      writeFileSync(htmlPath, pageFixture(scenario));
      const output = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--no-sandbox", "--dump-dom", pathToFileURL(htmlPath).href], { encoding: "utf8", maxBuffer: 5_000_000 });
      const encoded = output.match(/<output id="layout-result">([^<]+)<\/output>/u)?.[1];
      assert.ok(encoded, `${scenario.name}: mesures DOM absentes`);
      const layout = JSON.parse(encoded.replaceAll("&quot;", '"'));
      assert.ok(layout.contentBottom <= layout.safetyLimit, `${scenario.name}: contenu ${layout.contentBottom} > limite ${layout.safetyLimit}`);
      assert.ok(layout.footerBottom <= layout.pageBottom + 0.5, `${scenario.name}: footer hors page`);
      assert.ok(layout.topInset >= 48, `${scenario.name}: marge haute insuffisante (${layout.topInset}px)`);
      assert.ok(layout.logoTop >= layout.headerTop - 0.5, `${scenario.name}: logo coupé en haut`);
      assert.ok(layout.logoRight <= layout.pageRight + 0.5, `${scenario.name}: logo coupé à droite`);
      assert.ok(layout.logoBottom < layout.pageBottom, `${scenario.name}: logo coupé en bas`);
      assert.equal(layout.overlaps, false, `${scenario.name}: compteur et indication se chevauchent`);
      assert.equal(layout.clipped, false, `${scenario.name}: bloc coupé ou masqué`);
      assert.equal(layout.exportAlert, false, `${scenario.name}: l'alerte d'export serait affichée`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
