ALTER TABLE inbound_signals
  ADD COLUMN IF NOT EXISTS subject TEXT;
