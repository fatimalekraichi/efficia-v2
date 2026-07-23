-- Analyses collectées (Appel A Outscraper), stockées côté back-office.
-- À appliquer sur la base D1 liée à Pages en tant que ORDERS_DB (efficia_orders).

CREATE TABLE IF NOT EXISTS analyses (
  analysis_id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  ville TEXT NOT NULL,
  query TEXT NOT NULL,
  place_id TEXT,
  name TEXT,
  rating REAL,
  reviews INTEGER,
  photos_count INTEGER,
  description_length INTEGER,
  status TEXT NOT NULL DEFAULT 'collected',
  fiche_json TEXT,
  normalized_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_place_id ON analyses(place_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at);
