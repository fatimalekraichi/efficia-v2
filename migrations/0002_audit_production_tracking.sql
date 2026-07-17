-- Audit production tracking for the internal Efficia back-office.
-- Apply this migration to the Cloudflare D1 database bound to Pages as ORDERS_DB.

ALTER TABLE order_tasks ADD COLUMN pdf_filename TEXT;
ALTER TABLE order_tasks ADD COLUMN pdf_generated_at TEXT;
ALTER TABLE order_tasks ADD COLUMN pdf_reviewed_at TEXT;
ALTER TABLE order_tasks ADD COLUMN sent_at TEXT;

