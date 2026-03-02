-- migration 018: delivery feedback fields
--
-- Extends send_logs to record delivery outcomes from the Resend webhook.
-- Adds email_bounced flag to clients so cron jobs can skip invalid addresses.

ALTER TABLE send_logs
  ADD COLUMN IF NOT EXISTS delivered_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email_bounced      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_bounced_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS clients_email_bounced_idx ON clients (email_bounced) WHERE email_bounced = true;
