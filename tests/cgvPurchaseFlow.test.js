import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { onRequestPost as createCheckoutSession } from "../functions/create-checkout-session.js";
import { onRequestPost as prepareCheckout } from "../functions/prepare-checkout.js";
import { onRequestPost as stripeWebhook } from "../functions/stripe-webhook.js";
import { ACTIVE_CGV_VERSION } from "../functions/lib/cgvAcceptance.js";

const root = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), "utf8");

const validPurchase = {
  product: "audit",
  full_name: "Fatima Lekraichi",
  email: "fatima@example.com",
  company_name: "Efficia Digital",
  google_business_url: "https://maps.google.com/example",
  unknown_google_business: false,
  city: "",
  cgv_accepted: true,
  cgv_version: ACTIVE_CGV_VERSION,
};

const checkoutEnv = {
  SITE_URL: "https://efficiadigital.com",
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_PRICE_AUDIT: "price_audit",
  STRIPE_PRICE_VISIBILITY: "price_visibility",
  STRIPE_PRICE_PERFORMANCE: "price_performance",
  MAILERLITE_API_KEY: "mailer_test_example",
  MAILERLITE_PRODUCTION_AUDIT_PROSPECT_GROUP_ID: "group-audit",
};

const jsonRequest = (url, body) => new Request(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const responseWithJson = (body, init = {}) => new Response(JSON.stringify(body), {
  status: init.status || 200,
  headers: { "Content-Type": "application/json" },
});

test("l’interface exige une acceptation explicite et accessible des CGV", async () => {
  const [html, script] = await Promise.all([
    readProjectFile("achat.html"),
    readProjectFile("js/purchase.js"),
  ]);

  const checkbox = html.match(/<input\s+[\s\S]*?id="cgv-acceptance"[\s\S]*?>/)?.[0] || "";
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /name="cgv_acceptance"/);
  assert.match(checkbox, /\brequired\b/);
  assert.doesNotMatch(checkbox, /\bchecked\b/);
  assert.match(html, /<label for="cgv-acceptance">/);
  assert.match(html, /href="\/cgv" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /data-cgv-error role="alert" aria-live="polite"/);
  assert.match(html, new RegExp(ACTIVE_CGV_VERSION));

  const form = html.match(/<form class="purchase-form"[\s\S]*?<\/form>/)?.[0] || "";
  assert.equal((form.match(/name="cgv_acceptance"/g) || []).length, 1);
  assert.doesNotMatch(form, /confirme[^<]*(?:activité|professionnel)|name="(?:bce|vat|tva|siren|siret|rcs|professional_id)"/iu);
  assert.match(form, /name="company_name"/);
  assert.match(form, /name="google_business_url"/);
  assert.match(form, /name="city"/);

  assert.match(script, /if \(!cgvAcceptance\?\.checked\)/);
  assert.match(script, /cgvAcceptance\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /cgv_accepted: true/);
  assert.match(script, /cgv_version: formElement\.dataset\.cgvVersion/);
  assert.match(script, /Vous devez lire et accepter les Conditions générales de vente avant de poursuivre\./);
});

