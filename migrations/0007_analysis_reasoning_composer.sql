-- Reasoning Engine + Composer Engine.
-- Migration additive pour la table analyses dans ORDERS_DB (efficia_orders).

ALTER TABLE analyses ADD COLUMN reasoning_json TEXT;
ALTER TABLE analyses ADD COLUMN document_model_json TEXT;
ALTER TABLE analyses ADD COLUMN reasoning_completed_at TEXT;
ALTER TABLE analyses ADD COLUMN composer_completed_at TEXT;
