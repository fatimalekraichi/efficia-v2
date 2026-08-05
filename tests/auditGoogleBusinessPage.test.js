import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const stripHtml = (value) => String(value)
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&apos;|&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/\s+/g, " ")
  .trim();

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

test("la page Audit Google Business existe à la racine du projet", async () => {
  await access(new URL("audit-google-business.html", root));
});

test("les métadonnées SEO utilisent uniquement l’URL propre canonique", async () => {
  const html = await read("audit-google-business.html");
  assert.match(html, /<title>Audit Google Business personnalisé \| Efficia Digital<\/title>/);
  assert.match(html, /<meta name="description" content="Audit Google Business à 99 € TTC : rapport personnalisé, benchmark local, priorités et plan d’action pour améliorer votre visibilité locale\.">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/efficiadigital\.com\/audit-google-business">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/efficiadigital\.com\/audit-google-business">/);
  assert.doesNotMatch(html, /audit-google-business(?:\.html|\/)"/);
});

test("la page contient un seul H1 et une hiérarchie de titres sans saut", async () => {
  const html = await read("audit-google-business.html");
  const headings = [...html.matchAll(/<h([1-3])\b[^>]*>/g)].map((match) => Number(match[1]));
  assert.equal(headings.filter((level) => level === 1).length, 1);
  assert.equal(headings[0], 1);
  for (let index = 1; index < headings.length; index += 1) {
    assert.ok(headings[index] <= headings[index - 1] + 1, "hiérarchie de titres invalide");
  }
});

test("BreadcrumbList, Service, Offer et FAQPage sont valides et l’Organization est référencée", async () => {
  const html = await read("audit-google-business.html");
  const graph = jsonLdBlocks(html).flatMap((block) => block["@graph"] || [block]);
  const types = new Set(graph.map((item) => item["@type"]));
  for (const type of ["BreadcrumbList", "Service", "FAQPage"]) assert.ok(types.has(type));
  assert.ok(!types.has("Product"));
  const service = graph.find((item) => item["@type"] === "Service");
  assert.equal(service.provider["@id"], "https://efficiadigital.com/#organization");
  assert.equal(service.offers["@type"], "Offer");
  assert.equal(service.offers.price, "99.00");
  assert.equal(service.offers.priceCurrency, "EUR");
  assert.equal(service.offers.priceSpecification.valueAddedTaxIncluded, true);
  assert.equal(service.offers.url, "https://efficiadigital.com/achat?offre=audit");
});

test("la FAQ visible est strictement identique au JSON-LD", async () => {
  const html = await read("audit-google-business.html");
  const visibleSection = html.match(/<div class="audit-faq-list">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/)?.[1] || "";
  const visible = [...visibleSection.matchAll(/<details(?:\s+open)?><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
    .map((match) => ({ name: stripHtml(match[1]), text: stripHtml(match[2]) }));
  const graph = jsonLdBlocks(html).flatMap((block) => block["@graph"] || [block]);
  const faq = graph.find((item) => item["@type"] === "FAQPage");
  const structured = faq.mainEntity.map((item) => ({ name: item.name, text: item.acceptedAnswer.text }));
  assert.deepEqual(visible, structured);
});

test("le prix TTC, le délai, la méthode et les limites commerciales sont présents", async () => {
  const html = await read("audit-google-business.html");
  assert.match(html, /99 € TTC — paiement unique, sans abonnement/);
  assert.match(html, /3 à 5 jours ouvrés après réception des informations nécessaires/);
  assert.match(html, /Analyse structurée de plus de 20 critères/);
  assert.match(html, /29 critères répartis en six domaines/);
  assert.match(html, /ne garantit aucun classement, nombre de contacts ou résultat commercial/);
  assert.match(html, /ne sont pas comprises dans cette offre/);
  assert.match(html, /même entreprise et à la même fiche Google Business/);
  assert.match(html, /\/achat\?offre=audit/);
});

test("aucune ancienne promesse chiffrée contradictoire ne subsiste dans les contenus publics", async () => {
  const paths = [
    "audit-google-business.html",
    "index.html",
    "functions/lib/renderAnalysisHtml.js",
    "admin/free-diagnostic-production/index.html",
  ];
  const forbidden = /plus de 40|(?:^|[^A-Za-z0-9])40\+|plus de 120|plus de 150|40 points|40 critères/i;
  for (const path of paths) assert.doesNotMatch(await read(path), forbidden, path);
});

test("l’accueil contient quatre points de maillage vers la page Audit", async () => {
  const html = await read("index.html");
  const links = html.match(/href="\/audit-google-business"/g) || [];
  assert.ok(links.length >= 4, "maillage interne insuffisant");
});

test("le sitemap contient uniquement l’URL propre de la page Audit", async () => {
  const sitemap = await read("sitemap.xml");
  assert.equal((sitemap.match(/https:\/\/efficiadigital\.com\/audit-google-business/g) || []).length, 1);
  assert.doesNotMatch(sitemap, /audit-google-business(?:\.html|\/)\s*<\/loc>/);
});

test("le tunnel affiche 99 € TTC pour l’offre audit avant Stripe", async () => {
  const purchaseHtml = await read("achat.html");
  const purchaseScript = await read("js/purchase.js");
  assert.match(purchaseHtml, /data-offer-tax-note/);
  assert.match(purchaseScript, /audit:\s*{[\s\S]*?price: "99 € TTC"/);
  assert.match(purchaseScript, /TVA comprise — aucun supplément de TVA au paiement/);
});

test("les trois cartes et le tunnel affichent des prix TTC cohérents", async () => {
  const home = await read("index.html");
  const pricingCss = await read("css/pricing.css");
  const purchaseHtml = await read("achat.html");
  const purchaseScript = await read("js/purchase.js");
  const purchaseCss = await read("css/purchase.css");
  for (const amount of ["99", "349", "499"]) {
    assert.match(home, new RegExp(`<span class="price-amount">${amount} €<\\/span>\\s+<span class="price-tax">TTC<\\/span>`));
    assert.match(purchaseScript, new RegExp(`price: "${amount} € TTC"`));
  }
  assert.match(pricingCss, /\.price\s*{[\s\S]*?white-space:\s*nowrap/);
  assert.match(pricingCss, /\.price-tax\s*{[\s\S]*?font-size:\s*0\.32em;[\s\S]*?font-weight:\s*600/);
  assert.match(purchaseHtml, /data-offer-price><span class="purchase-price__amount">349 €<\/span>\s+<span class="purchase-price__tax">TTC<\/span>/);
  assert.match(purchaseScript, /className = "purchase-price__amount"/);
  assert.match(purchaseScript, /className = "purchase-price__tax"/);
  assert.match(purchaseCss, /\.purchase-summary \.purchase-price\s*{[\s\S]*?align-items:\s*baseline;[\s\S]*?white-space:\s*nowrap/);
  assert.match(purchaseCss, /\.purchase-price__tax\s*{[\s\S]*?font-size:\s*0\.28em;[\s\S]*?font-weight:\s*600/);
});

test("les prix principaux de la page Audit hiérarchisent visuellement la mention TTC", async () => {
  const html = await read("audit-google-business.html");
  const css = await read("css/audit-google-business.css");
  assert.equal((html.match(/class="audit-price-tax">TTC<\/span>/g) || []).length, 4);
  assert.match(css, /\.audit-price-display\s*{[\s\S]*?align-items:\s*baseline;[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.audit-price-display \.audit-price-tax\s*{[\s\S]*?font-size:\s*0\.28em;[\s\S]*?font-weight:\s*600/);
  assert.match(css, /scroll-padding-top:\s*92px/);
  assert.match(css, /scroll-margin-top:\s*92px/);
});

test("aucun composant initialement aria-hidden ne contient de contrôle sans inert", async () => {
  const html = await read("audit-google-business.html");
  const hiddenContainers = [...html.matchAll(/<([a-z]+)\b([^>]*aria-hidden="true"[^>]*)>([\s\S]*?)<\/\1>/gi)];
  for (const [, , attributes, content] of hiddenContainers) {
    if (/<(?:a|button|input|select|textarea)\b/i.test(content)) assert.match(attributes, /\binert\b/);
  }
});
