-- migration 030: per-client communication approval tiering
-- Adds require_approval flag to policies. When true, all outbound
-- communications for this policy are routed to Tier 2 (approval queue)
-- regardless of the broker's autonomous tier routing configuration.

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN policies.require_approval IS
  'When true, all outbound communications for this policy route to Tier 2 (approval queue) regardless of autonomous tier routing. Allows brokers to mark high-touch clients for manual sign-off on every communication.';
