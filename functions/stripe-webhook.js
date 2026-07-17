const STRIPE_LINE_ITEMS_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const MAILERLITE_GROUPS_ENDPOINT = "https://connect.mailerlite.com/api/groups?limit=100";
const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

const PRODUCT_GROUPS = [
  {
    code: "audit",
    priceEnvKey: "STRIPE_PRICE_AUDIT",
    productName: "Audit fiche Google",
    prospectGroupName: "Prospects - Audit (paiement en cours)",
    clientGroupName: "Clients - Audit",
    taskType: "audit_to_do",
    taskTitle: "Audit à réaliser",
  },
  {
    code: "visibility",
    priceEnvKey: "STRIPE_PRICE_VISIBILITY",
    productName: "Pack Visibilité Google",
    prospectGroupName: "Prospects - Pack Visibilité (paiement en cours)",
    clientGroupName: "Clients - Pack Visibilité",
    taskType: "google_optimization_to_do",
    taskTitle: "Optimisation Google à réaliser",
  },
  {
    code: "performance",
    priceEnvKey: "STRIPE_PRICE_PERFORMANCE",
    productName: "Pack Performance",
    prospectGroupName: "Prospects - Pack Performance (paiement en cours)",
    clientGroupName: "Clients - Pack Performance",
    taskType: "performance_pack_to_do",
    taskTitle: "Pack Performance à réaliser",
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

const splitFirstName = (fullName) => normalizeText(fullName).split(/\s+/).filter(Boolean)[0] || "";

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

const findProductByCode = (code) => PRODUCT_GROUPS.find((product) => product.code === normalizeText(code));

const getProductForSession = async ({ session, env }) => {
  const metadataProductCode = normalizeText(session?.metadata?.product_code);
  const priceId = await getSessionPriceId({
    session,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
  });

  const metadataProduct = findProductByCode(metadataProductCode);
  if (metadataProduct) {
    return {
      product: metadataProduct,
      priceId,
    };
  }

  return {
    product: priceId ? findProductByPriceId({ priceId, env }) : null,
    priceId,
  };
};

const isoNow = () => new Date().toISOString();

const getPaidAt = (session) => {
  if (Number.isFinite(Number(session?.created))) {
    return new Date(Number(session.created) * 1000).toISOString();
  }
  return isoNow();
};

const getOrderLeadData = (session) => {
  const metadata = session?.metadata || {};
  const customerName = normalizeText(metadata.customer_name || getCustomerName(session));
  return {
    email: getCustomerEmail(session),
    firstName: splitFirstName(customerName),
    customerName,
    companyName: normalizeText(metadata.company_name),
    city: normalizeText(metadata.city),
    googleBusinessUrl: normalizeText(metadata.google_business_url),
  };
};

const toSafeJson = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "{}";
  }
};

const createOrderTaskForProduct = async ({ db, orderId, product, now }) => {
  if (!product?.taskType || !product?.taskTitle) {
    console.log("Order task skipped, no task mapping for product", {
      order_id: orderId,
      product_code: product?.code || null,
    });
    return {
      created: false,
      skipped: true,
    };
  }

  const taskId = crypto.randomUUID();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO order_tasks (
      task_id,
      order_id,
      task_type,
      title,
      status,
      offer_code,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?)
  `).bind(
    taskId,
    orderId,
    product.taskType,
    product.taskTitle,
    product.code,
    now,
    now,
  ).run();

  const created = Number(result?.meta?.changes || 0) > 0;
  console.log(created ? "Order task created" : "Order task already exists, skipped duplicate", {
    order_id: orderId,
    task_type: product.taskType,
    task_title: product.taskTitle,
  });

  return {
    created,
    taskId: created ? taskId : "",
  };
};

const createOrderItem = async ({ db, orderId, session, product, priceId, now }) => {
  const itemId = crypto.randomUUID();
  const amountTotal = Number(session?.amount_total || 0);
  const currency = normalizeText(session?.currency || "eur").toLowerCase();

  const result = await db.prepare(`
    INSERT OR IGNORE INTO order_items (
      order_item_id,
      order_id,
      stripe_price_id,
      offer_code,
      offer_name,
      quantity,
      amount_total,
      currency,
      created_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).bind(
    itemId,
    orderId,
    priceId || normalizeText(session?.metadata?.stripe_price_id),
    product.code,
    product.productName,
    amountTotal,
    currency,
    now,
  ).run();

  console.log(Number(result?.meta?.changes || 0) > 0 ? "Order item recorded" : "Order item already recorded", {
    order_id: orderId,
    offer_code: product.code,
    price_id: priceId || null,
  });
};

