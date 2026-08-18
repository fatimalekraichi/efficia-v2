import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost as createCheckoutSession } from "../functions/create-checkout-session.js";
import { onRequestPost as prepareCheckout } from "../functions/prepare-checkout.js";
import {
  resolveMailerLiteGroupId,
  resolvePublicSite,
} from "../functions/lib/environmentIsolation.js";
import { ACTIVE_CGV_VERSION } from "../functions/lib/cgvAcceptance.js";

const PRODUCTION_ORIGIN = "https://efficiadigital.com";
const PREVIEW_ORIGIN = "https://isolation-test.efficiadigital.pages.dev";

const directCheckoutPayload = {
  product: "audit",
  customer_email: "person@example.test",
  cgv_accepted: true,
  cgv_version: ACTIVE_CGV_VERSION,
};

const purchasePayload = {
  product: "audit",
  full_name: "Personne Test",
  email: "person@example.test",
  company_name: "Entreprise Test",
  google_business_url: "https://maps.google.com/example",
  unknown_google_business: false,
  city: "",
  cgv_accepted: true,
  cgv_version: ACTIVE_CGV_VERSION,
};

const jsonRequest = (origin, path, body, headers = {}) => new Request(`${origin}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const stripeEnv = (siteUrl) => ({
  SITE_URL: siteUrl,
  STRIPE_SECRET_KEY: "sk_test_local",
  STRIPE_PRICE_AUDIT: "price_audit_local",
});

const withFetchMock = async (handler, callback) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("un checkout Preview conserve exclusivement l’origine Preview", async () => {
  let stripeBody;
  await withFetchMock(async (_url, options) => {
    stripeBody = new URLSearchParams(options.body);
    return Response.json({ url: "https://checkout.stripe.test/session" });
  }, async () => {
    const response = await createCheckoutSession({
      request: jsonRequest(PREVIEW_ORIGIN, "/create-checkout-session", directCheckoutPayload),
      env: stripeEnv(PREVIEW_ORIGIN),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(
    stripeBody.get("success_url"),
    `${PREVIEW_ORIGIN}/paiement-reussi?session_id={CHECKOUT_SESSION_ID}`,
  );
  assert.equal(stripeBody.get("cancel_url"), `${PREVIEW_ORIGIN}/#offres`);
  assert.equal(stripeBody.get("metadata[source]"), PREVIEW_ORIGIN);
  assert.doesNotMatch(stripeBody.toString(), /efficiadigital\.com/);
});

test("un checkout Production conserve exclusivement l’origine canonique", async () => {
  let stripeBody;
  await withFetchMock(async (_url, options) => {
    stripeBody = new URLSearchParams(options.body);
    return Response.json({ url: "https://checkout.stripe.test/session" });
  }, async () => {
    const response = await createCheckoutSession({
      request: jsonRequest(PRODUCTION_ORIGIN, "/create-checkout-session", directCheckoutPayload),
      env: stripeEnv(PRODUCTION_ORIGIN),
    });
    assert.equal(response.status, 200);
  });

  assert.equal(
    stripeBody.get("success_url"),
    `${PRODUCTION_ORIGIN}/paiement-reussi?session_id={CHECKOUT_SESSION_ID}`,
  );
  assert.equal(stripeBody.get("cancel_url"), `${PRODUCTION_ORIGIN}/#offres`);
  assert.equal(stripeBody.get("metadata[source]"), PRODUCTION_ORIGIN);
});

test("une origine absente, inconnue ou différente de SITE_URL est refusée avant Stripe", async () => {
  let fetchCount = 0;
  await withFetchMock(async () => {
    fetchCount += 1;
    throw new Error("Stripe ne doit pas être contacté");
  }, async () => {
    const missing = await createCheckoutSession({
      request: jsonRequest(PREVIEW_ORIGIN, "/create-checkout-session", directCheckoutPayload),
      env: stripeEnv(""),
    });
    assert.equal(missing.status, 500);
    assert.equal((await missing.json()).error, "SITE_URL_NOT_CONFIGURED");

    const unknown = await createCheckoutSession({
      request: jsonRequest("https://unknown.example", "/create-checkout-session", directCheckoutPayload),
      env: stripeEnv("https://unknown.example"),
    });
    assert.equal(unknown.status, 500);
    assert.equal((await unknown.json()).error, "SITE_URL_NOT_ALLOWED");

    const formerWrongDomain = await createCheckoutSession({
      request: jsonRequest("https://efficia-v2.pages.dev", "/create-checkout-session", directCheckoutPayload),
      env: stripeEnv("https://efficia-v2.pages.dev"),
    });
    assert.equal(formerWrongDomain.status, 500);
    assert.equal((await formerWrongDomain.json()).error, "SITE_URL_NOT_ALLOWED");

    const mismatch = await createCheckoutSession({
      request: jsonRequest("https://evil.example", "/create-checkout-session", directCheckoutPayload, {
        Origin: PRODUCTION_ORIGIN,
      }),
      env: stripeEnv(PRODUCTION_ORIGIN),
    });
    assert.equal(mismatch.status, 403);
    assert.equal((await mismatch.json()).error, "SITE_ORIGIN_MISMATCH");
  });
  assert.equal(fetchCount, 0);
});

