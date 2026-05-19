-- ============================================================
-- Migration 038 — Deduplicate inbound_signals on email_id
-- ============================================================
-- Prevents the webhook from creating duplicate inbox items when
-- Resend retries an inbound email delivery. The application-level
-- guard in /api/webhooks/resend/inbound checks first; this
-- constraint acts as a hard back-stop.

-- 1. Remove duplicate inbound_signals rows, keeping the earliest per key.
--    Use a unified keeper set so a row kept for email_id isn't later
--    deleted by the message_id pass (or vice-versa).
WITH keepers AS (
  SELECT MIN(id) AS id
  FROM inbound_signals
  WHERE email_id IS NOT NULL
  GROUP BY email_id
  UNION
  SELECT MIN(id) AS id
  FROM inbound_signals
  WHERE message_id IS NOT NULL
  GROUP BY message_id
)
DELETE FROM inbound_signals
WHERE (email_id IS NOT NULL OR message_id IS NOT NULL)
  AND id NOT IN (SELECT id FROM keepers);

-- 2. Add unique constraints so the database rejects duplicates
--    even if the application-level race is lost.
ALTER TABLE inbound_signals
  ADD CONSTRAINT inbound_signals_email_id_unique UNIQUE (email_id);

CREATE UNIQUE INDEX inbound_signals_message_id_unique
  ON inbound_signals (message_id)
  WHERE message_id IS NOT NULL;
