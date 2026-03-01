-- 011_renewal_health_score.sql
--
-- Adds computed health-score fields to the policies table.
-- Scores are written by the /api/renewals/health-scores/refresh endpoint
-- and by the daily cron after each campaign touchpoint fires.
-- Existing RLS policies cover these columns automatically.

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS health_score        INTEGER     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_label        TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_updated_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stalled_at          TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE policies
  ADD CONSTRAINT policies_health_label_check
    CHECK (health_label IN ('healthy', 'at_risk', 'critical', 'stalled'));
