import {
  jsonResponse,
  normalizeText,
  onOptions,
  requireAdminSession,
  requireOrdersDb,
} from "./_shared.js";

const ALLOWED_STATUSES = new Set([
  "todo",
  "in_progress",
  "waiting",
  "pdf_generated",
  "pdf_reviewed",
  "sent",
  "completed",
]);
const ALLOWED_OFFERS = new Set(["audit", "visibility", "performance"]);
const ALLOWED_ENVIRONMENTS = new Set(["test", "live"]);

const clampLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(parsed, 1), 100);
};

const parseOffset = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(parsed, 0);
};

const getEnvironmentFromSession = (stripeSessionId) => {
  const sessionId = normalizeText(stripeSessionId);
  if (sessionId.startsWith("cs_test_")) return "test";
  if (sessionId.startsWith("cs_live_")) return "live";
  return "unknown";
};

const buildWhereClause = (params) => {
  const conditions = [];
  const binds = [];

  if (params.status) {
    conditions.push("t.status = ?");
    binds.push(params.status);
  }

  if (params.offer) {
    conditions.push("o.offer_code = ?");
    binds.push(params.offer);
  }

  if (params.environment === "test") {
    conditions.push("o.stripe_session_id LIKE 'cs_test_%'");
  } else if (params.environment === "live") {
    conditions.push("o.stripe_session_id LIKE 'cs_live_%'");
  }

  if (params.search) {
    const search = `%${params.search}%`;
    conditions.push(`(
      o.email LIKE ?
      OR o.customer_name LIKE ?
      OR o.company_name LIKE ?
      OR o.city LIKE ?
      OR o.first_name LIKE ?
      OR o.stripe_session_id LIKE ?
    )`);
    binds.push(search, search, search, search, search, search);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    binds,
  };
};

const normalizeParams = (url) => {
  const status = normalizeText(url.searchParams.get("status"));
  const offer = normalizeText(url.searchParams.get("offer"));
  const environment = normalizeText(url.searchParams.get("environment"));

  if (status && !ALLOWED_STATUSES.has(status)) {
    return { error: "INVALID_STATUS" };
  }
  if (offer && !ALLOWED_OFFERS.has(offer)) {
    return { error: "INVALID_OFFER" };
  }
  if (environment && !ALLOWED_ENVIRONMENTS.has(environment)) {
    return { error: "INVALID_ENVIRONMENT" };
  }

  return {
    status,
    offer,
    environment,
    search: normalizeText(url.searchParams.get("search")).slice(0, 120),
    limit: clampLimit(url.searchParams.get("limit")),
    offset: parseOffset(url.searchParams.get("offset")),
  };
};

const mapOrderRow = (row) => ({
  order_id: row.order_id,
  stripe_session_id: row.stripe_session_id,
  email: row.email,
  customer_name: row.customer_name,
  first_name: row.first_name,
  company_name: row.company_name,
  city: row.city,
  google_business_url: row.google_business_url,
  offer_code: row.offer_code,
  offer_name: row.offer_name,
  amount_total: row.amount_total,
  currency: row.currency,
  payment_status: row.payment_status,
  created_at: row.created_at,
  task_id: row.task_id,
  task_type: row.task_type,
  task_title: row.task_title,
  task_status: row.task_status,
  task_updated_at: row.task_updated_at,
  notes: row.notes,
  environment: getEnvironmentFromSession(row.stripe_session_id),
});

export const onRequestOptions = () => onOptions();

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const db = requireOrdersDb(context.env);
  const url = new URL(context.request.url);
  const params = normalizeParams(url);
  if (params.error) {
    return jsonResponse({ success: false, error: params.error }, 400);
  }

  const { whereSql, binds } = buildWhereClause(params);

  const rows = await db.prepare(`
    SELECT
      o.order_id,
      o.stripe_session_id,
      o.email,
      o.first_name,
      o.customer_name,
      o.company_name,
      o.city,
      o.google_business_url,
      o.offer_code,
      o.offer_name,
      o.amount_total,
      o.currency,
      o.status AS payment_status,
      o.created_at,
      t.task_id,
      t.task_type,
      t.title AS task_title,
      t.status AS task_status,
      t.updated_at AS task_updated_at,
      t.notes
    FROM orders o
    LEFT JOIN order_tasks t ON t.order_id = o.order_id
    ${whereSql}
    ORDER BY o.created_at DESC
    LIMIT ?
    OFFSET ?
  `).bind(...binds, params.limit, params.offset).all();

  const stats = await db.prepare(`
    SELECT
      COUNT(DISTINCT o.order_id) AS totalOrders,
      COALESCE(SUM(CASE
        WHEN ${params.environment === "test" ? "o.stripe_session_id LIKE 'cs_test_%'" : "o.stripe_session_id LIKE 'cs_live_%'"}
        THEN o.amount_total
        ELSE 0
      END), 0) AS totalRevenue,
      COALESCE(SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END), 0) AS todo,
      COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS inProgress,
      COALESCE(SUM(CASE WHEN t.status = 'waiting' THEN 1 ELSE 0 END), 0) AS waiting,
      COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed
    FROM orders o
    LEFT JOIN order_tasks t ON t.order_id = o.order_id
    ${whereSql}
  `).bind(...binds).first();

  const dashboardStats = await db.prepare(`
    SELECT
      COUNT(DISTINCT CASE
        WHEN DATE(o.created_at) = DATE('now') THEN o.order_id
        ELSE NULL
      END) AS ordersToday,
      COALESCE(SUM(CASE
        WHEN o.stripe_session_id LIKE 'cs_live_%'
          AND DATE(o.created_at) = DATE('now')
        THEN o.amount_total
        ELSE 0
      END), 0) AS revenueToday,
      COALESCE(SUM(CASE
        WHEN o.stripe_session_id LIKE 'cs_live_%'
          AND STRFTIME('%Y-%m', o.created_at) = STRFTIME('%Y-%m', 'now')
        THEN o.amount_total
        ELSE 0
      END), 0) AS revenueMonth,
      COALESCE(SUM(CASE
        WHEN t.status = 'todo' AND o.offer_code = 'audit' THEN 1
        ELSE 0
      END), 0) AS auditTodo,
      COALESCE(SUM(CASE
        WHEN t.status = 'todo' AND o.offer_code = 'visibility' THEN 1
        ELSE 0
      END), 0) AS visibilityTodo,
      COALESCE(SUM(CASE
        WHEN t.status = 'todo' AND o.offer_code = 'performance' THEN 1
        ELSE 0
      END), 0) AS performanceTodo
    FROM orders o
    LEFT JOIN order_tasks t ON t.order_id = o.order_id
  `).first();

  return jsonResponse({
    success: true,
    orders: (rows.results || []).map(mapOrderRow),
    stats: {
      totalOrders: Number(stats?.totalOrders || 0),
      totalRevenue: Number(stats?.totalRevenue || 0),
      todo: Number(stats?.todo || 0),
      inProgress: Number(stats?.inProgress || 0),
      waiting: Number(stats?.waiting || 0),
      completed: Number(stats?.completed || 0),
      ordersToday: Number(dashboardStats?.ordersToday || 0),
      revenueToday: Number(dashboardStats?.revenueToday || 0),
      revenueMonth: Number(dashboardStats?.revenueMonth || 0),
      auditTodo: Number(dashboardStats?.auditTodo || 0),
      visibilityTodo: Number(dashboardStats?.visibilityTodo || 0),
      performanceTodo: Number(dashboardStats?.performanceTodo || 0),
    },
    pagination: {
      limit: params.limit,
      offset: params.offset,
    },
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
