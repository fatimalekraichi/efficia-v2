import { clearSessionCookie, jsonResponse, onOptions } from "./_shared.js";

export const onRequestOptions = () => onOptions();

export async function onRequestPost() {
  return jsonResponse({ success: true }, 200, {
    "Set-Cookie": clearSessionCookie(),
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

