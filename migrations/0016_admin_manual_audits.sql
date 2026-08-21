-- Metadata and idempotency ledger for audits created directly by an
-- authenticated administrator. This table is deliberately separate from
-- orders and diagnostic_requests: a manual audit must not affect commercial
-- or public-funnel statistics.

CREATE TABLE IF NOT EXISTS audit_creation_metadata (
  idempotency_key TEXT PRIMARY KEY,
  analysis_id TEXT UNIQUE,
  creation_source TEXT NOT NULL CHECK (creation_source IN ('admin_manual', 'duplicate_manual')),
  audit_type TEXT NOT NULL CHECK (audit_type IN ('free', 'premium')),
  billing_status TEXT NOT NULL CHECK (billing_status IN ('not_applicable', 'manual_unpaid')),
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(analysis_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_audit_creation_metadata_analysis
  ON audit_creation_metadata(analysis_id);

CREATE INDEX IF NOT EXISTS idx_audit_creation_metadata_source_type
  ON audit_creation_metadata(creation_source, audit_type, billing_status);
