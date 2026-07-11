const PAYMENTS_ENABLED = false;
const STRIPE_CHECKOUT_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const SUCCESS_URL = "https://efficiadigital.com/paiement-reussi.html?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL = "https://efficiadigital.com/#offres";

const PRODUCTS = {
  audit: {
    envKey: "STRIPE_PRICE_AUDIT",
    name: "Audit fiche Google",
  },
  visibility: {
    envKey: "STRIPE_PRICE_VISIBILITY",
    name: "Pack Visibilité Google",
  },
  performance: {
    envKey: "STRIPE_PRICE_PERFORMANCE",
    name: "Pack Performance",
  },
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const isValidEmail = (value) => (
  typeof value === "string"
  && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
);

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestPost(context) {
  if (!PAYMENTS_ENABLED) {
    return jsonResponse({
      success: false,
      error: "Paiements bientôt disponibles.",
    }, 503);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  const productCode = typeof payload.product === "string" ? payload.product.trim() : "";
  const product = PRODUCTS[productCode];

  if (!product) {
    return jsonResponse({ success: false, error: "Invalid product." }, 400);
  }

  const stripeSecretKey = context.env.STRIPE_SECRET_KEY;
  const priceId = context.env[product.envKey];

  if (!stripeSecretKey || !priceId) {
    console.error("Stripe configuration is missing.", {
      hasSecretKey: Boolean(stripeSecretKey),
      priceEnvKey: product.envKey,
      hasPriceId: Boolean(priceId),
    });
    return jsonResponse({ success: false, error: "Stripe configuration is missing." }, 500);
  }

  const formData = new URLSearchParams();
  formData.set("mode", "payment");
  formData.set("line_items[0][price]", priceId);
  formData.set("line_items[0][quantity]", "1");
  formData.set("success_url", SUCCESS_URL);
  formData.set("cancel_url", CANCEL_URL);
  formData.set("billing_address_collection", "required");
  formData.set("metadata[product_code]", productCode);
  formData.set("metadata[product_name]", product.name);
  formData.set("metadata[source]", "efficiadigital.com");

  if (isValidEmail(payload.customer_email)) {
    formData.set("customer_email", payload.customer_email.trim().toLowerCase());
  }

  const stripeResponse = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: formData,
  });

  const responseText = await stripeResponse.text();
  let stripeData = null;
  try {
    stripeData = JSON.parse(responseText);
  } catch {
    stripeData = null;
  }

  if (!stripeResponse.ok) {
    console.error("Stripe Checkout request failed", stripeResponse.status, responseText);
    return jsonResponse({
      success: false,
      error: "Stripe Checkout request failed.",
      status: stripeResponse.status,
    }, 502);
  }

  if (!stripeData?.url) {
    console.error("Stripe Checkout did not return a URL.", responseText);
    return jsonResponse({ success: false, error: "Stripe Checkout URL is missing." }, 502);
  }

  return jsonResponse({
    success: true,
    url: stripeData.url,
  });
}