test("le serveur rejette toute acceptation absente, fausse ou ambiguë avant les effets externes", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error("Aucun appel externe ne doit avoir lieu");
  };

  try {
    const invalidValues = [undefined, false, null, "true", 1, {}, []];
    for (const value of invalidValues) {
      const payload = { ...validPurchase };
      if (value === undefined) delete payload.cgv_accepted;
      else payload.cgv_accepted = value;

      const response = await prepareCheckout({
        request: jsonRequest("https://efficiadigital.com/prepare-checkout", payload),
        env: checkoutEnv,
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "CGV_ACCEPTANCE_REQUIRED");
    }

    const obsoleteVersion = await prepareCheckout({
      request: jsonRequest("https://efficiadigital.com/prepare-checkout", {
        ...validPurchase,
        cgv_version: "2026-08-18",
      }),
      env: checkoutEnv,
    });
    assert.equal(obsoleteVersion.status, 400);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("une acceptation valide conserve le parcours et ajoute la preuve serveur à Stripe", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/api/fields")) {
      return responseWithJson({
        data: [
          "first_name",
          "last_name",
          "company",
          "city",
          "google_business_url",
          "selected_offer",
          "prospect_status",
          "google_business_link_known",
        ].map((key) => ({ key })),
      });
    }
    if (String(url).includes("/api/subscribers")) {
      return responseWithJson({ data: { id: "subscriber-1" } });
    }
    if (String(url).includes("api.stripe.com/v1/checkout/sessions")) {
      return responseWithJson({ url: "https://checkout.stripe.com/session" });
    }
    throw new Error(`Appel inattendu : ${url}`);
  };

  try {
    const response = await prepareCheckout({
      request: jsonRequest("https://efficiadigital.com/prepare-checkout", {
        ...validPurchase,
        cgv_accepted_at: "1900-01-01T00:00:00.000Z",
      }),
      env: checkoutEnv,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, "https://checkout.stripe.com/session");

    const stripeCall = calls.find(({ url }) => url.includes("api.stripe.com/v1/checkout/sessions"));
    assert.ok(stripeCall);
    const stripeBody = new URLSearchParams(stripeCall.options.body);
    assert.equal(stripeBody.get("metadata[cgv_version]"), ACTIVE_CGV_VERSION);
    const acceptedAt = stripeBody.get("metadata[cgv_accepted_at]");
    assert.match(acceptedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(Number.isNaN(Date.parse(acceptedAt)), false);
    assert.notEqual(acceptedAt, "1900-01-01T00:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("l’ancien endpoint direct ne permet pas de contourner l’acceptation", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return responseWithJson({ url: "https://checkout.stripe.com/session" });
  };

  try {
    const rejected = await createCheckoutSession({
      request: jsonRequest("https://efficiadigital.com/create-checkout-session", { product: "audit" }),
      env: checkoutEnv,
    });
    assert.equal(rejected.status, 400);
    assert.equal(fetchCount, 0);

    const accepted = await createCheckoutSession({
      request: jsonRequest("https://efficiadigital.com/create-checkout-session", {
        product: "audit",
        cgv_accepted: true,
        cgv_version: ACTIVE_CGV_VERSION,
      }),
      env: checkoutEnv,
    });
    assert.equal(accepted.status, 200);
    assert.equal(fetchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const createOrdersDb = () => {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              writes.push({ sql, args });
              return { meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes("FROM orders")) {
                return {
                  order_id: "order-existing",
                  stripe_session_id: "cs_test_cgv",
                  offer_code: "audit",
                  status: "paid",
                };
              }
              return null;
            },
          };
        },
      };
    },
  };
};

