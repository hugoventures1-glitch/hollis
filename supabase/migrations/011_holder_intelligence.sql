-- ============================================================
-- Hollis — Holder Intelligence
-- Adds pattern-memory columns to certificate_holders and
-- creates holder_request_history for tracking usage patterns.
-- Depends on: 002_coi_schema.sql
-- ============================================================

-- ── Add intelligence columns to certificate_holders ──────────
ALTER TABLE certificate_holders
  ADD COLUMN IF NOT EXISTS common_coverage_types  TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS common_insured_names   TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_requested_at      TIMESTAMPTZ DEFAULT NULL;

-- ── holder_request_history ────────────────────────────────────
CREATE TABLE IF NOT EXISTS holder_request_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_id       UUID        NOT NULL REFERENCES certificate_holders(id) ON DELETE CASCADE,
  insured_name    TEXT        NOT NULL,
  coverage_types  TEXT[]      NOT NULL DEFAULT '{}',
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS holder_history_user_holder_idx
  ON holder_request_history(user_id, holder_id);

CREATE INDEX IF NOT EXISTS holder_history_requested_at_idx
  ON holder_request_history(requested_at DESC);

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE holder_request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holder_history_select" ON holder_request_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "holder_history_insert" ON holder_request_history
  FOR INSERT WITH CHECK (user_id = auth.uid());
