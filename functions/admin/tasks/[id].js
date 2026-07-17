import {
  jsonResponse,
  normalizeText,
  onOptions,
  requireAdminSession,
  requireOrdersDb,
} from "../_shared.js";

const ALLOWED_STATUSES = new Set(["todo", "in_progress", "waiting", "completed"]);

export const onRequestOptions = () => onOptions();

export async function onRequestPatch(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;

  const taskId = normalizeText(context.params.id);
  if (!taskId) return jsonResponse({ success: false, error: "MISSING_TASK_ID" }, 400);

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "INVALID_JSON" }, 400);
  }

  const status = normalizeText(payload.status);
  if (!ALLOWED_STATUSES.has(status)) {
    return jsonResponse({ success: false, error: "INVALID_STATUS" }, 400);
  }

  const hasNotes = Object.prototype.hasOwnProperty.call(payload, "notes");
  const notes = hasNotes ? normalizeText(payload.notes).slice(0, 5000) : "";
  const now = new Date().toISOString();
  const completedAt = status === "completed" ? now : null;
  const db = requireOrdersDb(context.env);

  const existing = await db.prepare(`
    SELECT task_id
    FROM order_tasks
    WHERE task_id = ?
    LIMIT 1
  `).bind(taskId).first();

  if (!existing) {
    return jsonResponse({ success: false, error: "TASK_NOT_FOUND" }, 404);
  }

  await db.prepare(`
    UPDATE order_tasks
    SET
      status = ?,
      notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
      updated_at = ?,
      completed_at = ?
    WHERE task_id = ?
  `).bind(
    status,
    hasNotes ? 1 : 0,
    notes,
    now,
    completedAt,
    taskId,
  ).run();

  const task = await db.prepare(`
    SELECT *
    FROM order_tasks
    WHERE task_id = ?
    LIMIT 1
  `).bind(taskId).first();

  return jsonResponse({
    success: true,
    task,
  });
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return jsonResponse({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