const signedWebhookRequest = ({ session, secret }) => {
  const payload = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: session },
  });
  const timestamp = "1787076000";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return new Request("https://efficiadigital.com/stripe-webhook", {
    method: "POST",
    headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
};

const paidSession = (metadata) => ({
  id: "cs_test_cgv",
  payment_intent: "pi_test_cgv",
  payment_status: "paid",
  customer_details: { email: "fatima@example.com", name: "Fatima Lekraichi" },
  amount_total: 9900,
  currency: "eur",
  created: 1787076000,
  line_items: { data: [{ price: { id: "price_audit" } }] },
  metadata: {
    product_code: "audit",
    company_name: "Efficia Digital",
    ...metadata,
  },
});

test("le webhook associe la version et la date d’acceptation à la commande payée", async () => {
  const db = createOrdersDb();
  const secret = "whsec_test";
  const acceptedAt = "2026-08-18T14:00:00.000Z";
  const response = await stripeWebhook({
    request: signedWebhookRequest({
      secret,
      session: paidSession({
        cgv_version: ACTIVE_CGV_VERSION,
        cgv_accepted_at: acceptedAt,
      }),
    }),
    env: {
      STRIPE_WEBHOOK_SECRET: secret,
      STRIPE_PRICE_AUDIT: "price_audit",
      ORDERS_DB: db,
    },
  });

  assert.equal(response.status, 200);
  const orderInsert = db.writes.find(({ sql }) => sql.includes("INSERT OR IGNORE INTO orders"));
  assert.ok(orderInsert);
  assert.match(orderInsert.sql, /cgv_accepted_at/);
  assert.match(orderInsert.sql, /cgv_version/);
  assert.equal(orderInsert.args[14], acceptedAt);
  assert.equal(orderInsert.args[15], ACTIVE_CGV_VERSION);
});

test("les anciennes commandes avec la version historique restent compatibles", async () => {
  const db = createOrdersDb();
  const secret = "whsec_test";
  const historicalAcceptedAt = "2026-08-18T10:00:00.000Z";
  const response = await stripeWebhook({
    request: signedWebhookRequest({
      secret,
      session: paidSession({
        cgv_version: "2026-08-18",
        cgv_accepted_at: historicalAcceptedAt,
      }),
    }),
    env: {
      STRIPE_WEBHOOK_SECRET: secret,
      STRIPE_PRICE_AUDIT: "price_audit",
      ORDERS_DB: db,
    },
  });

  assert.equal(response.status, 200);
  const orderInsert = db.writes.find(({ sql }) => sql.includes("INSERT OR IGNORE INTO orders"));
  assert.equal(orderInsert.args[14], historicalAcceptedAt);
  assert.equal(orderInsert.args[15], "2026-08-18");
});

test("la migration CGV historique reste inchangée et la migration suivante est additive", async () => {
  const [migration, migrationFiles] = await Promise.all([
    readProjectFile("migrations/0012_order_cgv_acceptance.sql"),
    readdir(new URL("migrations/", root)),
  ]);

  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "3f73ac365c4a5d59d77c740c005327745385172c0fbde992c77a2a5fefe5d7e2",
  );
  assert.deepEqual(
    migrationFiles.filter((file) => file.endsWith(".sql")).slice(-4),
    [
      "0012_order_cgv_acceptance.sql",
      "0013_diagnostic_requests.sql",
      "0014_audit_drafts.sql",
      "0015_audit_questionnaire_snapshots.sql",
    ],
  );
});

test("les CGV définissent le Client professionnel et la rétractation B2B", async () => {
  const [successPage, cgvPage, sitemap] = await Promise.all([
    readProjectFile("paiement-reussi.html"),
    readProjectFile("cgv.html"),
    readProjectFile("sitemap.xml"),
  ]);

  assert.equal(ACTIVE_CGV_VERSION, "2026-08-18-v2");
  assert.match(cgvPage, /Version des CGV : 2026-08-18-v2/);
  assert.match(cgvPage, /Dernière mise à jour : 18 août 2026/);
  assert.match(cgvPage, /Les services Efficia Digital sont exclusivement destinés aux professionnels\./);
  assert.match(cgvPage, /Est considéré comme Client professionnel toute personne physique ou morale, publique ou privée/);
  assert.match(cgvPage, /le Client déclare agir exclusivement dans le cadre de son activité professionnelle et non à titre privé/);
  assert.match(cgvPage, /Les commandes effectuées en qualité de consommateur ne sont pas acceptées\./);
  assert.doesNotMatch(cgvPage, /Lorsque le client est un consommateur[^<]*il bénéficie du droit de rétractation/);
  assert.match(cgvPage, /le droit de rétractation de quatorze jours prévu pour les consommateurs ne s’applique pas aux commandes passées sur le site/);
  assert.match(cgvPage, /dispositions impératives éventuellement applicables/);
  assert.match(cgvPage, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(sitemap, /https:\/\/efficiadigital\.com\/cgv<\/loc>/);
  assert.match(successPage, /href="\/cgv"[^>]*>Conditions générales de vente<\/a>/);
});
