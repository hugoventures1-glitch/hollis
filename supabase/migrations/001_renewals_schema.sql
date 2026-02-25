-- ============================================================
-- Hollis — Renewal Reminders Schema
-- Run this in your Supabase SQL editor or via supabase db push
-- ============================================================

-- ── Policies ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policies (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_name       TEXT        NOT NULL,
  client_name       TEXT        NOT NULL,
  client_email      TEXT        NOT NULL,
  client_phone      TEXT,
  expiration_date   DATE        NOT NULL,
  carrier           TEXT        NOT NULL,
  premium           NUMERIC(12, 2),
  status            TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'expired', 'cancelled')),
  campaign_stage    TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (campaign_stage IN (
                      'pending',
                      'email_90_sent',
                      'email_60_sent',
                      'sms_30_sent',
                      'script_14_ready',
                      'complete'
                    )),
  last_contact_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Campaign Touchpoints ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_touchpoints (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id      UUID        NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL
                 CHECK (type IN ('email_90', 'email_60', 'sms_30', 'script_14')),
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  subject        TEXT,
  content        TEXT,
  scheduled_at   DATE        NOT NULL,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Send Logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS send_logs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id             UUID        NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  touchpoint_id         UUID        REFERENCES campaign_touchpoints(id) ON DELETE SET NULL,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel               TEXT        NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient             TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'failed', 'bounced')),
  provider_message_id   TEXT,
  error_message         TEXT,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Email Templates (onboarding approval) ───────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_type   TEXT        NOT NULL
                  CHECK (template_type IN ('email_90', 'email_60', 'sms_30', 'script_14')),
  subject         TEXT,
  body            TEXT        NOT NULL,
  is_approved     BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, template_type)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS policies_user_id_idx          ON policies(user_id);
CREATE INDEX IF NOT EXISTS policies_expiration_date_idx  ON policies(expiration_date);
CREATE INDEX IF NOT EXISTS policies_status_idx           ON policies(status);
CREATE INDEX IF NOT EXISTS policies_campaign_stage_idx   ON policies(campaign_stage);

CREATE INDEX IF NOT EXISTS touchpoints_policy_id_idx     ON campaign_touchpoints(policy_id);
CREATE INDEX IF NOT EXISTS touchpoints_scheduled_at_idx  ON campaign_touchpoints(scheduled_at);
CREATE INDEX IF NOT EXISTS touchpoints_status_idx        ON campaign_touchpoints(status);

CREATE INDEX IF NOT EXISTS send_logs_policy_id_idx       ON send_logs(policy_id);
CREATE INDEX IF NOT EXISTS send_logs_touchpoint_id_idx   ON send_logs(touchpoint_id);

-- ── Row-Level Security ───────────────────────────────────────
ALTER TABLE policies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates    ENABLE ROW LEVEL SECURITY;

-- policies
CREATE POLICY "policies_select" ON policies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "policies_insert" ON policies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policies_update" ON policies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "policies_delete" ON policies FOR DELETE USING (auth.uid() = user_id);

-- campaign_touchpoints
CREATE POLICY "touchpoints_select" ON campaign_touchpoints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "touchpoints_insert" ON campaign_touchpoints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "touchpoints_update" ON campaign_touchpoints FOR UPDATE USING (auth.uid() = user_id);

-- send_logs
CREATE POLICY "send_logs_select" ON send_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "send_logs_insert" ON send_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- email_templates
CREATE POLICY "templates_select" ON email_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "templates_insert" ON email_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "templates_update" ON email_templates FOR UPDATE USING (auth.uid() = user_id);

-- ── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
