-- ── Doc Chase Escalation ─────────────────────────────────────────────────────
-- Touch 3 can be SMS when client_phone exists; touch 4 surfaces a phone script
-- in the UI instead of sending automatically.

-- Add channel and phone_script to doc_chase_messages
ALTER TABLE doc_chase_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'sms', 'phone_script'));

ALTER TABLE doc_chase_messages
  ADD COLUMN IF NOT EXISTS phone_script TEXT;

-- Add escalation tracking to doc_chase_requests
ALTER TABLE doc_chase_requests
  ADD COLUMN IF NOT EXISTS escalation_level TEXT NOT NULL DEFAULT 'email'
    CHECK (escalation_level IN ('email', 'sms', 'phone_script'));

ALTER TABLE doc_chase_requests
  ADD COLUMN IF NOT EXISTS escalation_updated_at TIMESTAMPTZ;
