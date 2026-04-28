-- Migration 036: Renewal timeline config
-- Adds flexible touchpoint timeline to broker profiles and per-policy overrides.

-- 1. Broker-level default timeline on agent_profiles
ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS renewal_timeline JSONB;

-- 2. Per-policy custom timeline override on policies
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS custom_timeline JSONB;

-- 3. Drop the fixed CHECK constraint on campaign_touchpoints.type
--    so flexible timeline touchpoints can use freeform type strings like 'tp_{id}'
ALTER TABLE campaign_touchpoints
  DROP CONSTRAINT IF EXISTS campaign_touchpoints_type_check;
