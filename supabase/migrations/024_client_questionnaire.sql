-- ============================================================
-- Migration 024 — Client Renewal Questionnaire (Feature 3)
-- ============================================================
-- Public-facing questionnaire sent to clients at the 90-day mark.
-- Accessed via /q/[token] without authentication (service role lookup).

CREATE TABLE IF NOT EXISTS renewal_questionnaires (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id        UUID          NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Cryptographically random token for unauthenticated client access
  token            TEXT          NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64url'),
  status           TEXT          NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent', 'responded', 'expired')),
  sent_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  -- Client form responses (raw key-value pairs)
  responses        JSONB,
  -- Claude Haiku parsed suggestions for broker review
  ai_suggestions   JSONB,
  -- Broker review of AI suggestions
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID          REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rq_policy_id_idx ON renewal_questionnaires(policy_id);
CREATE INDEX IF NOT EXISTS rq_token_idx     ON renewal_questionnaires(token);
CREATE INDEX IF NOT EXISTS rq_status_idx    ON renewal_questionnaires(status);
CREATE INDEX IF NOT EXISTS rq_user_id_idx   ON renewal_questionnaires(user_id);

ALTER TABLE renewal_questionnaires ENABLE ROW LEVEL SECURITY;

-- Brokers can read/write their own questionnaires
CREATE POLICY "rq_select" ON renewal_questionnaires
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rq_insert" ON renewal_questionnaires
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rq_update" ON renewal_questionnaires
  FOR UPDATE USING (auth.uid() = user_id);

-- Public token-based access (client submission) uses the service role admin client,
-- which bypasses RLS entirely. No public RLS policy needed.
