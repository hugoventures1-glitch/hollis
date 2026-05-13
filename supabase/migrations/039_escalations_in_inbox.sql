-- ── Escalations in Inbox ────────────────────────────────────────────────────
-- Adds tier support to approval_queue so Tier 3 escalations surface in the
-- Hollis inbox alongside Tier 2 decisions. Also adds escalation resolution
-- metadata so brokers can mark escalations handled, resume, or terminate.

-- 1. Add tier column to approval_queue (default 2 for backwards compat)
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS tier SMALLINT NOT NULL DEFAULT 2
  CHECK (tier IN (2, 3));

COMMENT ON COLUMN approval_queue.tier IS
  '2 = broker approval required (decision queue), 3 = hard escalation requiring manual intervention';

-- 2. Index for fast escalation lookups
CREATE INDEX IF NOT EXISTS aq_tier_status_idx
  ON approval_queue (user_id, tier, status)
  WHERE tier = 3 AND status = 'pending';

-- 3. Add resolution_type to broker_decision JSONB schema support
-- (no schema enforcement — JSONB is flexible; UI + API handle semantics)
-- Resolution types for Tier 3: 'handled', 'resume', 'terminate'
