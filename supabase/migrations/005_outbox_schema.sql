-- ── Outbox / Draft Engine ────────────────────────────────────
-- Tracks AI-generated outreach drafts awaiting agent review.

-- Add drafts_generated flag to policies so we only draft once per renewal cycle.
ALTER TABLE policies ADD COLUMN IF NOT EXISTS drafts_generated BOOLEAN NOT NULL DEFAULT FALSE;

-- outbox_drafts — one row per generated draft email
CREATE TABLE IF NOT EXISTS outbox_drafts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  renewal_id   UUID        NOT NULL REFERENCES policies(id)   ON DELETE CASCADE,
  subject      TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS outbox_drafts_user_id_idx    ON outbox_drafts(user_id);
CREATE INDEX IF NOT EXISTS outbox_drafts_renewal_id_idx ON outbox_drafts(renewal_id);
CREATE INDEX IF NOT EXISTS outbox_drafts_status_idx     ON outbox_drafts(status);

ALTER TABLE outbox_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbox_select" ON outbox_drafts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "outbox_insert" ON outbox_drafts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outbox_update" ON outbox_drafts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "outbox_delete" ON outbox_drafts FOR DELETE USING (auth.uid() = user_id);
