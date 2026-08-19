-- Public free-diagnostic requests linked atomically to their analysis.
-- Apply to the D1 database bound to Pages as ORDERS_DB (efficia_orders).

CREATE TABLE IF NOT EXISTS diagnostic_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  analysis_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT,
  city TEXT,
  google_business_url TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_review',
  mailerlite_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES analyses(analysis_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_requests_status_created_at
  ON diagnostic_requests(status, created_at);
