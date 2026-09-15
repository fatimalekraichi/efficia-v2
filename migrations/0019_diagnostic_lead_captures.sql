-- First-step captures are not analyses. Completed requests keep their existing
-- schema and supersede a capture with the same journey key in the admin list.
CREATE TABLE diagnostic_lead_captures (
  idempotency_key TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mailerlite_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_diagnostic_lead_captures_created_at
  ON diagnostic_lead_captures(created_at);
