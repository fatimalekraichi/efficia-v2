-- Lot A: necessary transactional messages, independent of marketing consent.
CREATE TABLE commerce_confirmations (
 session_id TEXT PRIMARY KEY, environment TEXT NOT NULL, email TEXT NOT NULL,
 offer TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_at INTEGER NOT NULL, attempted_at INTEGER, error TEXT
);
