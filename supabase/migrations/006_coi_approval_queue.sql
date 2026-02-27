-- ── Zero-Touch COI Approval Queue ─────────────────────────────
-- Adds auto-generation tracking columns and two new request statuses.

-- 1. Drop the old status constraint and replace with an expanded one
ALTER TABLE coi_requests
  DROP CONSTRAINT IF EXISTS coi_requests_status_check;

ALTER TABLE coi_requests
  ADD CONSTRAINT coi_requests_status_check
  CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'sent',
    'ready_for_approval',
    'needs_review'
  ));

-- 2. New columns on coi_requests
ALTER TABLE coi_requests
  ADD COLUMN IF NOT EXISTS auto_generated        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coverage_check_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS coverage_check_notes  TEXT;

-- Index for the approval queue queries
CREATE INDEX IF NOT EXISTS coi_requests_approval_status_idx
  ON coi_requests (agent_id, status)
  WHERE status IN ('ready_for_approval', 'needs_review');
