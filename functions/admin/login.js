import {
  clearSessionCookie,
  compareAdminPassword,
  createSessionCookie,
  jsonResponse,
  normalizeText,
  onOptions,
} from "./_shared.js";

export const onRequestOptions = () => onOptions();

export async function onRequestPost(context) {
  const expectedPassword = normalizeText(context.env.ADMIN_PASSWORD);
  const sessionSecret = normalizeText(context.env.ADMIN_SESSION_SECRET);
  if (!expectedPassword || !sessionSecret) {
    console.error("Admin login configuration missing", {
      has_admin_password: Boolean(expectedPassword),
      has_admin_session_secret: Boolean(sessionSecret),
    });
    return jsonResponse({ success: false, error: "ADMIN_AUTH_NOT_CONFIGURED" }, 500);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  }

  const password = typeof payload.password === "string" ? payload.password : "";
  const isValid = await compareAdminPassword({
    receivedPassword: password,
    expectedPassword,
  });

  if (!isValid) {
    console.warn("Admin login failed");
    return jsonResponse({ success: false, error: "INVALID_PASSWORD" }, 401, {
      "Set-Cookie": clearSessionCookie(),
    });
  }

  const cookie = await createSessionCookie(context.env);
  console.log("Admin login succeeded");
  return jsonResponse({ success: true }, 200, {
    "Set-Cookie": cookie,
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

