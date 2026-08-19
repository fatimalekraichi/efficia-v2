import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { onRequestPost as checkoutStatus } from "../functions/api/checkout-status.js";
import { onRequestGet as freeDiagnosticContext } from "../functions/api/admin/free-diagnostic-context/[analysisId].js";
import { buildFreeDiagnosticProductionContext } from "../functions/lib/freeDiagnosticProductionLink.js";

const root = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), "utf8");

const publicPages = [
  "index.html",
  "audit-google-business.html",
  "achat.html",
  "paiement-reussi.html",
  "mentions-legales.html",
  "cgv.html",
  "politique-confidentialite.html",
  "politique-cookies.html",
  "404.html",
];

test("Clarity est centralisé et différé jusqu’au consentement explicite", async () => {
  const [analytics, cookies, ...pages] = await Promise.all([
    readProjectFile("js/analytics.js"),
    readProjectFile("js/cookies.js"),
    ...publicPages.map(readProjectFile),
  ]);

  assert.match(analytics, /CLARITY_PROJECT_ID = "y4bpqqcrs7"/);
  assert.match(analytics, /script\.src = `https:\/\/www\.clarity\.ms\/tag\/\$\{CLARITY_PROJECT_ID\}`/);
  assert.doesNotMatch(analytics, /loadClarity\(\);\s*\}\)\(\);$/);
  assert.match(cookies, /CONSENT_VERSION = "2026-08-18-clarity-v1"/);
  assert.match(cookies, /storedConsent\.analytics/);
  assert.match(cookies, /analytics\?\.loadClarity/);
  assert.match(cookies, /analytics\?\.denyClarityConsent/);
  assert.doesNotMatch(cookies, /data-cookie-dismiss|dismissWithFullConsent/);
  assert.match(analytics, /callClarity\("consentv2", \{[\s\S]*analytics_Storage: "denied"/);
  assert.match(analytics, /callClarity\("consent", false\)/);
  assert.match(analytics, /Max-Age=0/);
  assert.match(cookies, /previouslyAllowed && clarityWasLoaded/);
  assert.match(cookies, /window\.location\.reload\(\)/);

  const acceptClass = cookies.match(/class="([^"]*cookie-btn--choice[^"]*)"[^>]*data-cookie-accept/)?.[1];
  const refuseClass = cookies.match(/class="([^"]*cookie-btn--choice[^"]*)"[^>]*data-cookie-refuse/)?.[1];
  assert.equal(acceptClass, refuseClass, "Accepter et Refuser doivent avoir une visibilité comparable");

  pages.forEach((html, index) => {
    assert.match(html, /js\/analytics\.js/u, `${publicPages[index]} doit charger l’orchestrateur analytics`);
    assert.match(html, /js\/cookies\.js/u, `${publicPages[index]} doit charger le consentement`);
    assert.doesNotMatch(html, /clarity\.ms\/tag/u, `${publicPages[index]} ne doit pas intégrer Clarity directement`);
    assert.doesNotMatch(html, /cloudflareinsights\.com\/beacon|data-cf-beacon/u, `${publicPages[index]} ne doit pas dupliquer Cloudflare Web Analytics`);
    assert.match(html, /data-cookie-preferences>Gérer mes préférences de confidentialité</u, `${publicPages[index]} doit permettre le retrait du consentement`);
  });
});

test("les textes simplifiés conservent les actions explicites de consentement", async () => {
  const [cookies, cookieStyles] = await Promise.all([
    readProjectFile("js/cookies.js"),
    readProjectFile("css/cookies.css"),
  ]);

  assert.match(cookies, /<strong>Votre confidentialité<\/strong>/);
  assert.match(cookies, /Nous utilisons Microsoft Clarity pour améliorer le site, uniquement avec votre accord\. Vous pouvez changer d’avis à tout moment\. <a href="\/politique-cookies">En savoir plus<\/a>/);
  assert.match(cookies, /<h2 id="cookie-preferences-title">Gérer mes préférences<\/h2>/);
  assert.match(cookies, /Clarity reste désactivé tant que vous ne l’acceptez pas\./);
  assert.match(cookies, /<strong>Fonctions nécessaires<\/strong>\s*<span>Indispensables au fonctionnement et à la sécurité du site\.<\/span>/);
  assert.match(cookies, /<strong>Mesure d’audience<\/strong>\s*<span>Nous aide à comprendre l’utilisation du site et à l’améliorer\.<\/span>/);
  assert.match(cookies, /data-cookie-close>Retour<\/button>/);
  assert.match(cookies, /data-cookie-save>Enregistrer<\/button>/);
  assert.doesNotMatch(cookies, /Mesure d’audience avec Clarity|masquage renforcé|Enregistrer mon choix|>Annuler<\/button>/);

  assert.match(cookieStyles, /\.cookie-btn\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(cookieStyles, /\.cookie-consent__actions \[data-cookie-accept\],\s*\.cookie-consent__actions \[data-cookie-refuse\]\s*\{\s*flex:\s*0 0 123px/);
  assert.match(cookieStyles, /flex:\s*1 1 calc\(50% - 4px\)/);

  assert.match(cookies, /target\.matches\("\[data-cookie-accept\]"\)\) applyConsent\(true\)/);
  assert.match(cookies, /target\.matches\("\[data-cookie-refuse\]"\)\) applyConsent\(false\)/);
  assert.match(cookies, /target\.matches\("\[data-cookie-save\]"\)\) applyConsent\(analyticsInput\.checked\)/);
  assert.match(cookies, /target\.matches\("\[data-cookie-close\]"\)\) closeCookiePreferences\(\)/);
  assert.doesNotMatch(cookies, /data-cookie-close[^\n]*applyConsent/);
});

