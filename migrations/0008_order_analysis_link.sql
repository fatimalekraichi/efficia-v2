-- Link generated analyses to paid orders and their production task.
-- Apply this migration to the Cloudflare D1 database bound to Pages as ORDERS_DB.

ALTER TABLE analyses ADD COLUMN order_id TEXT;
ALTER TABLE order_tasks ADD COLUMN analysis_id TEXT;

CREATE INDEX IF NOT EXISTS idx_analyses_order_id ON analyses(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tasks_analysis_id ON order_tasks(analysis_id);
