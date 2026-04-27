-- Persistent daily briefing cache.
-- Keyed by (user_id, cache_date) so each user gets one row per day.
-- Survives serverless cold starts — replaces the module-level in-memory Map.

CREATE TABLE IF NOT EXISTS briefing_cache (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_date DATE        NOT NULL,
  items      JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, cache_date)
);

ALTER TABLE briefing_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own briefing cache"
  ON briefing_cache FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
