-- Persistent authenticated back-office drafts for incomplete audit questionnaires.

CREATE TABLE IF NOT EXISTS audit_drafts (
  draft_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  report_type TEXT NOT NULL CHECK (report_type IN ('free', 'premium')),
  answers_version TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  current_step TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(analysis_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_drafts_updated_at
  ON audit_drafts(updated_at DESC);
