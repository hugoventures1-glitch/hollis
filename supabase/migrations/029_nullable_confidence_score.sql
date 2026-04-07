-- Outbound cron items (send_email_90, send_sms_30, etc.) have no AI confidence
-- score — the send decision is rule-based (days-to-expiry), not classifier-based.
-- Make confidence_score nullable in both tables so outbound queue items and their
-- resulting parser_outcomes records can be inserted without a fake placeholder value.
ALTER TABLE approval_queue
  ALTER COLUMN confidence_score DROP NOT NULL;

ALTER TABLE parser_outcomes
  ALTER COLUMN confidence_score DROP NOT NULL;
