// Existing order/item/task projection, retained behind the verified paid-state gate.
const STRIPE_LINE_ITEMS_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";

const PRODUCT_GROUPS = [
  {
    code: "audit",
    priceEnvKey: "STRIPE_PRICE_AUDIT",
    productName: "Audit fiche Google",
    taskType: "audit_to_do",
    taskTitle: "Audit à réaliser",
  },
  {
    code: "visibility",
    priceEnvKey: "STRIPE_PRICE_VISIBILITY",
    productName: "Pack Visibilité Google",
    taskType: "google_optimization_to_do",
    taskTitle: "Optimisation Google à réaliser",
  },
  {
    code: "performance",
    priceEnvKey: "STRIPE_PRICE_PERFORMANCE",
    productName: "Pack Performance",
    taskType: "performance_pack_to_do",
    taskTitle: "Pack Performance à réaliser",
  },
];

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

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
    console.error("Stripe line items request failed", { status: response.status });
    return "";
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("Stripe line items response was not JSON.");
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
  if (Number.isFinite(Number(session?.efficia_paid_at))) {
    return new Date(Number(session.efficia_paid_at) * 1000).toISOString();
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

const getCgvAcceptanceProof = (session) => ({
  acceptedAt: normalizeText(session?.metadata?.cgv_accepted_at),
  version: normalizeText(session?.metadata?.cgv_version),
});

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
    offer_code: product.code,
    price_id: priceId || null,
  });
};

export const createTraceableOrder = async ({ session, env }) => {
  if (session?.payment_status !== "paid") throw new Error("ORDER_NOT_PAID");
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
  const cgvAcceptance = getCgvAcceptanceProof(session);

  console.log("Order persistence started", {
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
      cgv_accepted_at,
      cgv_version,
      created_at,
      updated_at,
      raw_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)
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
    cgvAcceptance.acceptedAt || null,
    cgvAcceptance.version || null,
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
      cgv_accepted_at = COALESCE(NULLIF(?, ''), cgv_accepted_at),
      cgv_version = COALESCE(NULLIF(?, ''), cgv_version),
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
    cgvAcceptance.acceptedAt,
    cgvAcceptance.version,
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
