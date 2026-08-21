-- Immutable questionnaire payload used to generate a completed audit.
-- Drafts remain available as recovery material but are excluded from the
-- "Audits en cours" list once a final snapshot exists.

CREATE TABLE IF NOT EXISTS audit_questionnaire_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL UNIQUE,
  source_draft_id TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('free', 'premium')),
  answers_version TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  current_step TEXT NOT NULL,
  pdf_filename TEXT,
  finalized_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(analysis_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_draft_id) REFERENCES audit_drafts(draft_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_questionnaire_snapshots_finalized_at
  ON audit_questionnaire_snapshots(finalized_at DESC);

-- Final snapshots are append-only evidence. Any correction must be created by
-- duplicating the audit into a new analysis/draft pair.
CREATE TRIGGER IF NOT EXISTS audit_questionnaire_snapshots_no_update
BEFORE UPDATE ON audit_questionnaire_snapshots
BEGIN
  SELECT RAISE(ABORT, 'audit questionnaire snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS audit_questionnaire_snapshots_no_delete
BEFORE DELETE ON audit_questionnaire_snapshots
BEGIN
  SELECT RAISE(ABORT, 'audit questionnaire snapshots are immutable');
END;

-- A client-generated key represents one explicit duplication action. It makes
-- retries and double-clicks return the same copy without creating extra drafts.
CREATE TABLE IF NOT EXISTS audit_questionnaire_duplications (
  source_analysis_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  new_analysis_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_analysis_id, idempotency_key),
  FOREIGN KEY (source_analysis_id) REFERENCES analyses(analysis_id) ON DELETE RESTRICT,
  FOREIGN KEY (new_analysis_id) REFERENCES analyses(analysis_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_audit_questionnaire_duplications_created_at
  ON audit_questionnaire_duplications(created_at DESC);
