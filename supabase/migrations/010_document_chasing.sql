-- ── Document Chasing ─────────────────────────────────────────────────────────
-- Tracks outstanding documents needed from clients and auto-sequences
-- multi-touch email follow-ups until the document is received.

-- ── Document Chase Requests ───────────────────────────────────────────────────
-- One record per document needed from a client.

CREATE TABLE IF NOT EXISTS doc_chase_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name     TEXT        NOT NULL,
  client_email    TEXT        NOT NULL,
  client_phone    TEXT,
  document_type   TEXT        NOT NULL,
  policy_id       UUID        REFERENCES policies(id) ON DELETE SET NULL,
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'received', 'cancelled')),
  received_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Document Chase Sequences ──────────────────────────────────────────────────
-- One active sequence per request.

CREATE TABLE IF NOT EXISTS doc_chase_sequences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id       UUID        NOT NULL REFERENCES doc_chase_requests(id) ON DELETE CASCADE,
  sequence_status  TEXT        NOT NULL DEFAULT 'active'
                   CHECK (sequence_status IN ('active', 'completed', 'cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- ── Document Chase Messages ───────────────────────────────────────────────────
-- 4 scheduled touch emails per sequence.

CREATE TABLE IF NOT EXISTS doc_chase_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    UUID        NOT NULL REFERENCES doc_chase_sequences(id) ON DELETE CASCADE,
  touch_number   INT         NOT NULL CHECK (touch_number IN (1, 2, 3, 4)),
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  subject        TEXT        NOT NULL,
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS dc_requests_user_id_idx
  ON doc_chase_requests (user_id);

CREATE INDEX IF NOT EXISTS dc_requests_status_idx
  ON doc_chase_requests (status);

CREATE INDEX IF NOT EXISTS dc_requests_policy_id_idx
  ON doc_chase_requests (policy_id)
  WHERE policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dc_sequences_request_id_idx
  ON doc_chase_sequences (request_id);

CREATE INDEX IF NOT EXISTS dc_sequences_user_id_idx
  ON doc_chase_sequences (user_id);

-- Partial index for the cron-job query (only due scheduled messages)
CREATE INDEX IF NOT EXISTS dc_messages_due_idx
  ON doc_chase_messages (scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS dc_messages_sequence_id_idx
  ON doc_chase_messages (sequence_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE doc_chase_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chase_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chase_messages  ENABLE ROW LEVEL SECURITY;

-- Requests: agents see/modify only their own
CREATE POLICY "dc_req_select" ON doc_chase_requests
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "dc_req_insert" ON doc_chase_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "dc_req_update" ON doc_chase_requests
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "dc_req_delete" ON doc_chase_requests
  FOR DELETE USING (user_id = auth.uid());

-- Sequences: agents see/modify only their own
CREATE POLICY "dc_seq_select" ON doc_chase_sequences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "dc_seq_insert" ON doc_chase_sequences
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "dc_seq_update" ON doc_chase_sequences
  FOR UPDATE USING (user_id = auth.uid());

-- Messages: accessible when the parent sequence belongs to this user
CREATE POLICY "dc_msg_select" ON doc_chase_messages
  FOR SELECT USING (
    sequence_id IN (
      SELECT id FROM doc_chase_sequences WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "dc_msg_insert" ON doc_chase_messages
  FOR INSERT WITH CHECK (
    sequence_id IN (
      SELECT id FROM doc_chase_sequences WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "dc_msg_update" ON doc_chase_messages
  FOR UPDATE USING (
    sequence_id IN (
      SELECT id FROM doc_chase_sequences WHERE user_id = auth.uid()
    )
  );

-- ── updated_at trigger ────────────────────────────────────────────────────────
-- Reuses the update_updated_at() function created in migration 001.

CREATE TRIGGER dc_requests_updated_at
  BEFORE UPDATE ON doc_chase_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── mark_document_received function ──────────────────────────────────────────
-- When a doc_chase_request status is set to 'received':
--   1. Cancels all scheduled (unsent) messages for its active sequence.
--   2. Marks the active sequence as 'completed'.
-- Triggered automatically via the doc_chase_requests_received_trg trigger below.

CREATE OR REPLACE FUNCTION mark_document_received()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when status changes to 'received'
  IF NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received' THEN

    -- Set received_at if not already set
    IF NEW.received_at IS NULL THEN
      NEW.received_at := NOW();
    END IF;

    -- Cancel all scheduled (not yet sent) messages for this request's active sequence
    UPDATE doc_chase_messages
    SET    status = 'cancelled'
    WHERE  status = 'scheduled'
      AND  sequence_id IN (
             SELECT id
             FROM   doc_chase_sequences
             WHERE  request_id      = NEW.id
               AND  sequence_status = 'active'
           );

    -- Mark the active sequence as completed
    UPDATE doc_chase_sequences
    SET    sequence_status = 'completed',
           completed_at    = NOW()
    WHERE  request_id      = NEW.id
      AND  sequence_status = 'active';

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER doc_chase_requests_received_trg
  BEFORE UPDATE ON doc_chase_requests
  FOR EACH ROW EXECUTE FUNCTION mark_document_received();
