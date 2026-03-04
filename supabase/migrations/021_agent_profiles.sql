CREATE TABLE IF NOT EXISTS agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Profile
  first_name text,
  last_name text,
  title text,
  phone text,
  avatar_url text,

  -- Agency
  agency_name text,
  agency_address text,
  agency_phone text,
  agency_website text,
  agency_abn text,
  agency_afsl text,
  agency_logo_url text,

  -- Email
  email_signature text,
  email_from_name text,
  reply_to_email text,
  cc_self_on_client_emails boolean DEFAULT false,

  -- Notifications
  notify_renewal_fired boolean DEFAULT true,
  notify_doc_chase_fired boolean DEFAULT true,
  notify_coi_requested boolean DEFAULT true,
  notify_policy_gap_detected boolean DEFAULT true,
  notify_daily_summary boolean DEFAULT false,

  -- Branding
  primary_color text DEFAULT '#00d4aa',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON agent_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON agent_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON agent_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_agent_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_profiles_updated_at
  BEFORE UPDATE ON agent_profiles
  FOR EACH ROW EXECUTE FUNCTION update_agent_profiles_updated_at();
