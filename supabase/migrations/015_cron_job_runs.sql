-- migration 015: durable cron job run log
--
-- Records each cron execution with outcome metrics.
-- No RLS needed — this table is only written by service-role cron routes.

CREATE TABLE IF NOT EXISTS cron_job_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       TEXT        NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'complete', 'failed')),
  processed      INT         NOT NULL DEFAULT 0,
  sent           INT         NOT NULL DEFAULT 0,
  skipped        INT         NOT NULL DEFAULT 0,
  failed         INT         NOT NULL DEFAULT 0,
  error_summary  TEXT
);

CREATE INDEX IF NOT EXISTS cron_job_runs_job_name_idx ON cron_job_runs (job_name, started_at DESC);
