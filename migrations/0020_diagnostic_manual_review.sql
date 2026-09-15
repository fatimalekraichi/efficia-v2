-- Complete the original capture without inventing a Google listing/analysis.
ALTER TABLE diagnostic_lead_captures ADD COLUMN request_details_json TEXT;
ALTER TABLE diagnostic_lead_captures ADD COLUMN review_reason TEXT
  CHECK (review_reason IN ('not_found', 'declared_absent', 'unavailable', 'ambiguous', 'unresolved'));
ALTER TABLE diagnostic_lead_captures ADD COLUMN submitted_at TEXT;
