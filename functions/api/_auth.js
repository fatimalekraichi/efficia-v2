export function verifyConnectorToken(context) {
  const token = context.env.CONNECTOR_TOKEN;
  if (!token) {
    console.error("api-auth: CONNECTOR_TOKEN manquant dans l'environnement.");
    return { ok: false, status: 500, error: "Server configuration error." };
  }

  const authHeader = context.request.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!bearer || bearer !== token) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}
