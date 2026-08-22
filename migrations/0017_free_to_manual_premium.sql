-- Trace every explicit conversion of a completed free diagnostic into a new
-- administrative Premium audit. This ledger is intentionally distinct from
-- audit_questionnaire_duplications: a transfer changes the report type.

CREATE TABLE IF NOT EXISTS audit_premium_transfers (
  source_analysis_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  source_snapshot_id TEXT NOT NULL,
  target_analysis_id TEXT NOT NULL UNIQUE,
  transfer_type TEXT NOT NULL CHECK (transfer_type = 'free_to_manual_premium'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_analysis_id, idempotency_key),
  FOREIGN KEY (source_analysis_id) REFERENCES analyses(analysis_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_snapshot_id) REFERENCES audit_questionnaire_snapshots(snapshot_id) ON DELETE RESTRICT,
  FOREIGN KEY (target_analysis_id) REFERENCES analyses(analysis_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_audit_premium_transfers_source
  ON audit_premium_transfers(source_analysis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_premium_transfers_created_at
  ON audit_premium_transfers(created_at DESC);
