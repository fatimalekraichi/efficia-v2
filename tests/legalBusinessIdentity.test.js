import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const footerPages = [
  "index.html",
  "audit-google-business.html",
  "mentions-legales.html",
  "cgv.html",
  "politique-confidentialite.html",
  "politique-cookies.html",
];

const legalPages = [
  "mentions-legales.html",
  "cgv.html",
  "politique-confidentialite.html",
  "politique-cookies.html",
];

const publicHtmlPages = [
  "index.html",
  "audit-google-business.html",
  "mentions-legales.html",
  "cgv.html",
  "politique-confidentialite.html",
  "politique-cookies.html",
  "404.html",
  "achat.html",
  "paiement-reussi.html",
];

test("les mentions légales affichent l’identité, l’adresse, la BCE et la TVA exactes", async () => {
  const html = await read("mentions-legales.html");

  assert.match(html, /Efficia Digital est une activité indépendante enregistrée à la Banque-Carrefour des Entreprises sous le numéro 0686\.993\.590\./u);
  assert.match(html, /<strong>Adresse :<\/strong><br>Am Bommert 18\/01<br>6700 Arlon<br>Belgique/u);
  assert.match(html, /<strong>Numéro d’entreprise \(BCE\) :<\/strong> 0686\.993\.590/u);
  assert.match(html, /<strong>Numéro de TVA :<\/strong> BE 0686\.993\.590/u);
  assert.match(html, /Fatima Lekraichi/u);
});

test("l’hébergeur Cloudflare est identifié avec son adresse et un lien HTTPS", async () => {
  const html = await read("mentions-legales.html");

  assert.match(html, /<strong>Hébergeur :<\/strong> Cloudflare, Inc\./u);
  assert.match(html, /101 Townsend St\./u);
  assert.match(html, /San Francisco, CA 94107/u);
  assert.match(html, /États-Unis/u);
  assert.match(html, /<a href="https:\/\/www\.cloudflare\.com\/">https:\/\/www\.cloudflare\.com\/<\/a>/u);
});

test("l’adresse postale reste limitée aux mentions légales et aux CGV", async () => {
  const allowedPages = new Set(["mentions-legales.html", "cgv.html"]);

  for (const file of publicHtmlPages) {
    const html = await read(file);
    if (allowedPages.has(file)) {
      assert.match(html, /Am Bommert 18\/01/u, file);
      assert.match(html, /6700 Arlon/u, file);
      assert.match(html, /Belgique/u, file);
    } else {
      assert.doesNotMatch(html, /Am Bommert 18\/01|6700 Arlon/u, file);
    }
  }
});

test("l’adresse postale est absente des footers et des données structurées", async () => {
  for (const file of publicHtmlPages) {
    const html = await read(file);
    const footer = html.match(/<footer class="footer">[\s\S]*?<\/footer>/u)?.[0] || "";
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)]
      .map((match) => match[1])
      .join("\n");

    assert.doesNotMatch(footer, /Am Bommert 18\/01|6700 Arlon/u, file);
    assert.doesNotMatch(jsonLd, /Am Bommert 18\/01|6700 Arlon/u, file);
  }
});

test("les mentions légales et les CGV sont publiques mais non indexables", async () => {
  for (const file of ["mentions-legales.html", "cgv.html"]) {
    const html = await read(file);
    const robots = html.match(/<meta\s+name="robots"\s+content="noindex, follow">/gu) || [];

    assert.equal(robots.length, 1, file);
    assert.equal((html.match(/<meta\s+name="robots"/gu) || []).length, 1, file);
    assert.match(html, /<link rel="canonical" href="https:\/\/efficiadigital\.com\/(?:mentions-legales|cgv)" \/>/u, file);
  }
});

