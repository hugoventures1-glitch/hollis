-- migration 016: renewal override flags
--
-- Gives agents explicit control over the automated renewal campaign.
-- renewal_paused:          cron skips this policy entirely while true
-- renewal_paused_until:    optional date — cron auto-resumes after this date
-- renewal_manual_override: freetext note when agent marks renewal as manually handled

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS renewal_paused          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_paused_until    DATE,
  ADD COLUMN IF NOT EXISTS renewal_manual_override TEXT;

CREATE INDEX IF NOT EXISTS policies_renewal_paused_idx ON policies (renewal_paused) WHERE renewal_paused = true;
