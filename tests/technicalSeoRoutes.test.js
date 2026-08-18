import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const read = (path) => readFile(new URL(path, root), "utf8");

const publicPages = new Map([
  ["index.html", "https://efficiadigital.com/"],
  ["audit-google-business.html", "https://efficiadigital.com/audit-google-business"],
  ["mentions-legales.html", "https://efficiadigital.com/mentions-legales"],
  ["politique-confidentialite.html", "https://efficiadigital.com/politique-confidentialite"],
  ["cgv.html", "https://efficiadigital.com/cgv"],
  ["politique-cookies.html", "https://efficiadigital.com/politique-cookies"],
]);

const sitemapPages = new Map(
  [...publicPages].filter(([file]) => !["mentions-legales.html", "cgv.html"].includes(file)),
);

test("les pages publiques déclarent une canonical unique sur le domaine sans www", async () => {
  for (const [file, canonical] of publicPages) {
    const html = await read(file);
    const canonicals = [...html.matchAll(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi)];

    assert.equal(canonicals.length, 1, `${file} doit avoir une seule canonical`);
    assert.equal(canonicals[0][1], canonical, `${file} doit utiliser son URL propre`);
    assert.doesNotMatch(canonicals[0][1], /^http:|\/\/www\.|\.html(?:$|[?#])/u, `${file} ne doit pas exposer une variante dupliquée`);
    assert.ok(canonicals[0][1] === "https://efficiadigital.com/" || !canonicals[0][1].endsWith("/"), `${file} ne doit pas conserver une barre finale non canonique`);
  }
});

test("la page 404 est désindexée, sans canonical et propose les trois sorties utiles", async () => {
  const html = await read("404.html");

  assert.match(html, /<meta\s+name=["']robots["']\s+content=["']noindex, follow["']/i);
  assert.doesNotMatch(html, /<link\s+rel=["']canonical["']/i);
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/#diagnostic"/);
  assert.match(html, /href="\/#offres"/);
});

test("le sitemap ne contient que les URL canoniques publiques finales", async () => {
  const sitemap = await read("sitemap.xml");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = [...sitemapPages.values()];

  assert.deepEqual(urls, expected);
  assert.equal(new Set(urls).size, urls.length, "le sitemap ne doit contenir aucun doublon");
  assert.ok(urls.every((url) => url.startsWith("https://efficiadigital.com/")));
  assert.ok(urls.every((url) => !url.includes("www.")));
  assert.ok(urls.every((url) => !url.endsWith(".html")));
  assert.ok(urls.every((url) => url === "https://efficiadigital.com/" || !url.endsWith("/")));
});

test("robots.txt autorise le site et référence le sitemap canonique", async () => {
  const robots = await read("robots.txt");

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/efficiadigital\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /www\.|\.html/u);
});

test("le comparatif avant/après présente immédiatement son caractère fictif", async () => {
  const html = await read("index.html");
  const disclosure = "Exemple fictif à visée illustrative. Les données affichées servent uniquement à comparer la présentation d’une fiche avant et après optimisation ; elles ne constituent ni un résultat client ni une promesse de performance.";

  assert.match(
    html,
    new RegExp(`<span class="section-kicker">Avant / Après</span>\\s*<h2>[^<]+</h2>\\s*<p>${disclosure}</p>`),
  );
  assert.doesNotMatch(html, /Voici l’impact concret d’une fiche Google Business travaillée avec la Méthode Efficia™\./u);
  assert.match(html, /aria-label="Note 4,1 sur 5, basée sur 23 avis"/u);
  assert.match(html, /aria-label="Note 4,2 sur 5, basée sur 128 avis"/u);
});

test("les pages transactionnelles, administratives et internes sont désindexées", async () => {
  const privatePages = [
    "achat.html",
    "paiement-reussi.html",
    "admin.html",
    "admin/index.html",
    "admin-login.html",
    "admin-login/index.html",
    "admin-order.html",
    "admin-order/index.html",
    "admin/new-audit/index.html",
    "admin/free-diagnostic-production/index.html",
    "outil-score-efficia-auto-v5.html",
  ];

  for (const file of privatePages) {
    const html = await read(file);
    assert.match(html, /<meta\s+name=["']robots["']\s+content=["']noindex,\s*(?:follow|nofollow)["']/i, `${file} doit être désindexée`);
  }
});