test("le sitemap exclut les pages noindex et conserve les pages commerciales", async () => {
  const sitemap = await read("sitemap.xml");

  assert.doesNotMatch(sitemap, /https:\/\/efficiadigital\.com\/(?:mentions-legales|cgv)<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/efficiadigital\.com\/<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/efficiadigital\.com\/audit-google-business<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/efficiadigital\.com\/politique-confidentialite<\/loc>/u);
  assert.match(sitemap, /<loc>https:\/\/efficiadigital\.com\/politique-cookies<\/loc>/u);
});

test("robots.txt autorise l’exploration des mentions légales et des CGV", async () => {
  const robots = await read("robots.txt");

  assert.doesNotMatch(robots, /Disallow:\s*\/(?:mentions-legales|cgv)/iu);
  assert.match(robots, /^Allow: \/$/mu);
});

test("aucune ancienne mention provisoire ou placeholder juridique ne subsiste", async () => {
  const combined = (await Promise.all(legalPages.map(read))).join("\n");

  assert.doesNotMatch(combined, /(?:activité|entreprise) en cours de création/iu);
  assert.doesNotMatch(combined, /(?:TVA|numéro d’entreprise)[^<\n]*en cours d’attribution/iu);
  assert.doesNotMatch(combined, /adresse[^<\n]*(?:à compléter|a compléter)/iu);
  assert.doesNotMatch(combined, /hébergeur[^<\n]*(?:à compléter|a compléter)/iu);
  assert.doesNotMatch(combined, /\[à compléter[^\]]*\]/iu);
});

test("les libellés BCE et TVA restent strictement distincts", async () => {
  const html = await read("mentions-legales.html");
  const companyLine = html.match(/<p><strong>Numéro d’entreprise[^<]*<\/strong>[^<]*<\/p>/u)?.[0] || "";
  const vatLine = html.match(/<p><strong>Numéro de TVA[^<]*<\/strong>[^<]*<\/p>/u)?.[0] || "";

  assert.match(companyLine, /> 0686\.993\.590<\/p>/u);
  assert.doesNotMatch(companyLine, /BE 0686\.993\.590|TVA/u);
  assert.match(vatLine, /BE 0686\.993\.590/u);
  assert.doesNotMatch(vatLine, /BCE/u);
});

test("les six footers conservent uniquement la mention BCE", async () => {
  for (const file of footerPages) {
    const html = await read(file);
    const footer = html.match(/<footer class="footer">[\s\S]*?<\/footer>/u)?.[0] || "";

    assert.equal((footer.match(/BCE 0686\.993\.590/gu) || []).length, 1, file);
    assert.doesNotMatch(footer, /BE 0686\.993\.590|Numéro de TVA/u, file);
  }
});

test("les six footers conservent les quatre liens juridiques", async () => {
  for (const file of footerPages) {
    const html = await read(file);
    const footer = html.match(/<footer class="footer">[\s\S]*?<\/footer>/u)?.[0] || "";

    assert.match(footer, /href="\/mentions-legales"/u, file);
    assert.match(footer, /href="\/cgv"/u, file);
    assert.match(footer, /href="\/politique-confidentialite"/u, file);
    assert.match(footer, /href="\/politique-cookies"/u, file);
  }
});

test("les pages juridiques conservent leur structure publique", async () => {
  for (const file of legalPages) {
    const html = await read(file);
    assert.equal((html.match(/<h1\b/gu) || []).length, 1, file);
    assert.equal((html.match(/<main class="legal-page">/gu) || []).length, 1, file);
    assert.equal((html.match(/<article class="legal-content">/gu) || []).length, 1, file);
    assert.equal((html.match(/<footer class="footer">/gu) || []).length, 1, file);
  }
});

test("le footer conserve son comportement responsive sans débordement imposé", async () => {
  const css = await read("css/footer.css");

  assert.match(css, /\.footer-bottom\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/u);
  assert.match(css, /@media \(max-width: 560px\)\s*\{[\s\S]*?\.footer-bottom\s*\{[\s\S]*?flex-direction:\s*column;/u);
});
