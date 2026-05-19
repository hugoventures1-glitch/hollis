-- Migration 042 — Outlook thread headers
-- Stores Thread-Index and Thread-Topic headers extracted from inbound Outlook emails
-- so outbound replies can include child Thread-Index values and maintain Outlook conversation view.

ALTER TABLE inbound_signals
  ADD COLUMN IF NOT EXISTS thread_index TEXT,
  ADD COLUMN IF NOT EXISTS thread_topic TEXT;

ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS thread_index TEXT,
  ADD COLUMN IF NOT EXISTS thread_topic TEXT;

ALTER TABLE doc_chase_requests
  ADD COLUMN IF NOT EXISTS thread_index TEXT,
  ADD COLUMN IF NOT EXISTS thread_topic TEXT;
