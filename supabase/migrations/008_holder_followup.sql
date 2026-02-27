-- ── Certificate Holder Follow-Up Engine ────────────────────────────
-- Configurable multi-touch email sequence sent to certificate holders
-- when a COI expires or is about to expire.

-- ── Sequences (one per certificate+holder pair) ──────────────────

CREATE TABLE IF NOT EXISTS holder_followup_sequences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certificate_id   UUID        NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  holder_name      TEXT        NOT NULL,
  holder_email     TEXT        NOT NULL,
  sequence_status  TEXT        NOT NULL DEFAULT 'active'
                   CHECK (sequence_status IN ('active', 'completed', 'cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- ── Messages (3 touches per sequence) ────────────────────────────

CREATE TABLE IF NOT EXISTS holder_followup_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    UUID        NOT NULL REFERENCES holder_followup_sequences(id) ON DELETE CASCADE,
  touch_number   INT         NOT NULL CHECK (touch_number IN (1, 2, 3)),
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  subject        TEXT        NOT NULL,
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS hf_sequences_user_id_idx
  ON holder_followup_sequences (user_id);

CREATE INDEX IF NOT EXISTS hf_sequences_certificate_id_idx
  ON holder_followup_sequences (certificate_id);

-- Partial index for the process-job query (only scheduled future messages)
CREATE INDEX IF NOT EXISTS hf_messages_due_idx
  ON holder_followup_messages (scheduled_for)
  WHERE status = 'scheduled';

-- ── Row-Level Security ────────────────────────────────────────────

ALTER TABLE holder_followup_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE holder_followup_messages  ENABLE ROW LEVEL SECURITY;

-- Sequences: agents see/update their own only
CREATE POLICY "hf_seq_select" ON holder_followup_sequences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "hf_seq_insert" ON holder_followup_sequences
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "hf_seq_update" ON holder_followup_sequences
  FOR UPDATE USING (user_id = auth.uid());

-- Messages: accessible when the parent sequence belongs to this user
CREATE POLICY "hf_msg_select" ON holder_followup_messages
  FOR SELECT USING (
    sequence_id IN (
      SELECT id FROM holder_followup_sequences WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "hf_msg_insert" ON holder_followup_messages
  FOR INSERT WITH CHECK (
    sequence_id IN (
      SELECT id FROM holder_followup_sequences WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "hf_msg_update" ON holder_followup_messages
  FOR UPDATE USING (
    sequence_id IN (
      SELECT id FROM holder_followup_sequences WHERE user_id = auth.uid()
    )
  );