const createTraceableOrder = async ({ session, env }) => {
  const db = env.ORDERS_DB;
  if (!db) {
    throw new Error("missing_orders_db_binding");
  }

  const sessionId = normalizeText(session?.id);
  if (!sessionId) {
    throw new Error("missing_stripe_session_id");
  }

  const { product, priceId } = await getProductForSession({ session, env });
  if (!product) {
    throw new Error("unknown_product_for_order");
  }

  const lead = getOrderLeadData(session);
  if (!lead.email) {
    throw new Error("missing_customer_email_for_order");
  }

  const now = isoNow();
  const paidAt = getPaidAt(session);
  const orderId = crypto.randomUUID();
  const amountTotal = Number(session?.amount_total || 0);
  const currency = normalizeText(session?.currency || "eur").toLowerCase();
  const paymentIntentId = normalizeText(session?.payment_intent);

  console.log("Order persistence started", {
    stripe_session_id: sessionId,
    email: lead.email,
    offer_code: product.code,
    amount_total: amountTotal,
    currency,
  });

  await db.prepare(`
    INSERT OR IGNORE INTO orders (
      order_id,
      stripe_session_id,
      stripe_payment_intent_id,
      email,
      first_name,
      customer_name,
      company_name,
      city,
      google_business_url,
      offer_code,
      offer_name,
      amount_total,
      currency,
      status,
      paid_at,
      created_at,
      updated_at,
      raw_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)
  `).bind(
    orderId,
    sessionId,
    paymentIntentId,
    lead.email,
    lead.firstName,
    lead.customerName,
    lead.companyName,
    lead.city,
    lead.googleBusinessUrl,
    product.code,
    product.productName,
    amountTotal,
    currency,
    paidAt,
    now,
    now,
    toSafeJson(session?.metadata),
  ).run();

  const order = await db.prepare(`
    SELECT order_id, stripe_session_id, offer_code, status
    FROM orders
    WHERE stripe_session_id = ?
    LIMIT 1
  `).bind(sessionId).first();

  if (!order?.order_id) {
    throw new Error("order_lookup_failed_after_insert");
  }

  await db.prepare(`
    UPDATE orders
    SET
      stripe_payment_intent_id = COALESCE(NULLIF(?, ''), stripe_payment_intent_id),
      email = ?,
      first_name = ?,
      customer_name = ?,
      company_name = ?,
      city = ?,
      google_business_url = ?,
      offer_code = ?,
      offer_name = ?,
      amount_total = ?,
      currency = ?,
      status = 'paid',
      paid_at = ?,
      updated_at = ?,
      raw_metadata = ?
    WHERE stripe_session_id = ?
  `).bind(
    paymentIntentId,
    lead.email,
    lead.firstName,
    lead.customerName,
    lead.companyName,
    lead.city,
    lead.googleBusinessUrl,
    product.code,
    product.productName,
    amountTotal,
    currency,
    paidAt,
    now,
    toSafeJson(session?.metadata),
    sessionId,
  ).run();

  await createOrderItem({
    db,
    orderId: order.order_id,
    session,
    product,
    priceId,
    now,
  });

  const taskResult = await createOrderTaskForProduct({
    db,
    orderId: order.order_id,
    product,
    now,
  });

  console.log("Order persistence completed", {
    order_id: order.order_id,
    stripe_session_id: sessionId,
    offer_code: product.code,
    status: "paid",
    task_created: taskResult.created,
    task_skipped: taskResult.skipped || false,
  });

  return {
    orderId: order.order_id,
    product,
  };
};

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
      const orderResult = await createTraceableOrder({
        session,
        env: context.env,
      });
      console.log("Stripe order workflow secured", {
        session_id: session?.id,
        order_id: orderResult.orderId,
        offer_code: orderResult.product?.code || null,
      });
    } catch (error) {
      console.error("Order persistence failed after Stripe payment. Stripe should retry this webhook.", {
        session_id: session?.id || null,
        error: error?.message || String(error),
      });
      return jsonResponse({
        received: false,
        error: "Order persistence failed.",
      }, 500);
    }

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
