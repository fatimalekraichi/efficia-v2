-- Additive migration. No replay or change to existing orders/subscribers.
CREATE TABLE commerce_attempts (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL, email TEXT NOT NULL,
 offer TEXT NOT NULL, payload TEXT NOT NULL, fingerprint TEXT NOT NULL,
 active_key TEXT UNIQUE, root_id TEXT NOT NULL,
 session_id TEXT UNIQUE, state TEXT NOT NULL DEFAULT 'creating',
 checkout_url TEXT, expires_at INTEGER, paid_at INTEGER, created_at INTEGER NOT NULL,
 stripe_snapshot TEXT, reminder_status TEXT NOT NULL DEFAULT 'pending',
 reminder_at INTEGER, reminder_error TEXT
);
CREATE INDEX commerce_attempts_contact ON commerce_attempts(environment,email);
CREATE INDEX commerce_attempts_due ON commerce_attempts(reminder_status,created_at);
CREATE TABLE commerce_requests (
 request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, attempt_id TEXT NOT NULL
);
CREATE TABLE commerce_events (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL, object_id TEXT NOT NULL,
 type TEXT NOT NULL, received_at INTEGER NOT NULL
);
CREATE TABLE commerce_invoices (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL, email TEXT NOT NULL,
 project_id TEXT NOT NULL, installment TEXT NOT NULL CHECK(installment IN ('deposit','balance','full')),
 amount_paid INTEGER NOT NULL, currency TEXT NOT NULL, paid_at INTEGER NOT NULL
);
CREATE TABLE commerce_contacts (
 environment TEXT NOT NULL, email TEXT NOT NULL, stopped INTEGER NOT NULL DEFAULT 0,
 diagnostic_requested INTEGER NOT NULL DEFAULT 0, diagnostic_group_done INTEGER NOT NULL DEFAULT 0,
 fields TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
 synced_revision INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(environment,email)
);
CREATE INDEX commerce_contacts_due ON commerce_contacts(retry_at,lease_until);
