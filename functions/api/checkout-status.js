const ALLOWED_OFFERS = new Set(["audit", "visibility", "performance"]);

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
});

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  }

  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!/^cs_(?:test_|live_)?[a-zA-Z0-9_]{8,240}$/.test(sessionId)) {
    return jsonResponse({ success: false, error: "INVALID_SESSION" }, 400);
  }
  if (!context.env.ORDERS_DB) {
    return jsonResponse({ success: false, error: "SERVER_CONFIGURATION_ERROR" }, 500);
  }

  const order = await context.env.ORDERS_DB.prepare(`
    SELECT offer_code, status
    FROM orders
    WHERE stripe_session_id = ?
    LIMIT 1
  `).bind(sessionId).first();

  const offer = ALLOWED_OFFERS.has(order?.offer_code) ? order.offer_code : null;
  const confirmed = order?.status === "paid" && Boolean(offer);
  return jsonResponse({ success: true, confirmed, offer: confirmed ? offer : null });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  if (context.request.method === "POST") return onRequestPost(context);
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
