ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS tutorial_completed boolean DEFAULT false;

-- Existing users have already seen the app — mark them as done
-- so the tutorial only auto-plays for brand-new sign-ups going forward
UPDATE agent_profiles SET tutorial_completed = true;
