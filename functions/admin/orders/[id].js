import {
  jsonResponse,
  normalizeText,
  onOptions,
  requireAdminSession,
  requireOrdersDb,
} from "../_shared.js";

const parseMetadata = (value) => {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
};

const getEnvironmentFromSession = (stripeSessionId) => {
  const sessionId = normalizeText(stripeSessionId);
  if (sessionId.startsWith("cs_test_")) return "test";
  if (sessionId.startsWith("cs_live_")) return "live";
  return "unknown";
};

export const onRequestOptions = () => onOptions();

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const orderId = normalizeText(context.params.id);
  if (!orderId) return jsonResponse({ success: false, error: "MISSING_ORDER_ID" }, 400);

  const db = requireOrdersDb(context.env);
  const order = await db.prepare(`
    SELECT *
    FROM orders
    WHERE order_id = ?
    LIMIT 1
  `).bind(orderId).first();

  if (!order) {
    return jsonResponse({ success: false, error: "ORDER_NOT_FOUND" }, 404);
  }

  const items = await db.prepare(`
    SELECT *
    FROM order_items
    WHERE order_id = ?
    ORDER BY created_at ASC
  `).bind(orderId).all();

  const tasks = await db.prepare(`
    SELECT *
    FROM order_tasks
    WHERE order_id = ?
    ORDER BY created_at ASC
  `).bind(orderId).all();

  return jsonResponse({
    success: true,
    order: {
      ...order,
      environment: getEnvironmentFromSession(order.stripe_session_id),
      metadata: parseMetadata(order.raw_metadata),
      raw_metadata: undefined,
    },
    items: items.results || [],
    tasks: tasks.results || [],
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

