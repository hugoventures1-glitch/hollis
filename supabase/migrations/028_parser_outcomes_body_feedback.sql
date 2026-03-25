-- Add body feedback columns to parser_outcomes for learning from broker email edits
ALTER TABLE parser_outcomes
  ADD COLUMN IF NOT EXISTS original_body TEXT,
  ADD COLUMN IF NOT EXISTS edited_body   TEXT;
