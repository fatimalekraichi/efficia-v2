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

function pageFixture({ business, unknown = false, terminal = false, longLabels = false }) {
  const observations = [
    ["Présentation de l’activité", "à améliorer", "La fiche ne décrit pas clairement les prestations et les raisons de vous contacter."],
    ["Avis visibles", "prioritaire", "Le volume d’avis reste inférieur aux repères locaux réellement collectés."],
    ["Photos de la fiche", "à améliorer", "Les images sont peu nombreuses au regard des informations disponibles."],
    ["Informations vérifiables", terminal ? "non vérifiable publiquement" : "à confirmer", terminal ? "Ce contrôle a reçu une réponse terminale, sans être confondu avec un élément à confirmer." : unknown ? "La zone desservie reste distincte et demande une réponse manuelle." : "Les contrôles manuels ont tous reçu une réponse terminale."],
    ["Présence sur la recherche", "conforme", "La fiche apparaît dans les résultats réellement collectés."],
    [longLabels ? "Services présents avec un intitulé professionnel particulièrement long" : "Liens d’action", "à améliorer", "La prochaine étape n’est pas suffisamment évidente pour un prospect."],
  ];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="rapport-contenu"><div class="page page-action report-v3" data-report-page="3">
    <div class="rapport-header"><div class="rapport-logo"><svg role="img" aria-label="Efficia Digital" viewBox="0 0 340 104"><rect width="340" height="104" fill="#fff"></rect><text x="8" y="64" font-size="34" fill="#0f3186">Efficia Digital</text></svg></div><span class="rap-etiquette">Diagnostic Efficia™</span></div>
    <div class="chapitre">Étape 3 · Ce que nous avons vérifié</div><h1 class="rapport-title">Une méthode rigoureuse, sans vous noyer dans la technique</h1>
    <p class="rapport-subtitle">Pour établir ce diagnostic, nous avons passé la fiche de ${escapeHtml(business)} au crible de 20 vérifications applicables à cette fiche.</p>
    <div class="v3-method-top${terminal ? " v3-method-top--with-neutral" : ""}"><div class="v3-method-number"><b>20</b><span>vérifications applicables</span><small>à cette fiche</small></div><div class="v3-method-number v3-method-number--ok"><b>5</b><span>Conformes</span><small>signaux positifs</small></div><div class="v3-method-number v3-method-number--warn"><b>3</b><span>À améliorer</span><small>à renforcer</small></div><div class="v3-method-number v3-method-number--ko"><b>8</b><span>Prioritaires</span><small>à traiter d'abord</small></div><div class="v3-method-number v3-method-number--unknown"><b>${unknown ? 4 : 0}</b><span>À confirmer</span><small>contrôles encore non résolus</small></div>${terminal ? `<div class="v3-method-number v3-method-number--neutral"><b>1</b><span>Non vérifiables</span><small>publiquement</small></div>` : ""}</div>
    <p class="v3-method-categories"><b>Domaines analysés :</b> Informations essentielles · Photos &amp; visuels · Avis clients · Contenu de la fiche · Activité &amp; animation · Visibilité locale</p>
    <section class="v3-representative"><h2>Constats représentatifs</h2>${observations.map(([title, status, text]) => `<article class="v3-observation"><b>${escapeHtml(title)}<span class="v3-status v3-status--${status === "prioritaire" ? "ko" : status === "conforme" ? "ok" : status === "à confirmer" ? "unknown" : status === "non vérifiable publiquement" ? "neutral" : "warn"}">${status}</span></b>${escapeHtml(text)}</article>`).join("")}</section>
    <div class="v3-boundary"><h2>Ce qui est réservé à l'Audit Efficia™</h2><p>L'Audit détaille les corrections exactes et les vérifications qui nécessitent l'accès au compte.</p></div>
    <div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport">Page 3/6</span></div>
  </div></div><output id="layout-result"></output><script>
    addEventListener("load", () => {
      const page = document.querySelector(".page"); const footer = page.querySelector(".pied");
      const content = [...page.children].filter((element) => !element.classList.contains("pied"));
      const rect = (element) => { const value = element.getBoundingClientRect(); return { top:value.top, right:value.right, bottom:value.bottom, left:value.left }; };
      const pageRect = rect(page); const footerRect = rect(footer); const contentBottom = Math.max(...content.map((element) => rect(element).bottom));
      const header = rect(page.querySelector(".rapport-header")); const logo = rect(page.querySelector(".rapport-logo svg"));
      const horizontalOverflow = content.some((element) => { const value = rect(element); return value.left < pageRect.left - .5 || value.right > pageRect.right + .5; });
      const clipped = content.some((element) => rect(element).bottom > pageRect.bottom + .5);
      const result = { contentBottom, footerTop:footerRect.top, safetyLimit:footerRect.top - 18, footerBottom:footerRect.bottom, pageBottom:pageRect.bottom, pageLeft:pageRect.left, pageRight:pageRect.right, headerTop:header.top, logoTop:logo.top, logoRight:logo.right, logoBottom:logo.bottom, topInset:header.top-pageRect.top, horizontalOverflow, clipped, exportAlert:contentBottom > footerRect.top - 18 };
      document.querySelector("#layout-result").textContent = JSON.stringify(result);
    });
  <\/script></body></html>`;
}

test("page 3 V3.2 conserve un contrôle géométrique sans masquage", () => {
  assert.match(css, /\.report-v3 \.v3-method-top/u);
  assert.match(css, /\.report-v3 \.v3-method-number--unknown/u);
  assert.match(css, /\.report-v3 \.v3-method-top--with-neutral/u);
  assert.match(css, /\.report-v3 \.v3-method-number--neutral/u);
  assert.doesNotMatch(css, /\.report-v3[^{}]*overflow\s*:\s*hidden/u);
  assert.match(generator, /function mesuresPageRapport\(page\)/u);
  assert.match(generator, /contentBottom <= footerRect\.top - securityGap/u);
  assert.match(generator, /appliquerCompactionLocaleRapport\(\)/u);
  assert.match(generator, /Erreur de mise en page : le contenu de la page \$\{layout\.page\}/u);
  assert.match(generator, /contrôles encore non résolus/u);
  assert.match(generator, /Non vérifiables", "publiquement", "neutral"/u);
});

test("page 3 : les scénarios variables restent au-dessus du footer sans coupe ni chevauchement", { skip: !existsSync(chrome) }, () => {
  const directory = mkdtempSync(join(tmpdir(), "efficia-page3-layout-"));
  try {
    const scenarios = [
      { name: "many-criteria", business: "Entreprise avec beaucoup de critères affichés" },
      { name: "unknowns", business: "Entreprise avec plusieurs éléments à confirmer", unknown: true },
      { name: "long-labels", business: "Entreprise générale d'électricité, domotique et installations techniques de très longue dénomination", unknown: true, longLabels: true },
      { name: "bv-electricite", business: "B&V électricité", unknown: true },
      { name: "not-verifiable-terminal", business: "Électricité du Parc", terminal: true },
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
      assert.ok(layout.topInset >= 40, `${scenario.name}: marge haute insuffisante (${layout.topInset}px)`);
      assert.ok(layout.logoTop >= layout.headerTop - 0.5, `${scenario.name}: logo coupé en haut`);
      assert.ok(layout.logoRight <= layout.pageRight + 0.5, `${scenario.name}: logo coupé à droite`);
      assert.ok(layout.logoBottom < layout.pageBottom, `${scenario.name}: logo coupé en bas`);
      assert.equal(layout.horizontalOverflow, false, `${scenario.name}: contenu horizontalement hors page`);
      assert.equal(layout.clipped, false, `${scenario.name}: bloc coupé ou masqué`);
      assert.equal(layout.exportAlert, false, `${scenario.name}: l'alerte d'export serait affichée`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
