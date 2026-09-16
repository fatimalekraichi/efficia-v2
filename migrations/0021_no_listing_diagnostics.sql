-- A visibility dossier is not a Google analysis: no synthetic place or score.
CREATE TABLE no_listing_diagnostics (
  dossier_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  capture_id TEXT UNIQUE REFERENCES diagnostic_lead_captures(idempotency_key) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  revision INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  snapshot_json TEXT CHECK (snapshot_json IS NULL OR json_valid(snapshot_json)),
  pdf_filename TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT
);
CREATE INDEX idx_no_listing_diagnostics_status ON no_listing_diagnostics(status, updated_at);
