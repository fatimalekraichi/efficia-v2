const STRIPE_LINE_ITEMS_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const MAILERLITE_GROUPS_ENDPOINT = "https://connect.mailerlite.com/api/groups";
const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

const PRODUCT_GROUPS = [
  {
    priceEnvKey: "STRIPE_PRICE_AUDIT",
    productName: "Audit fiche Google",
    mailerLiteGroupName: "Clients - Audit fiche Google",
  },
  {
    priceEnvKey: "STRIPE_PRICE_VISIBILITY",
    productName: "Pack Visibilité Google",
    mailerLiteGroupName: "Clients - Pack Visibilité Google",
  },
  {
    priceEnvKey: "STRIPE_PRICE_PERFORMANCE",
    productName: "Pack Performance",
    mailerLiteGroupName: "Clients - Pack Performance",
  },
];

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const parseStripeSignature = (signatureHeader) => {
  if (!signatureHeader) return null;

  return signatureHeader.split(",").reduce((signature, item) => {
    const [key, value] = item.split("=");
    if (key === "t") signature.timestamp = value;
    if (key === "v1") signature.signatures.push(value);
    return signature;
  }, {
    timestamp: "",
    signatures: [],
  });
};

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
};

const verifyStripeSignature = async ({ payload, signatureHeader, secret }) => {
  const parsedSignature = parseStripeSignature(signatureHeader);
  if (!parsedSignature?.timestamp || !parsedSignature.signatures.length) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${parsedSignature.timestamp}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSignature = toHex(digest);

  return parsedSignature.signatures.some((signature) => timingSafeEqual(signature, expectedSignature));
};

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const getCustomerEmail = (session) => normalizeText(
  session?.customer_details?.email || session?.customer_email,
).toLowerCase();

const getCustomerName = (session) => normalizeText(session?.customer_details?.name);

const getExpandedPriceId = (session) => {
  const lineItems = session?.line_items?.data || session?.line_items;
  if (!Array.isArray(lineItems) || !lineItems.length) return "";
  return normalizeText(lineItems[0]?.price?.id);
};

const getSessionPriceId = async ({ session, stripeSecretKey }) => {
  const expandedPriceId = getExpandedPriceId(session);
  if (expandedPriceId) return expandedPriceId;

  if (!stripeSecretKey || !session?.id) return "";

  const response = await fetch(`${STRIPE_LINE_ITEMS_ENDPOINT}/${session.id}/line_items?limit=10`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${stripeSecretKey}`,
      "Accept": "application/json",
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("Stripe line items request failed", response.status, responseText);
    return "";
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("Stripe line items response was not JSON.", responseText);
    return "";
  }

  return normalizeText(data?.data?.[0]?.price?.id);
};

const findProductByPriceId = ({ priceId, env }) => PRODUCT_GROUPS.find((product) => (
  normalizeText(env[product.priceEnvKey]) === priceId
));

const findMailerLiteGroupIdByName = async ({ apiKey, groupName }) => {
  const response = await fetch(MAILERLITE_GROUPS_ENDPOINT, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite groups request failed", response.status, responseText);
    return "";
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("MailerLite groups response was not JSON.", responseText);
    return "";
  }

  const group = data?.data?.find((item) => item?.name === groupName);
  return normalizeText(group?.id);
};

const addCustomerToMailerLiteGroup = async ({ apiKey, email, name, groupId }) => {
  const fields = {};
  if (name) fields.name = name;

  const response = await fetch(MAILERLITE_SUBSCRIBERS_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      email,
      status: "active",
      resubscribe: true,
      fields,
      groups: [groupId],
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite subscriber request failed", response.status, responseText);
    return false;
  }

  return true;
};

const syncPaidCustomerToMailerLite = async ({ session, env }) => {
  const mailerLiteApiKey = env.MAILERLITE_API_KEY;
  if (!mailerLiteApiKey) {
    console.error("MailerLite API key is not configured.");
    return;
  }

  const email = getCustomerEmail(session);
  if (!email) {
    console.error("Stripe checkout session has no customer email.", { session_id: session?.id });
    return;
  }

  const priceId = await getSessionPriceId({
    session,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
  });

  if (!priceId) {
    console.error("Unable to identify Stripe Price ID for checkout session.", { session_id: session?.id });
    return;
  }

  const product = findProductByPriceId({ priceId, env });
  if (!product) {
    console.error("No MailerLite group mapping found for Stripe Price ID.", {
      session_id: session?.id,
      price_id: priceId,
    });
    return;
  }

  const groupId = await findMailerLiteGroupIdByName({
    apiKey: mailerLiteApiKey,
    groupName: product.mailerLiteGroupName,
  });

  if (!groupId) {
    console.error("MailerLite group was not found.", {
      group_name: product.mailerLiteGroupName,
    });
    return;
  }

  const synced = await addCustomerToMailerLiteGroup({
    apiKey: mailerLiteApiKey,
    email,
    name: getCustomerName(session),
    groupId,
  });

  if (synced) {
    console.log("Stripe customer synced to MailerLite group", {
      session_id: session?.id,
      email,
      product: product.productName,
      group_name: product.mailerLiteGroupName,
      group_id: groupId,
    });
  }
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    },
  });
}

const handleStripeWebhook = async (context) => {
  const webhookSecret = context.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Stripe webhook secret is not configured.");
    return jsonResponse({ success: false, error: "Stripe webhook secret is not configured." }, 500);
  }

  const signatureHeader = context.request.headers.get("stripe-signature");
  const payload = await context.request.text();
  const isSignatureValid = await verifyStripeSignature({
    payload,
    signatureHeader,
    secret: webhookSecret,
  });

  if (!isSignatureValid) {
    console.error("Invalid Stripe webhook signature.");
    return jsonResponse({ success: false, error: "Invalid signature." }, 400);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    console.log("Stripe checkout.session.completed", {
      session_id: session?.id,
      product: session?.metadata?.product_code || session?.metadata?.product_name || null,
      email: session?.customer_details?.email || session?.customer_email || null,
      payment_status: session?.payment_status || null,
    });

    try {
      await syncPaidCustomerToMailerLite({
        session,
        env: context.env,
      });
    } catch (error) {
      console.error("MailerLite sync failed after Stripe payment.", error);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data?.object;
    console.log("Stripe payment_intent.payment_failed", {
      payment_intent_id: paymentIntent?.id,
      email: paymentIntent?.receipt_email || null,
      payment_status: paymentIntent?.status || null,
      failure_message: paymentIntent?.last_payment_error?.message || null,
    });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data?.object;
    console.log("Stripe checkout.session.async_payment_failed", {
      session_id: session?.id,
      product: session?.metadata?.product_code || session?.metadata?.product_name || null,
      email: session?.customer_details?.email || session?.customer_email || null,
      payment_status: session?.payment_status || null,
    });
  }

  return jsonResponse({ received: true });
};

export async function onRequestPost(context) {
  return handleStripeWebhook(context);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return onRequestOptions();
  }

  if (context.request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method Not Allowed" }, 405);
  }

  return handleStripeWebhook(context);
}
