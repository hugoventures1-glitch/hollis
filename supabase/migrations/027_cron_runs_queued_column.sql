-- migration 027: add queued column to cron_job_runs
--
-- Tracks how many touchpoints were routed to the Tier 2 approval queue
-- (rather than auto-sent) during each cron run.

ALTER TABLE cron_job_runs
  ADD COLUMN IF NOT EXISTS queued INT NOT NULL DEFAULT 0;
