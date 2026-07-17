const SESSION_COOKIE = "efficia_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

export const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    ...headers,
  },
});

export const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

export const requireOrdersDb = (env) => {
  if (!env.ORDERS_DB) {
    throw new Error("missing_orders_db_binding");
  }
  return env.ORDERS_DB;
};

const base64UrlEncode = (buffer) => {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : encoder.encode(String(buffer));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
};

const importHmacKey = (secret) => crypto.subtle.importKey(
  "raw",
  encoder.encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

const signValue = async ({ value, secret }) => {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(signature);
};

const verifySignature = async ({ value, signature, secret }) => {
  const expected = await signValue({ value, secret });
  return expected === signature;
};

const parseCookies = (cookieHeader) => {
  const cookies = {};
  normalizeText(cookieHeader).split(";").forEach((part) => {
    const [rawName, ...rawValue] = part.split("=");
    const name = normalizeText(rawName);
    if (!name) return;
    cookies[name] = rawValue.join("=").trim();
  });
  return cookies;
};

export const createSessionCookie = async (env) => {
  const secret = normalizeText(env.ADMIN_SESSION_SECRET);
  if (!secret) throw new Error("missing_admin_session_secret");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signValue({ value: encodedPayload, secret });

  return `${SESSION_COOKIE}=${encodedPayload}.${signature}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
};

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;

export const isAdminSessionValid = async (request, env) => {
  const secret = normalizeText(env.ADMIN_SESSION_SECRET);
  if (!secret) return false;

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const session = cookies[SESSION_COOKIE];
  if (!session || !session.includes(".")) return false;

  const [encodedPayload, signature] = session.split(".");
  if (!encodedPayload || !signature) return false;

  const isValidSignature = await verifySignature({
    value: encodedPayload,
    signature,
    secret,
  });
  if (!isValidSignature) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    return Number.isFinite(payload.exp) && payload.exp > now;
  } catch {
    return false;
  }
};

export const requireAdminSession = async (context) => {
  const ok = await isAdminSessionValid(context.request, context.env);
  if (!ok) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401),
    };
  }
  return { ok: true };
};

export const compareAdminPassword = async ({ receivedPassword, expectedPassword }) => {
  const receivedDigest = await crypto.subtle.digest("SHA-256", encoder.encode(receivedPassword));
  const expectedDigest = await crypto.subtle.digest("SHA-256", encoder.encode(expectedPassword));
  const received = new Uint8Array(receivedDigest);
  const expected = new Uint8Array(expectedDigest);
  if (received.length !== expected.length) return false;

  let diff = 0;
  for (let index = 0; index < received.length; index += 1) {
    diff |= received[index] ^ expected[index];
  }
  return diff === 0;
};

export const getCorsHeaders = () => ({
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export const onOptions = () => new Response(null, {
  status: 204,
  headers: getCorsHeaders(),
});

