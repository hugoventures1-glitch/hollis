-- ─────────────────────────────────────────────────────────────────────────────
-- 026_hollis_actions.sql
--
-- Persistent audit trail for every automated action Hollis takes.
-- broker_id references auth.users(id) — there is no separate brokers table;
-- the authenticated Supabase user IS the broker in this system.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hollis_actions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id      uuid        REFERENCES clients(id)  ON DELETE SET NULL,
  policy_id      uuid        REFERENCES policies(id) ON DELETE SET NULL,

  -- action_type values:
  --   'renewal_email'           — outbound renewal email (90/60/final/lapse)
  --   'renewal_sms'             — outbound renewal SMS (30-day)
  --   'renewal_intent_classified' — inbound signal classified by Claude
  --   'renewal_stage_transition'  — campaign stage advanced automatically
  --   'renewal_halted'          — sequence paused (silence or confirmation)
  --   'approval_queued'         — Tier 2 item written to approval_queue
  --   'escalation'              — Tier 3 hard escalation (claims, restructure, etc.)
  --   'silence_detected'        — silent client flagged at ≤14 days
  --   'doc_chase_email'         — outbound doc-chase email
  --   'doc_chase_sms'           — outbound doc-chase SMS
  --   'doc_chase_escalated'     — doc-chase escalated to phone script
  --   'coi_generated'           — Certificate of Insurance created
  --   'policy_check'            — policy coverage analysis completed
  action_type    text        NOT NULL,

  -- '1', '2', or '3' — autonomy tier, where applicable
  tier           text,

  -- Plain-English sentence explaining exactly why this action fired,
  -- generated at call-time (not post-hoc).
  trigger_reason text        NOT NULL,

  -- Full content of what was sent or decided:
  -- { subject, body, recipient_email, recipient_name, channel, template_used,
  --   intent_classification, confidence_score, previous_stage, new_stage,
  --   carrier, premium, days_to_expiry, escalation_reason }
  payload        jsonb,

  -- Catch-all for action-specific context that doesn't fit fixed columns.
  metadata       jsonb,

  -- 'sent' | 'queued' | 'escalated' | 'failed' | 'halted' | 'classified'
  outcome        text        NOT NULL DEFAULT 'sent',

  -- Set at insert time by the caller:
  --   standard actions  → now() + 90 days
  --   escalations / T3  → now() + 1 year
  retain_until   timestamptz NOT NULL,

  -- If true, the weekly cleanup job never touches this row.
  -- Broker can pin important actions (disputed renewals, resolved escalations).
  archived       boolean     NOT NULL DEFAULT false,

  -- Populated when a human intervenes on a Tier 2 or Tier 3 action.
  resolved_at    timestamptz,
  resolved_by    text,  -- 'broker' or a system identifier

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Brokers can only read their own rows. Writes go through service role only.

ALTER TABLE hollis_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hollis_actions_select"
  ON hollis_actions
  FOR SELECT
  USING (auth.uid() = broker_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ha_broker_id_idx    ON hollis_actions(broker_id);
CREATE INDEX IF NOT EXISTS ha_client_id_idx    ON hollis_actions(client_id);
CREATE INDEX IF NOT EXISTS ha_policy_id_idx    ON hollis_actions(policy_id);
CREATE INDEX IF NOT EXISTS ha_created_at_idx   ON hollis_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS ha_action_type_idx  ON hollis_actions(action_type);
CREATE INDEX IF NOT EXISTS ha_retain_until_idx ON hollis_actions(retain_until);
CREATE INDEX IF NOT EXISTS ha_archived_idx     ON hollis_actions(archived);

-- ── Retention cleanup function ────────────────────────────────────────────────
-- Called weekly by pg_cron (scheduled below).
--
-- Rules:
--   1. Hard-delete rows where retain_until < now() AND archived = false.
--   2. For rows older than 90 days that are still within their retain_until
--      window: strip the payload column (set to null) to reduce storage.
--      Keep all other columns for the audit trail.
--   3. Never touch rows where archived = true.

CREATE OR REPLACE FUNCTION hollis_actions_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ninety_days_ago CONSTANT timestamptz := now() - interval '90 days';
BEGIN
  -- Step 1: hard-delete expired, non-archived rows
  DELETE FROM hollis_actions
  WHERE retain_until < now()
    AND archived = false;

  -- Step 2: strip payload from rows older than 90 days (still within retain window)
  UPDATE hollis_actions
  SET payload = NULL
  WHERE created_at < ninety_days_ago
    AND payload IS NOT NULL
    AND archived = false;
END;
$$;

-- Schedule weekly via pg_cron if the extension is available.
-- Runs Sundays at 03:00 UTC to avoid overlap with daily cron jobs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'hollis-actions-cleanup',
      '0 3 * * 0',
      'SELECT hollis_actions_cleanup()'
    );
  END IF;
END;
$$;
