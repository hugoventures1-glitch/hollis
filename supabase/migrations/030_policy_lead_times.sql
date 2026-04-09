-- Migration 030: Configurable renewal lead times per policy type
--
-- Adds `policy_type` to policies and a new `renewal_lead_time_configs` table
-- so brokers can set different outreach windows per line of business
-- (e.g. BI: 90/60/30/14 days, Home: 30/21/14/7 days).

-- 1. Add policy_type column to policies (NULL = no type, use global defaults)
ALTER TABLE policies ADD COLUMN IF NOT EXISTS policy_type TEXT;
CREATE INDEX IF NOT EXISTS policies_policy_type_idx ON policies (policy_type);

-- 2. Per-broker, per-policy-type lead time configuration
CREATE TABLE IF NOT EXISTS renewal_lead_time_configs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_type     TEXT        NOT NULL,
  -- Offsets in days before expiry (stored as positive integers for UI clarity)
  offset_email_1  INTEGER     NOT NULL DEFAULT 90  CHECK (offset_email_1  BETWEEN 1 AND 365),
  offset_email_2  INTEGER     NOT NULL DEFAULT 60  CHECK (offset_email_2  BETWEEN 1 AND 365),
  offset_sms      INTEGER     NOT NULL DEFAULT 30  CHECK (offset_sms      BETWEEN 1 AND 365),
  offset_call     INTEGER     NOT NULL DEFAULT 14  CHECK (offset_call     BETWEEN 1 AND 365),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT renewal_lead_time_configs_user_type_key UNIQUE (user_id, policy_type)
);

CREATE INDEX IF NOT EXISTS rltc_user_id_idx ON renewal_lead_time_configs (user_id);

ALTER TABLE renewal_lead_time_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rltc_select" ON renewal_lead_time_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "rltc_insert" ON renewal_lead_time_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rltc_update" ON renewal_lead_time_configs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "rltc_delete" ON renewal_lead_time_configs
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_rltc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rltc_updated_at
  BEFORE UPDATE ON renewal_lead_time_configs
  FOR EACH ROW EXECUTE FUNCTION update_rltc_updated_at();
