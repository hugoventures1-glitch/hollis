-- migration 017: optimistic locking on coi_requests
--
-- Adds a version counter so concurrent approve/reject operations can detect
-- mid-flight conflicts and return a 409 rather than silently overwriting each other.

ALTER TABLE coi_requests
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;
