import { jsonResponse } from "../admin/_shared.js";

export async function withDiagnosticCollectionLock(db, analysisId, operation) {
  const token = crypto.randomUUID();
  let result;
  try {
    result = await db.prepare(`
      INSERT INTO free_diagnostic_collection_locks (analysis_id, token, acquired_at)
      VALUES (?, ?, ?) ON CONFLICT(analysis_id) DO NOTHING
    `).bind(analysisId, token, new Date().toISOString()).run();
  } catch {
    return jsonResponse({ success: false, error: "COLLECTION_LOCK_UNAVAILABLE" }, 503);
  }
  if (result?.success !== true || !Number.isInteger(result?.meta?.changes)) {
    return jsonResponse({ success: false, error: "COLLECTION_LOCK_UNAVAILABLE" }, 503);
  }
  if (result.meta.changes !== 1) {
    return jsonResponse({ success: false, error: "COLLECTION_IN_PROGRESS" }, 409);
  }
  try {
    return await operation();
  } finally {
    try {
      await db.prepare(`DELETE FROM free_diagnostic_collection_locks
        WHERE analysis_id = ? AND token = ?`).bind(analysisId, token).run();
    } catch {
      // Garder le verrou en cas de panne ; ne jamais relancer le fournisseur.
      console.error("free-diagnostic-collect: collection_lock_release_failed");
    }
  }
}
