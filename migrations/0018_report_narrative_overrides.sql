-- Per-analysis narrative corrections for reports. These rows are deliberately
-- separate from questionnaire answers and score inputs: they can never alter
-- factual data or scoring, and remain queryable for the weekly editorial review.

CREATE TABLE IF NOT EXISTS report_narrative_overrides (
  analysis_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  custom_text TEXT NOT NULL,
  automatic_text_snapshot TEXT NOT NULL,
  generator_version TEXT,
  review_weekly INTEGER NOT NULL DEFAULT 0 CHECK (review_weekly IN (0, 1)),
  anomaly_category TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
  context_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (analysis_id, field_id),
  FOREIGN KEY (analysis_id) REFERENCES analyses(analysis_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_narrative_overrides_weekly
  ON report_narrative_overrides(review_weekly, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_narrative_overrides_needs_review
  ON report_narrative_overrides(analysis_id, needs_review);
