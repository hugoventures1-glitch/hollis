export type PolicyStatus = "active" | "expired" | "cancelled";

export type CampaignStage =
  | "pending"
  | "email_90_sent"
  | "email_60_sent"
  | "sms_30_sent"
  | "script_14_ready"
  | "complete";

export type TouchpointType = "email_90" | "email_60" | "sms_30" | "script_14";
export type TouchpointStatus = "pending" | "sent" | "failed" | "skipped";
export type SendChannel = "email" | "sms";
export type SendStatus = "sent" | "failed" | "bounced";
export type TemplateType = "email_90" | "email_60" | "sms_30" | "script_14";

export interface Policy {
  id: string;
  user_id: string;
  policy_name: string;
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  agent_name?: string | null;
  agent_email?: string | null;
  expiration_date: string; // ISO date string (YYYY-MM-DD)
  carrier: string;
  premium?: number | null;
  status: PolicyStatus;
  campaign_stage: CampaignStage;
  last_contact_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignTouchpoint {
  id: string;
  policy_id: string;
  user_id: string;
  type: TouchpointType;
  status: TouchpointStatus;
  subject?: string | null;
  content?: string | null;
  scheduled_at: string; // ISO date string
  sent_at?: string | null;
  created_at: string;
}

export interface SendLog {
  id: string;
  policy_id: string;
  touchpoint_id?: string | null;
  user_id: string;
  channel: SendChannel;
  recipient: string;
  status: SendStatus;
  provider_message_id?: string | null;
  error_message?: string | null;
  sent_at: string;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  user_id: string;
  template_type: TemplateType;
  subject?: string | null;
  body: string;
  is_approved: boolean;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ── CSV upload types ─────────────────────────────────────────

export interface CSVPolicyRow {
  policy_name: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  expiration_date: string;
  carrier: string;
  premium?: number;
}

export type ColumnMapping = Record<string, keyof CSVPolicyRow | "">;

// ── View / joined types ──────────────────────────────────────

export interface PolicyWithTouchpoints extends Policy {
  campaign_touchpoints: CampaignTouchpoint[];
}

export interface PolicyDetail extends Policy {
  campaign_touchpoints: CampaignTouchpoint[];
  send_logs: SendLog[];
}

// ── Helpers ──────────────────────────────────────────────────

export function daysUntilExpiry(expirationDate: string): number {
  const expiry = new Date(expirationDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function touchpointScheduledDate(
  expirationDate: string,
  type: TouchpointType
): string {
  const expiry = new Date(expirationDate);
  const offsets: Record<TouchpointType, number> = {
    email_90: -90,
    email_60: -60,
    sms_30: -30,
    script_14: -14,
  };
  expiry.setDate(expiry.getDate() + offsets[type]);
  return expiry.toISOString().split("T")[0];
}

export const TOUCHPOINT_LABELS: Record<TouchpointType, string> = {
  email_90: "90-Day Email",
  email_60: "60-Day Follow-up",
  sms_30: "30-Day SMS",
  script_14: "14-Day Call Script",
};

export const STAGE_LABELS: Record<CampaignStage, string> = {
  pending: "Not Started",
  email_90_sent: "90-Day Sent",
  email_60_sent: "60-Day Sent",
  sms_30_sent: "SMS Sent",
  script_14_ready: "Call Script Ready",
  complete: "Complete",
};
