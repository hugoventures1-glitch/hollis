-- ============================================================
-- Migration 022 — Renewal Audit Log + Extended Campaign Stages
-- ============================================================
-- This is the foundational migration for the bulletproof renewal workflow.
-- Run this before all other 02x migrations.

-- ── 1. Extend campaign_stage CHECK constraint ──────────────────────────────
-- Must drop and recreate — Postgres does not support ALTER CONSTRAINT.

ALTER TABLE policies
  DROP CONSTRAINT IF EXISTS policies_campaign_stage_check;

ALTER TABLE policies
  ADD CONSTRAINT policies_campaign_stage_check CHECK (campaign_stage IN (
    -- Existing stages (preserved for backward compatibility)
    'pending',
    'email_90_sent',
    'email_60_sent',
    'sms_30_sent',
    'script_14_ready',
    'complete',
    -- New stages
    'questionnaire_sent',   -- F3: questionnaire link sent at 90-day mark
    'submission_sent',      -- F7: insurer submission sent to market
    'recommendation_sent',  -- F2: recommendation pack sent to client
    'final_notice_sent',    -- F5: 7-day final notice sent
    'confirmed',            -- client confirmed renewal is proceeding
    'lapsed'                -- F6: policy lapsed with no client confirmation
  ));

-- ── 2. Extend campaign_touchpoints.type CHECK constraint ──────────────────

ALTER TABLE campaign_touchpoints
  DROP CONSTRAINT IF EXISTS campaign_touchpoints_type_check;

ALTER TABLE campaign_touchpoints
  ADD CONSTRAINT campaign_touchpoints_type_check CHECK (type IN (
    -- Existing types (preserved)
    'email_90',
    'email_60',
    'sms_30',
    'script_14',
    -- New types
    'questionnaire_90',   -- F3: questionnaire email at 90-day mark
    'submission_60',      -- F7: insurer submission
    'recommendation_30',  -- F2: recommendation pack to client
    'final_notice_7'      -- F5: final notice at 7 days
  ));

-- ── 3. Add new columns to policies ────────────────────────────────────────

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS client_confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lapsed_at            TIMESTAMPTZ;

-- ── 4. Create renewal_audit_log — append-only legal audit backbone ─────────
-- Every renewal workflow action (sends, questionnaire, terms, confirmation,
-- lapse) writes a row here. No UPDATE or DELETE policies — immutable by design.

CREATE TABLE IF NOT EXISTS renewal_audit_log (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id        UUID          NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type       TEXT          NOT NULL CHECK (event_type IN (
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
    'note_added'
  )),
  channel          TEXT          CHECK (channel IN ('email', 'sms', 'internal', 'web')),
  recipient        TEXT,
  content_snapshot TEXT,
  metadata         JSONB         NOT NULL DEFAULT '{}',
  actor_type       TEXT          NOT NULL DEFAULT 'system'
                   CHECK (actor_type IN ('system', 'agent')),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ral_policy_id_idx  ON renewal_audit_log(policy_id);
CREATE INDEX IF NOT EXISTS ral_user_id_idx    ON renewal_audit_log(user_id);
CREATE INDEX IF NOT EXISTS ral_event_type_idx ON renewal_audit_log(event_type);
CREATE INDEX IF NOT EXISTS ral_created_at_idx ON renewal_audit_log(created_at DESC);

ALTER TABLE renewal_audit_log ENABLE ROW LEVEL SECURITY;

-- Agents can read their own audit entries
CREATE POLICY "ral_select" ON renewal_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Agents can insert their own audit entries (system uses service role)
CREATE POLICY "ral_insert" ON renewal_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE policy — table is append-only
-- No DELETE policy — table is append-only