test("les pages administratives ne chargent jamais Clarity", async () => {
  const adminFiles = [
    "admin.html",
    "admin/new-audit/index.html",
    "admin/free-diagnostic-production/index.html",
    "functions/admin/audit-review/[analysisId].js",
    "js/admin-audit-review.js",
    "js/admin-new-audit.js",
    "js/admin.js",
  ];
  const sources = await Promise.all(adminFiles.map(readProjectFile));
  sources.forEach((source, index) => {
    assert.doesNotMatch(source, /clarity\.ms|js\/analytics\.js|window\.clarity|data-clarity/u,
      `${adminFiles[index]} ne doit pas charger Clarity`);
  });
});

test("chaque étape du tunnel appelle l’événement correspondant au résultat réel", async () => {
  const [app, purchase, success, analytics] = await Promise.all([
    readProjectFile("js/app.js"),
    readProjectFile("js/purchase.js"),
    readProjectFile("js/checkout-success.js"),
    readProjectFile("js/analytics.js"),
  ]);
  for (const eventName of [
    "diagnostic_cta_click",
    "diagnostic_step_1_view",
    "diagnostic_step_1_complete",
    "diagnostic_step_2_view",
    "diagnostic_submitted",
    "diagnostic_confirmation_view",
  ]) assert.match(app, new RegExp(`trackAnalyticsEvent\\?\\.\\("${eventName}"`));
  assert.doesNotMatch(app, /trackAnalyticsEvent\?\.\("diagnostic_result_view"\)/);
  assert.match(purchase, /trackAnalyticsEvent\?\.\("begin_checkout", \{ offer: selectedOffer \}\)/);
  assert.match(success, /efficia:checkout-confirmed/);
  assert.match(analytics, /audit_detail_click/);
  assert.match(analytics, /audit_offer_click/);
  assert.match(analytics, /pack_offer_click/);
});

test("les événements Clarity sont limités à la liste autorisée et aux offres génériques", async () => {
  const analytics = await readProjectFile("js/analytics.js");
  const expectedEvents = [
    "diagnostic_cta_click",
    "diagnostic_step_1_view",
    "diagnostic_step_1_complete",
    "diagnostic_step_2_view",
    "diagnostic_submitted",
    "diagnostic_confirmation_view",
    "audit_detail_click",
    "audit_offer_click",
    "pack_offer_click",
    "begin_checkout",
    "checkout_success_view",
  ];
  expectedEvents.forEach((eventName) => assert.match(analytics, new RegExp(`"${eventName}"`)));
  assert.doesNotMatch(analytics, /"diagnostic_result_view"/);
  assert.match(analytics, /new Set\(\["audit", "visibility", "performance"\]\)/);
  assert.doesNotMatch(analytics, /landing_view|firstName|email|company|city|googleBusiness|orderId|taskId|session_id/);
});

test("les formulaires et résultats personnels portent un masque Clarity explicite", async () => {
  const [home, purchase, success] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("achat.html"),
    readProjectFile("paiement-reussi.html"),
  ]);
  assert.match(home, /id="diagnostic-modal"[^>]*data-clarity-mask="true"/);
  assert.match(purchase, /data-purchase-form[^>]*data-clarity-mask="true"/);
  assert.match(success, /data-checkout-success[^>]*data-clarity-mask="true"/);
  assert.doesNotMatch(`${home}${purchase}${success}`, /data-clarity-unmask/);
});

