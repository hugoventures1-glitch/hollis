-- ── Policy Flag Resolution Workflow ────────────────────────────────
-- Adds suggested-action metadata and a lightweight resolution_status
-- to policy_check_flags.  The existing annotation_status / annotation_reason
-- (E&O workflow) is left completely untouched.

ALTER TABLE policy_check_flags
  ADD COLUMN IF NOT EXISTS action_label      TEXT,
  ADD COLUMN IF NOT EXISTS action_type       TEXT,
  ADD COLUMN IF NOT EXISTS draft_prompt      TEXT,
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open', 'actioned', 'dismissed'));

-- Partial index for the open-flags query (most common view)
CREATE INDEX IF NOT EXISTS flags_resolution_status_idx
  ON policy_check_flags (policy_check_id, resolution_status);
