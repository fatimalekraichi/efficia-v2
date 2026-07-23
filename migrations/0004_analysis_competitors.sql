-- Collecte concurrentielle locale (Appel B Outscraper).
-- Migration additive pour la table analyses dans ORDERS_DB (efficia_orders).

ALTER TABLE analyses ADD COLUMN activity TEXT;
ALTER TABLE analyses ADD COLUMN search_query TEXT;
ALTER TABLE analyses ADD COLUMN local_position INTEGER;
ALTER TABLE analyses ADD COLUMN competitors_json TEXT;
