-- ============================================================
-- Migration 035 — Email Thread Tracking
-- ============================================================
-- Enables Hollis to reply within the same email thread by storing
-- inbound Message-ID headers and threading outbound replies via
-- In-Reply-To and References headers passed to Resend.

-- ── 1. inbound_signals — store inbound email headers ─────────────
ALTER TABLE inbound_signals
  ADD COLUMN IF NOT EXISTS email_id TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS references_headers TEXT;

CREATE INDEX IF NOT EXISTS inbound_signals_message_id_idx ON inbound_signals(message_id) WHERE message_id IS NOT NULL;

-- ── 2. send_logs — record what outbound email we replied to ──────
ALTER TABLE send_logs
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS email_references TEXT;

-- ── 3. approval_queue — carry thread context into broker review ───
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS email_references TEXT;

-- ── 4. doc_chase_requests — track client reply Message-ID ───────
ALTER TABLE doc_chase_requests
  ADD COLUMN IF NOT EXISTS last_client_message_id TEXT;