test("Score Efficia ne reçoit plus de données personnelles par paramètres d’URL", async () => {
  const [helper, reviewPage, reviewClient, generator, newAudit] = await Promise.all([
    readProjectFile("functions/lib/freeDiagnosticProductionLink.js"),
    readProjectFile("functions/admin/audit-review/[analysisId].js"),
    readProjectFile("js/admin-audit-review.js"),
    readProjectFile("admin/free-diagnostic-production/index.html"),
    readProjectFile("js/admin-new-audit.js"),
  ]);
  const combined = `${helper}\n${reviewPage}\n${reviewClient}\n${generator}\n${newAudit}`;
  assert.doesNotMatch(combined, /buildFreeDiagnosticProductionQuery|freeDiagnosticQuery/);
  assert.doesNotMatch(generator, /params\.get\("(?:company|city|firstName|email|offer|orderId|taskId|googleBusinessUrl)"\)/);
  assert.match(generator, /params\.get\("analysisId"\)/);
  assert.match(generator, /\/api\/admin\/free-diagnostic-context\//);
  assert.doesNotMatch(newAudit, /params\.get\("(?:company|companyName|city|firstName|email|googleBusinessUrl)"\)/);
});

test("le contexte Score Efficia reste complet côté serveur", () => {
  const context = buildFreeDiagnosticProductionContext({
    business: { nom: "Entreprise", ville: "Bruxelles", normalized: { google_url: "https://maps.example/fiche" } },
  }, {
    first_name: "Fatima",
    email: "fatima@example.com",
    offer_code: "audit",
    order_id: "order-1",
    task_id: "task-1",
  });
  assert.deepEqual(context, {
    company: "Entreprise",
    city: "Bruxelles",
    firstName: "Fatima",
    email: "fatima@example.com",
    offer: "audit",
    orderId: "order-1",
    taskId: "task-1",
    googleBusinessUrl: "https://maps.example/fiche",
  });
});

test("le statut de paiement est vérifié dans D1 sans exposer de donnée client", async () => {
  const request = new Request("https://example.com/api/checkout-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: "cs_test_abcdefghijk" }),
  });
  const db = {
    prepare(sql) {
      assert.match(sql, /WHERE stripe_session_id = \?/);
      return {
        bind(value) {
          assert.equal(value, "cs_test_abcdefghijk");
          return { first: async () => ({ offer_code: "audit", status: "paid" }) };
        },
      };
    },
  };
  const response = await checkoutStatus({ request, env: { ORDERS_DB: db } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, confirmed: true, offer: "audit" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("le statut de paiement refuse un identifiant invalide et ne confirme pas une commande absente", async () => {
  const invalid = await checkoutStatus({
    request: new Request("https://example.com/api/checkout-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "order-personal-data" }),
    }),
    env: { ORDERS_DB: {} },
  });
  assert.equal(invalid.status, 400);

  const pending = await checkoutStatus({
    request: new Request("https://example.com/api/checkout-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "cs_live_abcdefghijk" }),
    }),
    env: {
      ORDERS_DB: {
        prepare: () => ({ bind: () => ({ first: async () => null }) }),
      },
    },
  });
  assert.deepEqual(await pending.json(), { success: true, confirmed: false, offer: null });
});

test("le contexte personnel du diagnostic gratuit reste protégé par la session admin", async () => {
  const response = await freeDiagnosticContext({
    request: new Request("https://example.com/api/admin/free-diagnostic-context/analysis-123"),
    params: { analysisId: "analysis-123" },
    env: {},
  });
  assert.equal(response.status, 401);
});

test("les données personnelles ne sont plus journalisées dans la console du navigateur", async () => {
  const [app, purchase, subscribe] = await Promise.all([
    readProjectFile("js/app.js"),
    readProjectFile("js/purchase.js"),
    readProjectFile("functions/subscribe.js"),
  ]);
  assert.doesNotMatch(`${app}\n${purchase}\n${subscribe}`, /efficiaLeadPayload/);
  assert.doesNotMatch(`${app}\n${purchase}`, /console\.log/);
  assert.doesNotMatch(`${app}\n${purchase}\n${subscribe}`, /console\.error\([^\n]*(?:payload|email|company|city|google_business|session_id)/i);
});

test("la CSP publique autorise uniquement les fournisseurs nécessaires", async () => {
  const headers = await readProjectFile("_headers");
  assert.match(headers, /https:\/\/\*\.clarity\.ms/);
  assert.match(headers, /https:\/\/c\.bing\.com/);
  assert.match(headers, /script-src[^\n]*https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(headers, /connect-src 'self'/);
  for (const policy of headers.match(/Content-Security-Policy:[^\n]+/g) || []) {
    const connectSource = policy.match(/connect-src ([^;]+)/)?.[1] || "";
    assert.doesNotMatch(connectSource, /cloudflareinsights\.com/);
  }
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /Referrer-Policy: strict-origin/);
  assert.doesNotMatch(headers, /google-analytics|googletagmanager|facebook\.net/);
});
