-- ── Import Jobs ───────────────────────────────────────────────────────────────
-- Async import tracking for large CSV files (>500 rows).
-- Row is created immediately; client polls /api/import/full/[jobId]/status.

CREATE TABLE IF NOT EXISTS import_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  total_rows     INT         NOT NULL DEFAULT 0,
  processed_rows INT         NOT NULL DEFAULT 0,
  result_json    JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_jobs_user_id_idx ON import_jobs (user_id);

-- updated_at auto-trigger (reuse fn from migration 001)
CREATE TRIGGER import_jobs_updated_at
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs_select" ON import_jobs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "import_jobs_insert" ON import_jobs
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "import_jobs_update" ON import_jobs
  FOR UPDATE USING (user_id = auth.uid());
