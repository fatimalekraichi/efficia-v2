-- Verrou durable, sans expiration automatique : une requête interrompue ne
-- doit jamais permettre de relancer aveuglément un appel déjà facturé.
CREATE TABLE IF NOT EXISTS free_diagnostic_collection_locks (
  analysis_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  acquired_at TEXT NOT NULL
);
