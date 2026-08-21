import { isValidAnalysisId } from "../../analysis/_shared.js";
import { jsonResponse, normalizeText, requireAdminSession, requireOrdersDb } from "../../../admin/_shared.js";
import {
  normalizeQuestionnaireAnswers,
  resolveQuestionnaireVersion,
} from "../../../lib/auditQuestionnaireSnapshots.js";

const MAX_ANSWERS_BYTES = 120_000;
const REPORT_TYPES = new Set(["free", "premium"]);

async function readPayload(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function formatDraft(row) {
  if (!row) return null;
  let answers = null;
  try { answers = normalizeQuestionnaireAnswers(JSON.parse(row.answers_json), row.answers_version); } catch { answers = null; }
  return {
    draftId: row.draft_id,
    analysisId: row.analysis_id,
    status: row.status,
    reportType: row.report_type,
    answersVersion: row.answers_version,
    answers,
    currentStep: row.current_step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAnalysis(db, analysisId) {
  return db.prepare(`
    SELECT analysis_id, report_type
    FROM analyses
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
}

export async function onRequestGet(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const draftId = normalizeText(context.params.draftId);
  if (!isValidAnalysisId(draftId)) return jsonResponse({ success: false, error: "INVALID_DRAFT_ID" }, 400);

  const db = requireOrdersDb(context.env);
  const row = await db.prepare(`SELECT * FROM audit_drafts WHERE draft_id = ? LIMIT 1`).bind(draftId).first();
  if (!row) return jsonResponse({ success: false, error: "DRAFT_NOT_FOUND" }, 404);
  return jsonResponse({ success: true, draft: formatDraft(row) });
}

export async function onRequestPut(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const draftId = normalizeText(context.params.draftId);
  if (!isValidAnalysisId(draftId)) return jsonResponse({ success: false, error: "INVALID_DRAFT_ID" }, 400);

  const payload = await readPayload(context.request);
  if (!payload || payload.analysisId !== draftId) return jsonResponse({ success: false, error: "INVALID_DRAFT" }, 400);
  const reportType = normalizeText(payload.reportType);
  if (!REPORT_TYPES.has(reportType)) return jsonResponse({ success: false, error: "INVALID_REPORT_TYPE" }, 400);
  const currentStep = normalizeText(payload.currentStep).slice(0, 80);
  if (!currentStep || !payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    return jsonResponse({ success: false, error: "INVALID_DRAFT" }, 400);
  }
  const normalizedAnswers = normalizeQuestionnaireAnswers(payload.answers);
  const answersVersion = resolveQuestionnaireVersion(normalizedAnswers);
  const answersJson = JSON.stringify(normalizedAnswers);
  if (new TextEncoder().encode(answersJson).length > MAX_ANSWERS_BYTES) {
    return jsonResponse({ success: false, error: "DRAFT_TOO_LARGE" }, 413);
  }

  const db = requireOrdersDb(context.env);
  const analysis = await loadAnalysis(db, draftId);
  if (!analysis) return jsonResponse({ success: false, error: "ANALYSIS_NOT_FOUND" }, 404);
  const storedReportType = analysis.report_type === "free" ? "free" : "premium";
  if (storedReportType !== reportType) return jsonResponse({ success: false, error: "REPORT_TYPE_MISMATCH" }, 409);

  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO audit_drafts (
      draft_id, analysis_id, status, report_type, answers_version,
      answers_json, current_step, created_at, updated_at
    ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(draft_id) DO UPDATE SET
      report_type = excluded.report_type,
      answers_version = excluded.answers_version,
      answers_json = excluded.answers_json,
      current_step = excluded.current_step,
      updated_at = excluded.updated_at
  `).bind(
    draftId,
    draftId,
    reportType,
    answersVersion,
    answersJson,
    currentStep,
    now,
    now,
  ).run();

  const row = await db.prepare(`SELECT * FROM audit_drafts WHERE draft_id = ? LIMIT 1`).bind(draftId).first();
  return jsonResponse({ success: true, draft: formatDraft(row) });
}

export async function onRequestDelete(context) {
  const auth = await requireAdminSession(context);
  if (!auth.ok) return auth.response;
  const draftId = normalizeText(context.params.draftId);
  if (!isValidAnalysisId(draftId)) return jsonResponse({ success: false, error: "INVALID_DRAFT_ID" }, 400);
  const db = requireOrdersDb(context.env);
  const finalized = await db.prepare(`
    SELECT 1
    FROM audit_questionnaire_snapshots
    WHERE source_draft_id = ?
    LIMIT 1
  `).bind(draftId).first();
  if (finalized) {
    return jsonResponse({ success: false, error: "FINALIZED_DRAFT_IMMUTABLE" }, 409);
  }
  const result = await db.prepare(`DELETE FROM audit_drafts WHERE draft_id = ?`).bind(draftId).run();
  if (!Number(result?.meta?.changes || 0)) return jsonResponse({ success: false, error: "DRAFT_NOT_FOUND" }, 404);
  return jsonResponse({ success: true, draftId });
}
