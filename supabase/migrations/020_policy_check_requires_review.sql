-- migration 020: requires_review flag on policy_checks
--
-- When the AI analysis produces overall_confidence = 'low', the check is
-- flagged as requires_review = true. The UI shows a prominent banner
-- prompting the agent to manually verify results before acting on them.

ALTER TABLE policy_checks
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS policy_checks_requires_review_idx
  ON policy_checks (requires_review)
  WHERE requires_review = true;
