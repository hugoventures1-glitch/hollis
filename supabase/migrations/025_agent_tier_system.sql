-- ============================================================
-- Migration 025 — Agent Tier System
-- ============================================================
-- Decision gate that sits between cron jobs and outbound actions.
-- Reads inbound signals, classifies intent, sets renewal_flags,
-- and routes to Tier 1 (autonomous), Tier 2 (broker approval),
-- or Tier 3 (halt + escalate).
--
-- Steps implemented here:
--   1. renewal_flags JSONB column on policies
--   2. inbound_signals table (manual stub — Step 2 deferred)
--   3. parser_outcomes table schema (learning layer — Step 8)
--   4. approval_queue table schema (Tier 2 UI — Step 7)
--   5. Extend renewal_audit_log event_type CHECK constraint

-- ── 1. Add renewal_flags to policies ──────────────────────────────────────────
-- JSONB column tracking known complications on a renewal.
-- Flags are set by: inbound parser, manual broker input, or cron.
-- days_to_expiry is computed at runtime (not stored in the JSONB — see flag-writer.ts).

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS renewal_flags JSONB NOT NULL DEFAULT '{
    "active_claim": false,
    "insurer_declined": false,
    "premium_increase_pct": null,
    "business_restructure": false,
    "third_party_contact": false,
    "silent_client": false,
    "days_to_expiry": 0
  }'::jsonb;

-- GIN index for querying flags efficiently
CREATE INDEX IF NOT EXISTS policies_renewal_flags_idx ON policies USING GIN (renewal_flags);

-- ── 2. Inbound signals table ───────────────────────────────────────────────────
-- Stores raw inbound signals before and after processing.
-- Step 2 is deferred: source='manual' is the stub for testing.
-- In production, a Resend inbound webhook will write here.

CREATE TABLE IF NOT EXISTS inbound_signals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id             UUID        NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_signal            TEXT        NOT NULL,
  sender_email          TEXT,
  sender_name           TEXT,
  source                TEXT        NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('manual', 'email', 'sms')),
  processed             BOOLEAN     NOT NULL DEFAULT FALSE,
  processed_at          TIMESTAMPTZ,
  classification_result JSONB,      -- populated after intent classifier runs
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS is_policy_id_idx  ON inbound_signals(policy_id);
CREATE INDEX IF NOT EXISTS is_user_id_idx    ON inbound_signals(user_id);
CREATE INDEX IF NOT EXISTS is_processed_idx  ON inbound_signals(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS is_created_at_idx ON inbound_signals(created_at DESC);

ALTER TABLE inbound_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "is_select" ON inbound_signals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "is_insert" ON inbound_signals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "is_update" ON inbound_signals
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 3. Parser outcomes table ───────────────────────────────────────────────────
-- Append-only record of every classification + broker decision.
-- Feeds the few-shot injection learning layer (Step 8).
-- Schema created now; learning injection logic wired in Step 8.

CREATE TABLE IF NOT EXISTS parser_outcomes (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id        UUID          REFERENCES policies(id) ON DELETE SET NULL,
  signal_id         UUID          REFERENCES inbound_signals(id) ON DELETE SET NULL,
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_signal        TEXT          NOT NULL,
  classified_intent TEXT          NOT NULL,
  confidence_score  DECIMAL(4,3)  NOT NULL,
  broker_action     TEXT          CHECK (broker_action IN ('approved', 'rejected', 'edited')),
  final_intent      TEXT,         -- actual intent after broker resolution
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS po_renewal_id_idx    ON parser_outcomes(renewal_id);
CREATE INDEX IF NOT EXISTS po_user_id_idx       ON parser_outcomes(user_id);
CREATE INDEX IF NOT EXISTS po_broker_action_idx ON parser_outcomes(broker_action);
CREATE INDEX IF NOT EXISTS po_created_at_idx    ON parser_outcomes(created_at DESC);

ALTER TABLE parser_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_select" ON parser_outcomes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "po_insert" ON parser_outcomes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "po_update" ON parser_outcomes
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 4. Approval queue table ────────────────────────────────────────────────────
-- Holds Tier 2 actions pending broker approval.
-- One-click approve / reject / edit from the broker dashboard (Step 7).
-- Every resolution writes back to parser_outcomes.

CREATE TABLE IF NOT EXISTS approval_queue (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID          NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id           UUID          REFERENCES inbound_signals(id) ON DELETE SET NULL,
  classified_intent   TEXT          NOT NULL,
  confidence_score    DECIMAL(4,3)  NOT NULL,
  raw_signal_snippet  TEXT          NOT NULL,  -- verbatim excerpt for broker review
  proposed_action     JSONB         NOT NULL,  -- what the agent wants to do
  status              TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  broker_decision     JSONB,                   -- broker override payload (for 'edited' case)
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS aq_policy_id_idx  ON approval_queue(policy_id);
CREATE INDEX IF NOT EXISTS aq_user_id_idx    ON approval_queue(user_id);
CREATE INDEX IF NOT EXISTS aq_status_idx     ON approval_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS aq_created_at_idx ON approval_queue(created_at DESC);

ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aq_select" ON approval_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "aq_insert" ON approval_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "aq_update" ON approval_queue
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 5. Extend renewal_audit_log event_type CHECK constraint ───────────────────
-- Must drop and recreate — Postgres does not support ALTER CONSTRAINT.

ALTER TABLE renewal_audit_log
  DROP CONSTRAINT IF EXISTS renewal_audit_log_event_type_check;

ALTER TABLE renewal_audit_log
  ADD CONSTRAINT renewal_audit_log_event_type_check CHECK (event_type IN (
    -- Existing event types (preserved)
    'email_sent',
    'sms_sent',
    'questionnaire_sent',
    'questionnaire_responded',
    'insurer_terms_logged',
    'submission_sent',
    'recommendation_sent',
    'client_confirmed',
    'final_notice_sent',
    'lapse_recorded',
    'doc_requested',
    'doc_received',
    'note_added',
    -- Agent tier system event types
    'signal_received',    -- inbound signal recorded and processed
    'tier_1_action',      -- autonomous action taken (no broker needed)
    'tier_2_drafted',     -- action drafted, queued for broker approval
    'tier_3_escalated',   -- escalated to broker, sequence halted
    'sequence_halted',    -- renewal sequence explicitly stopped
    'flag_set'            -- renewal flag written or updated
  ));