test("la résolution MailerLite ne mélange jamais Preview et Production", () => {
  const selector = { productCode: "audit", role: "prospect" };
  const productionOnly = {
    MAILERLITE_PRODUCTION_AUDIT_PROSPECT_GROUP_ID: "production-audit-prospect",
  };
  const missingPreview = resolveMailerLiteGroupId(productionOnly, "preview", selector);
  assert.equal(missingPreview.ok, false);
  assert.equal(missingPreview.error, "MAILERLITE_GROUP_NOT_CONFIGURED");
  assert.equal(missingPreview.variable, "MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID");

  const collision = resolveMailerLiteGroupId({
    ...productionOnly,
    MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID: "production-audit-prospect",
  }, "preview", selector);
  assert.equal(collision.ok, false);
  assert.equal(collision.error, "MAILERLITE_GROUP_ENVIRONMENT_COLLISION");

  const isolated = resolveMailerLiteGroupId({
    ...productionOnly,
    MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID: "preview-audit-prospect",
  }, "preview", selector);
  assert.equal(isolated.ok, true);
  assert.equal(isolated.groupId, "preview-audit-prospect");
});

test("prepare-checkout utilise uniquement le groupe Preview et ne l’expose pas au client", async () => {
  const calls = [];
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => logs.push(values.map(String).join(" "));
  console.error = (...values) => logs.push(values.map(String).join(" "));

  try {
    await withFetchMock(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/api/fields")) {
        return Response.json({ data: [{ key: "company" }] });
      }
      if (String(url).includes("connect.mailerlite.com/api/subscribers")) {
        return Response.json({ data: { id: "subscriber-test" } });
      }
      if (String(url).includes("api.stripe.com/v1/checkout/sessions")) {
        return Response.json({ url: "https://checkout.stripe.test/session" });
      }
      throw new Error(`Appel local inattendu : ${url}`);
    }, async () => {
      const response = await prepareCheckout({
        request: jsonRequest(PREVIEW_ORIGIN, "/prepare-checkout", purchasePayload),
        env: {
          ...stripeEnv(PREVIEW_ORIGIN),
          MAILERLITE_API_KEY: "mailerlite-local",
          MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID: "preview-audit-prospect",
          MAILERLITE_PRODUCTION_AUDIT_PROSPECT_GROUP_ID: "production-audit-prospect",
        },
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.mailerlite_group_id, undefined);
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const mailerLiteCall = calls.find(({ url }) => url.includes("connect.mailerlite.com/api/subscribers"));
  const mailerLiteBody = JSON.parse(mailerLiteCall.options.body);
  assert.deepEqual(mailerLiteBody.groups, ["preview-audit-prospect"]);
  assert.doesNotMatch(JSON.stringify(mailerLiteBody.groups), /production-audit-prospect/);

  const stripeCall = calls.find(({ url }) => url.includes("api.stripe.com/v1/checkout/sessions"));
  const stripeBody = new URLSearchParams(stripeCall.options.body);
  assert.equal(stripeBody.get("success_url").startsWith(PREVIEW_ORIGIN), true);
  assert.doesNotMatch(logs.join("\n"), /Personne Test|person@example\.test|Entreprise Test/i);
});

test("un groupe MailerLite requis absent bloque le checkout avant tout appel externe", async () => {
  let fetchCount = 0;
  await withFetchMock(async () => {
    fetchCount += 1;
    throw new Error("Aucun service externe ne doit être contacté");
  }, async () => {
    const response = await prepareCheckout({
      request: jsonRequest(PREVIEW_ORIGIN, "/prepare-checkout", purchasePayload),
      env: {
        ...stripeEnv(PREVIEW_ORIGIN),
        MAILERLITE_API_KEY: "mailerlite-local",
      },
    });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.error, "MAILERLITE_GROUP_NOT_CONFIGURED");
    assert.equal(body.variable, "MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID");
    assert.doesNotMatch(JSON.stringify(body), /Personne Test|person@example\.test|Entreprise Test/i);
  });
  assert.equal(fetchCount, 0);
});

test("resolvePublicSite ignore les en-têtes Origin et utilise la configuration validée", () => {
  const request = jsonRequest(PREVIEW_ORIGIN, "/prepare-checkout", {}, {
    Origin: "https://evil.example",
    Host: "evil.example",
  });
  const result = resolvePublicSite(request, { SITE_URL: PREVIEW_ORIGIN });
  assert.equal(result.ok, true);
  assert.equal(result.origin, PREVIEW_ORIGIN);

  const rootPagesOrigin = "https://efficiadigital.pages.dev";
  const rootResult = resolvePublicSite(
    jsonRequest(rootPagesOrigin, "/prepare-checkout", {}),
    { SITE_URL: rootPagesOrigin },
  );
  assert.equal(rootResult.ok, true);
  assert.equal(rootResult.origin, rootPagesOrigin);
});
