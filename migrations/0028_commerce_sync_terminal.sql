-- Permanent MailerLite failures require explicit reconciliation, not endless cron retries.
ALTER TABLE commerce_contacts ADD COLUMN sync_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commerce_contacts ADD COLUMN last_error_operation TEXT;
