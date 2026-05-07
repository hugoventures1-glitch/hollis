-- Add automation_paused flag to agent_profiles.
-- When true, the tier router forces all inbound signals to Tier 2 (approval queue)
-- instead of executing Tier 1 autonomous actions.

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS automation_paused boolean NOT NULL DEFAULT false;
