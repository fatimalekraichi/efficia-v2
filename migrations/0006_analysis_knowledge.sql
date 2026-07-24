-- Knowledge Engine.
-- Migration additive pour la table analyses dans ORDERS_DB (efficia_orders).

ALTER TABLE analyses ADD COLUMN knowledge_json TEXT;
ALTER TABLE analyses ADD COLUMN knowledge_completed_at TEXT;
