-- Store the CGV acceptance proof associated with paid orders.
-- Nullable columns preserve compatibility with orders created before this migration.

ALTER TABLE orders ADD COLUMN cgv_accepted_at TEXT;
ALTER TABLE orders ADD COLUMN cgv_version TEXT;
