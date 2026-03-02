-- migration 014: idempotent cron claim pattern
--
-- Adds a 'processing' sentinel status to the three tables touched by cron jobs.
-- Workers atomically flip status → 'processing' before doing work so that
-- concurrent cron executions cannot both claim the same row (double-send).
-- A processing_started_at column lets the cron reset stale claims (dead workers).

-- ── campaign_touchpoints (renewals cron) ─────────────────────────────────────
ALTER TABLE campaign_touchpoints
  DROP CONSTRAINT IF EXISTS campaign_touchpoints_status_check;
ALTER TABLE campaign_touchpoints
  ADD CONSTRAINT campaign_touchpoints_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));
ALTER TABLE campaign_touchpoints
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- ── doc_chase_messages (doc-chase cron) ──────────────────────────────────────
ALTER TABLE doc_chase_messages
  DROP CONSTRAINT IF EXISTS doc_chase_messages_status_check;
ALTER TABLE doc_chase_messages
  ADD CONSTRAINT doc_chase_messages_status_check
  CHECK (status IN ('scheduled', 'processing', 'sent', 'cancelled'));
ALTER TABLE doc_chase_messages
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- ── holder_followup_messages (holder-followup cron) ──────────────────────────
ALTER TABLE holder_followup_messages
  DROP CONSTRAINT IF EXISTS holder_followup_messages_status_check;
ALTER TABLE holder_followup_messages
  ADD CONSTRAINT holder_followup_messages_status_check
  CHECK (status IN ('scheduled', 'processing', 'sent', 'cancelled'));
ALTER TABLE holder_followup_messages
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
