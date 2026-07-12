const STRIPE_LINE_ITEMS_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const MAILERLITE_GROUPS_ENDPOINT = "https://connect.mailerlite.com/api/groups?limit=100";
const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

const PRODUCT_GROUPS = [
  {
    priceEnvKey: "STRIPE_PRICE_AUDIT",
    productName: "Audit fiche Google",
    prospectGroupName: "Prospects - Audit (paiement en cours)",
    clientGroupName: "Clients - Audit",
  },
  {
    priceEnvKey: "STRIPE_PRICE_VISIBILITY",
    productName: "Pack Visibilité Google",
    prospectGroupName: "Prospects - Pack Visibilité (paiement en cours)",
    clientGroupName: "Clients - Pack Visibilité",
  },
  {
    priceEnvKey: "STRIPE_PRICE_PERFORMANCE",
    productName: "Pack Performance",
    prospectGroupName: "Prospects - Pack Performance (paiement en cours)",
    clientGroupName: "Clients - Pack Performance",
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

const normalizeForMatch = (value) => normalizeText(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

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

  const expectedName = normalizeForMatch(groupName);
  const group = data?.data?.find((item) => normalizeForMatch(item?.name) === expectedName);
  const groupId = normalizeText(group?.id);

  if (!groupId) {
    console.error("MailerLite group was not found by name.", {
      expected_group_name: groupName,
      available_group_names: Array.isArray(data?.data) ? data.data.map((item) => item?.name).filter(Boolean) : [],
    });
  }

  return groupId;
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
    return {
      ok: false,
      subscriberId: "",
      details: responseText,
    };
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  return {
    ok: true,
    subscriberId: normalizeText(data?.data?.id),
    details: responseText,
  };
};

const upsertMailerLiteSubscriber = async ({ apiKey, email, name }) => {
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
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite subscriber upsert request failed", response.status, responseText);
    return {
      ok: false,
      subscriberId: "",
      details: responseText,
    };
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  return {
    ok: true,
    subscriberId: normalizeText(data?.data?.id),
    details: responseText,
  };
};

const removeSubscriberFromMailerLiteGroup = async ({ apiKey, subscriberId, groupId }) => {
  if (!subscriberId || !groupId) {
    return {
      ok: false,
      details: "Missing subscriber or group id.",
    };
  }

  const response = await fetch(`${MAILERLITE_SUBSCRIBERS_ENDPOINT}/${subscriberId}/groups/${groupId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite remove group request failed", response.status, responseText);
    return {
      ok: false,
      details: responseText,
    };
  }

  return {
    ok: true,
    details: responseText,
  };
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

  console.log("Paiement confirmé Stripe, déplacement MailerLite en cours", {
    session_id: session?.id,
    email,
    product: product.productName,
  });

  const prospectGroupId = await findMailerLiteGroupIdByName({
    apiKey: mailerLiteApiKey,
    groupName: product.prospectGroupName,
  });

  const clientGroupId = await findMailerLiteGroupIdByName({
    apiKey: mailerLiteApiKey,
    groupName: product.clientGroupName,
  });

  if (!prospectGroupId || !clientGroupId) {
    console.error("MailerLite move failed because one group was not found.", {
      prospect_group_name: product.prospectGroupName,
      prospect_group_id: prospectGroupId || null,
      client_group_name: product.clientGroupName,
      client_group_id: clientGroupId || null,
    });
    return;
  }

  const subscriber = await upsertMailerLiteSubscriber({
    apiKey: mailerLiteApiKey,
    email,
    name: getCustomerName(session),
  });

  if (!subscriber.ok || !subscriber.subscriberId) {
    console.error("MailerLite subscriber lookup/upsert failed after payment.", {
      session_id: session?.id,
      email,
      details: subscriber.details,
    });
    return;
  }

  const prospectRemoval = await removeSubscriberFromMailerLiteGroup({
    apiKey: mailerLiteApiKey,
    subscriberId: subscriber.subscriberId,
    groupId: prospectGroupId,
  });

  if (!prospectRemoval.ok) {
    console.error("Groupe Prospect MailerLite non retiré après paiement.", {
      session_id: session?.id,
      email,
      prospect_group_name: product.prospectGroupName,
      prospect_group_id: prospectGroupId,
      subscriber_id: subscriber.subscriberId,
      details: prospectRemoval.details,
    });
    return;
  }

  console.log("Groupe Prospect MailerLite retiré", {
    session_id: session?.id,
    email,
    product: product.productName,
    group_name: product.prospectGroupName,
    group_id: prospectGroupId,
    subscriber_id: subscriber.subscriberId,
  });

  const clientSync = await addCustomerToMailerLiteGroup({
    apiKey: mailerLiteApiKey,
    email,
    name: getCustomerName(session),
    groupId: clientGroupId,
  });

  if (!clientSync.ok || !clientSync.subscriberId) {
    console.error("Groupe Client MailerLite non ajouté après paiement.", {
      session_id: session?.id,
      email,
      client_group_name: product.clientGroupName,
      client_group_id: clientGroupId,
      details: clientSync.details,
    });
    return;
  }

  console.log("Groupe Client MailerLite ajouté", {
    session_id: session?.id,
    email,
    product: product.productName,
    group_name: product.clientGroupName,
    group_id: clientGroupId,
    subscriber_id: clientSync.subscriberId,
  });
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
