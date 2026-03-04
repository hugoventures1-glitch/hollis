export interface AgentProfile {
  id: string;
  user_id: string;

  // Profile
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  phone: string | null;
  avatar_url: string | null;

  // Agency
  agency_name: string | null;
  agency_address: string | null;
  agency_phone: string | null;
  agency_website: string | null;
  agency_abn: string | null;
  agency_afsl: string | null;
  agency_logo_url: string | null;

  // Email
  email_signature: string | null;
  email_from_name: string | null;
  reply_to_email: string | null;
  cc_self_on_client_emails: boolean;

  // Notifications
  notify_renewal_fired: boolean;
  notify_doc_chase_fired: boolean;
  notify_coi_requested: boolean;
  notify_policy_gap_detected: boolean;
  notify_daily_summary: boolean;

  // Branding
  primary_color: string;

  created_at: string;
  updated_at: string;
}

export type AgentProfilePatch = Partial<Omit<AgentProfile, "id" | "user_id" | "created_at" | "updated_at">>;
