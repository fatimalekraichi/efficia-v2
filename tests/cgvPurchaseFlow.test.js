import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
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
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_PRICE_AUDIT: "price_audit",
  STRIPE_PRICE_VISIBILITY: "price_visibility",
  STRIPE_PRICE_PERFORMANCE: "price_performance",
  MAILERLITE_API_KEY: "mailer_test_example",
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
        request: jsonRequest("https://example.com/prepare-checkout", payload),
        env: checkoutEnv,
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, "CGV_ACCEPTANCE_REQUIRED");
    }

    const obsoleteVersion = await prepareCheckout({
      request: jsonRequest("https://example.com/prepare-checkout", {
        ...validPurchase,
        cgv_version: "2026-07-08",
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
    if (String(url).includes("/api/groups")) {
      return responseWithJson({ data: [{ id: "group-audit", name: "Prospects - Audit (paiement en cours)" }] });
    }
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
      request: jsonRequest("https://example.com/prepare-checkout", {
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
      request: jsonRequest("https://example.com/create-checkout-session", { product: "audit" }),
      env: checkoutEnv,
    });
    assert.equal(rejected.status, 400);
    assert.equal(fetchCount, 0);

    const accepted = await createCheckoutSession({
      request: jsonRequest("https://example.com/create-checkout-session", {
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

  return new Request("https://example.com/stripe-webhook", {
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

test("les anciennes commandes sans métadonnées CGV restent compatibles", async () => {
  const db = createOrdersDb();
  const secret = "whsec_test";
  const response = await stripeWebhook({
    request: signedWebhookRequest({ secret, session: paidSession({}) }),
    env: {
      STRIPE_WEBHOOK_SECRET: secret,
      STRIPE_PRICE_AUDIT: "price_audit",
      ORDERS_DB: db,
    },
  });

  assert.equal(response.status, 200);
  const orderInsert = db.writes.find(({ sql }) => sql.includes("INSERT OR IGNORE INTO orders"));
  assert.equal(orderInsert.args[14], null);
  assert.equal(orderInsert.args[15], null);
});

test("la migration est additive et la confirmation donne accès aux CGV", async () => {
  const [migration, successPage, cgvPage] = await Promise.all([
    readProjectFile("migrations/0012_order_cgv_acceptance.sql"),
    readProjectFile("paiement-reussi.html"),
    readProjectFile("cgv.html"),
  ]);

  assert.match(migration, /ALTER TABLE orders ADD COLUMN cgv_accepted_at TEXT;/);
  assert.match(migration, /ALTER TABLE orders ADD COLUMN cgv_version TEXT;/);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DELETE\s+FROM|CREATE\s+TABLE/i);
  assert.match(successPage, /href="\/cgv"[^>]*>Conditions générales de vente<\/a>/);
  assert.match(cgvPage, /Dernière mise à jour : 18 août 2026/);
});
