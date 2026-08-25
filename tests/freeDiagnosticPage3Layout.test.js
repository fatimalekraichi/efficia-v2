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
  ["Visibilité locale", ["Classement local", "Attractivité vs concurrents"]],
];

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function pageFixture({ business, unknown = false, longLabels = false }) {
  const cards = domains.map(([title, sourceItems], domainIndex) => {
    const items = [...sourceItems];
    if (unknown && domainIndex === 0) {
      items[5] = "Zone desservie : à confirmer — information non vérifiable publiquement.";
      items[7] = "Aucun site web officiel n’est disponible pour comparer les coordonnées avec celles de la fiche Google.";
    }
    if (longLabels && domainIndex === 3) {
      items[2] = "Services présents avec un intitulé professionnel particulièrement long";
    }
    return `<div class="chk-rubrique"><h3>${escapeHtml(title)}<span>0/${items.length} conformes</span></h3>${items.map((label) => `<div class="chk-item"><span class="chk-ic chk-unknown">○</span><span>${escapeHtml(label)}</span></div>`).join("")}</div>`;
  }).join("");
  const unknownSuffix = unknown ? " 3 éléments restent à confirmer. Ils ne sont vérifiables que depuis l'intérieur du compte Google Business : ils restent donc volontairement à confirmer, plutôt que présenté comme un défaut." : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="rapport-contenu"><div class="page page-action">
    <div class="rapport-header"><div class="rapport-logo" style="height:52px">Efficia Digital</div><span class="rap-etiquette">Diagnostic Efficia™</span></div>
    <div class="chapitre">Étape 3 · Ce que nous avons vérifié</div><h1 class="rapport-title">Ce que nous avons analysé</h1>
    <p class="rapport-subtitle">Pour établir ce diagnostic, nous avons passé la fiche de ${escapeHtml(business)} au crible de 29 vérifications — les mêmes que fait un particulier, sans s'en rendre compte, avant de choisir qui appeler pour des travaux d’électricité, autour de Arlon.</p>
    <div class="chk-compteur"><span>✓ 15 éléments conformes</span><span>! 6 à améliorer</span><span>✕ 5 prioritaires</span>${unknown ? "<span>○ 3 à confirmer</span>" : ""}</div>
    <div class="chk-grid">${cards}</div>
    <div class="chk-legend"><strong>Légende</strong> — ✓ conforme&nbsp;&nbsp;·&nbsp;&nbsp;! à améliorer&nbsp;&nbsp;·&nbsp;&nbsp;✕ prioritaire&nbsp;&nbsp;·&nbsp;&nbsp;○ à confirmer manuellement.</div>
    <p class="rapport-explication rapport-explication--methode">Cette analyse reproduit le regard d'un client qui consulte votre fiche, compare les informations disponibles et observe les entreprises concurrentes.${unknownSuffix}</p>
    <p class="rapport-explication rapport-explication--reassurance">Vous n'avez pas besoin de tout modifier en même temps. Nous avons isolé les trois actions les plus susceptibles d'améliorer rapidement la clarté et la crédibilité de votre fiche.</p>
    <div class="next-hint">Page suivante : vos trois priorités <b>→</b></div>
    <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport">Page 3/6</span></div>
  </div></div><output id="layout-result"></output><script>
    addEventListener("load", () => {
      const page = document.querySelector(".page"); const footer = page.querySelector(".pied");
      const content = [...page.children].filter((element) => !element.classList.contains("pied"));
      const contentBottom = Math.max(...content.map((element) => element.offsetTop + element.offsetHeight));
      const rect = (element) => { const value = element.getBoundingClientRect(); return { top:value.top, right:value.right, bottom:value.bottom, left:value.left }; };
      const next = rect(page.querySelector(".next-hint")); const counter = rect(page.querySelector(".pagination-rapport"));
      const overlaps = next.left < counter.right && next.right > counter.left && next.top < counter.bottom && next.bottom > counter.top;
      const clipped = content.some((element) => element.getBoundingClientRect().bottom > page.getBoundingClientRect().bottom + 0.5);
      const result = { contentBottom, footerTop:footer.offsetTop, safetyLimit:footer.offsetTop - 12, footerBottom:rect(footer).bottom, pageBottom:rect(page).bottom, overlaps, clipped, exportAlert:contentBottom > footer.offsetTop - 12 };
      document.querySelector("#layout-result").textContent = JSON.stringify(result);
    });
  <\/script></body></html>`;
}

test("la correction de page 3 reste locale et conserve le contrôle anti-débordement", () => {
  assert.match(css, /\.page-action \.rapport-explication/u);
  assert.match(css, /\.page-action \.pied\{bottom:6mm/u);
  assert.doesNotMatch(css, /\.page-action[^{}]*overflow\s*:\s*hidden/u);
  assert.match(generator, /if\(contentBottom > footerTop - 12\)/u);
  assert.match(generator, /Erreur de mise en page : le contenu de la page \$\{layout\.page\}/u);
  assert.match(generator, /<p class="rapport-explication rapport-explication--methode">Cette analyse reproduit le regard d'un client/u);
  assert.match(generator, /<p class="rapport-explication rapport-explication--reassurance">Vous n'avez pas besoin de tout modifier en même temps/u);
  assert.doesNotMatch(generator, /rapport-explication--reassurance">Rassurez-vous/u);
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
      const output = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom", pathToFileURL(htmlPath).href], { encoding: "utf8", maxBuffer: 5_000_000 });
      const encoded = output.match(/<output id="layout-result">([^<]+)<\/output>/u)?.[1];
      assert.ok(encoded, `${scenario.name}: mesures DOM absentes`);
      const layout = JSON.parse(encoded.replaceAll("&quot;", '"'));
      assert.ok(layout.contentBottom <= layout.safetyLimit, `${scenario.name}: contenu ${layout.contentBottom} > limite ${layout.safetyLimit}`);
      assert.ok(layout.footerBottom <= layout.pageBottom + 0.5, `${scenario.name}: footer hors page`);
      assert.equal(layout.overlaps, false, `${scenario.name}: compteur et indication se chevauchent`);
      assert.equal(layout.clipped, false, `${scenario.name}: bloc coupé ou masqué`);
      assert.equal(layout.exportAlert, false, `${scenario.name}: l'alerte d'export serait affichée`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
