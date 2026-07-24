-- Benchmark Engine MVP.
-- Migration additive pour la table analyses dans ORDERS_DB (efficia_orders).

ALTER TABLE analyses ADD COLUMN benchmark_score INTEGER;
ALTER TABLE analyses ADD COLUMN avg_rating REAL;
ALTER TABLE analyses ADD COLUMN avg_reviews REAL;
ALTER TABLE analyses ADD COLUMN avg_photos REAL;
ALTER TABLE analyses ADD COLUMN rating_gap REAL;
ALTER TABLE analyses ADD COLUMN reviews_gap REAL;
ALTER TABLE analyses ADD COLUMN photos_gap REAL;
ALTER TABLE analyses ADD COLUMN rating_percentile INTEGER;
ALTER TABLE analyses ADD COLUMN reviews_percentile INTEGER;
ALTER TABLE analyses ADD COLUMN photos_percentile INTEGER;
ALTER TABLE analyses ADD COLUMN top_competitor_name TEXT;
ALTER TABLE analyses ADD COLUMN top_competitor_rating REAL;
ALTER TABLE analyses ADD COLUMN top_competitor_reviews INTEGER;
ALTER TABLE analyses ADD COLUMN benchmark_completed_at TEXT;
