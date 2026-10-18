-- Read-only operational checks; scope database to the correct environment first.
SELECT environment, COUNT(*) AS pending_syncs, MIN(retry_at) AS next_retry
FROM commerce_contacts WHERE revision>synced_revision GROUP BY environment;
SELECT environment, last_error, COUNT(*) AS failures
FROM commerce_contacts WHERE last_error IS NOT NULL GROUP BY environment,last_error;
SELECT environment, reminder_status, COUNT(*) AS count
FROM commerce_attempts WHERE id=root_id GROUP BY environment,reminder_status;
SELECT id,environment,session_id,state,created_at FROM commerce_attempts
WHERE state='creating' AND created_at<unixepoch()-82800;
SELECT id,environment,reminder_status,reminder_at FROM commerce_attempts
WHERE reminder_status IN ('sending','uncertain');
-- Do not reset sending/uncertain without checking provider history: resend could duplicate.
