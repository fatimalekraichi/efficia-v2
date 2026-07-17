import {
  jsonResponse,
  normalizeText,
  onOptions,
  requireAdminSession,
  requireOrdersDb,
} from "../_shared.js";

const ALLOWED_STATUSES = new Set([
  "todo",
  "in_progress",
  "waiting",
  "pdf_generated",
  "pdf_reviewed",
  "sent",
  "completed",
]);

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
  const hasPdfFilename = Object.prototype.hasOwnProperty.call(payload, "pdf_filename");
  const pdfFilename = hasPdfFilename ? normalizeText(payload.pdf_filename).slice(0, 260) : "";
  const now = new Date().toISOString();
  const completedAt = status === "completed" ? now : null;
  const pdfGeneratedAt = status === "pdf_generated" ? now : null;
  const pdfReviewedAt = status === "pdf_reviewed" ? now : null;
  const sentAt = status === "sent" ? now : null;
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
      pdf_filename = CASE WHEN ? = 1 THEN ? ELSE pdf_filename END,
      updated_at = ?,
      pdf_generated_at = CASE WHEN ? IS NOT NULL THEN ? ELSE pdf_generated_at END,
      pdf_reviewed_at = CASE WHEN ? IS NOT NULL THEN ? ELSE pdf_reviewed_at END,
      sent_at = CASE WHEN ? IS NOT NULL THEN ? ELSE sent_at END,
      completed_at = ?
    WHERE task_id = ?
  `).bind(
    status,
    hasNotes ? 1 : 0,
    notes,
    hasPdfFilename ? 1 : 0,
    pdfFilename,
    now,
    pdfGeneratedAt,
    pdfGeneratedAt,
    pdfReviewedAt,
    pdfReviewedAt,
    sentAt,
    sentAt,
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
