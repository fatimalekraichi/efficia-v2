-- Human validation gate before final Efficia report generation.
-- Apply this migration to the Cloudflare D1 database bound to Pages as ORDERS_DB.

ALTER TABLE analyses ADD COLUMN manual_review_json TEXT;
ALTER TABLE analyses ADD COLUMN reviewed_observation_json TEXT;
ALTER TABLE analyses ADD COLUMN reviewed_benchmark_json TEXT;
ALTER TABLE analyses ADD COLUMN review_completed_at TEXT;
ALTER TABLE analyses ADD COLUMN approved_at TEXT;
ALTER TABLE analyses ADD COLUMN pdf_generated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_review_completed_at ON analyses(review_completed_at);
