-- Store the selected report type for the admin audit workflow.
-- free = diagnostic gratuit, premium = Audit Premium 99 €.
ALTER TABLE analyses ADD COLUMN report_type TEXT;

CREATE INDEX IF NOT EXISTS idx_analyses_report_type ON analyses(report_type);
