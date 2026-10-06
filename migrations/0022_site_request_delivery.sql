-- Delivery receipts and abuse protection only: no name, email or message body.
CREATE TABLE IF NOT EXISTS site_request_delivery (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  rate_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'uncertain')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_request_rate ON site_request_delivery(rate_key, created_at);
