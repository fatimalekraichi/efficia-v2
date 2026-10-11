import { jsonResponse, requireAdminSession, requireOrdersDb, requireSameOriginMutation } from "../../admin/_shared.js";

const cutoff = () => new Date(Date.now() - 15 * 60 * 1000).toISOString();
const reply = (body, status = 200) => jsonResponse(body, status, { "Cache-Control": "no-store" });

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const db = requireOrdersDb(context.env);
  try {
    const result = await db.prepare(`SELECT analysis_id, token, acquired_at, operation
      FROM free_diagnostic_collection_locks WHERE acquired_at < ? ORDER BY acquired_at`).bind(cutoff()).all();
    return reply({ success: true, locks: result.results });
  } catch {
    return reply({ success: false, error: "COLLECTION_LOCK_UNAVAILABLE" }, 503);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const origin = requireSameOriginMutation(context.request);
  if (!origin.ok) return origin.response;
  let body;
  try { body = await context.request.json(); } catch { return reply({ error: "INVALID_JSON" }, 400); }
  const { analysisId, token, operator, confirmed } = body || {};
  if (confirmed !== true || typeof analysisId !== "string" || !analysisId || analysisId.length > 200
    || typeof token !== "string" || !token || token.length > 200
    || typeof operator !== "string" || !operator.trim() || operator.trim().length > 80) {
    return reply({ error: "CONFIRMATION_REQUIRED" }, 400);
  }
  // Le compte admin est partagé : enregistrer le nom déclaré ET une empreinte
  // serveur de la session authentifiée. Ne jamais enregistrer le cookie brut.
  const cookie = (context.request.headers.get("Cookie") || "").split(";")
    .map(value => value.trim()).find(value => value.startsWith("efficia_admin_session="));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cookie));
  const actor = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const db = requireOrdersDb(context.env);
  const releaseId = crypto.randomUUID();
  try {
    // D1 batch est transactionnel : aucune libération sans journal durable.
    // Le token évite de libérer un nouveau verrou créé après l'affichage.
    const results = await db.batch([
      db.prepare(`INSERT INTO free_diagnostic_lock_releases
        (release_id, analysis_id, lock_token, acquired_at, operation, released_at, declared_by, actor_session_hash)
        SELECT ?, analysis_id, token, acquired_at, operation, ?, ?, ?
        FROM free_diagnostic_collection_locks WHERE analysis_id = ? AND token = ? AND acquired_at < ?`)
        .bind(releaseId, new Date().toISOString(), operator.trim(), actor, analysisId, token, cutoff()),
      db.prepare(`DELETE FROM free_diagnostic_collection_locks WHERE analysis_id = ? AND token = ?
        AND EXISTS (SELECT 1 FROM free_diagnostic_lock_releases WHERE release_id = ?)`)
        .bind(analysisId, token, releaseId),
    ]);
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      return reply({ success: false, error: "LOCK_CHANGED_OR_TOO_RECENT" }, 409);
    }
    return reply({ success: true });
  } catch {
    return reply({ success: false, error: "LOCK_RELEASE_FAILED" }, 503);
  }
}
