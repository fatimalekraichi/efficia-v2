-- Lot B only: durable, atomic reservation across offers for one contact.
CREATE TABLE commerce_reminder_contacts (
 environment TEXT NOT NULL, email TEXT NOT NULL,
 attempt_id TEXT NOT NULL, reserved_until INTEGER NOT NULL,
 PRIMARY KEY(environment,email)
);
