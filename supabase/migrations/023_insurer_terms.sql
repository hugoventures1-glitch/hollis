-- ============================================================
-- Migration 023 — Insurer Terms Capture (Feature 1)
-- ============================================================
-- Stores structured insurer renewal terms per policy.
-- Multiple insurers can be logged per policy for side-by-side comparison.

CREATE TABLE IF NOT EXISTS insurer_terms (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID          NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insurer_name        TEXT          NOT NULL,
  -- AI-parsed structured fields
  quoted_premium      NUMERIC(12,2),
  premium_change      NUMERIC(12,2),      -- delta from prior year (positive = increase)
  premium_change_pct  NUMERIC(5,2),       -- percentage change (e.g. 12.5 for 12.5%)
  payment_terms       TEXT,
  new_exclusions      TEXT[]        NOT NULL DEFAULT '{}',
  changed_conditions  TEXT[]        NOT NULL DEFAULT '{}',
  effective_date      DATE,
  expiry_date         DATE,
  -- Raw input and full AI parse result
  raw_input_text      TEXT,
  parsed_data         JSONB         NOT NULL DEFAULT '{}',
  -- Agent review fields
  is_recommended      BOOLEAN       NOT NULL DEFAULT FALSE,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS it_policy_id_idx ON insurer_terms(policy_id);
CREATE INDEX IF NOT EXISTS it_user_id_idx   ON insurer_terms(user_id);

ALTER TABLE insurer_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "it_select" ON insurer_terms FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "it_insert" ON insurer_terms FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "it_update" ON insurer_terms FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "it_delete" ON insurer_terms FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER insurer_terms_updated_at
  BEFORE UPDATE ON insurer_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
