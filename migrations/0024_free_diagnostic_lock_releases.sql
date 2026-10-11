-- Additive : conserver 0023 inchangée, même si déjà appliquée localement.
ALTER TABLE free_diagnostic_collection_locks ADD COLUMN operation TEXT NOT NULL DEFAULT 'unknown';
CREATE TABLE free_diagnostic_lock_releases (
  release_id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  lock_token TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  operation TEXT NOT NULL,
  released_at TEXT NOT NULL,
  declared_by TEXT NOT NULL,
  actor_session_hash TEXT NOT NULL
);
