export type PolicyStatus = "active" | "expired" | "cancelled";

export type HealthLabel = "healthy" | "at_risk" | "critical" | "stalled";

export type CampaignStage =
  | "pending"
  | "email_90_sent"
  | "email_60_sent"
  | "sms_30_sent"
  | "script_14_ready"
  | "complete"
  // New stages (Features 3, 5, 6, 7)
  | "questionnaire_sent"
  | "submission_sent"
  | "recommendation_sent"
  | "final_notice_sent"
  | "confirmed"
  | "lapsed";

export type TouchpointType =
  | "email_90"
  | "email_60"
  | "sms_30"
  | "script_14"
  // New touchpoint types (Features 3, 5, 7, 2)
  | "questionnaire_90"
  | "submission_60"
  | "recommendation_30"
  | "final_notice_7";
export type TouchpointStatus = "pending" | "processing" | "sent" | "failed" | "skipped";
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
  // ── Renewal override controls ─────────────────────────────────────────────
  renewal_paused?: boolean;
  renewal_paused_until?: string | null;
  renewal_manual_override?: string | null;
  require_approval?: boolean;
  // ── Health score (computed, refreshed by cron + refresh API) ──────────────
  health_score?: number | null;
  health_label?: HealthLabel | null;
  health_updated_at?: string | null;
  stalled_at?: string | null;
  // ── Renewal outcome columns (migration 022) ───────────────────────────────
  client_confirmed_at?: string | null;
  lapsed_at?: string | null;
  // ── Agent tier system (migration 025) ─────────────────────────────────────
  renewal_flags?: import("@/types/agent").RenewalFlags | null;
  // ── Policy type (migration 030) ───────────────────────────────────────────
  policy_type?: string | null;
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
  processing_started_at?: string | null;
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
  policy_type?: string;
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

// ── Lead time configuration (migration 030) ──────────────────────────────────

export interface LeadTimeConfig {
  id: string;
  user_id: string;
  policy_type: string;
  offset_email_1: number;
  offset_email_2: number;
  offset_sms: number;
  offset_call: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_LEAD_TIMES = {
  offset_email_1: 90,
  offset_email_2: 60,
  offset_sms: 30,
  offset_call: 14,
} as const;

export type LeadTimes = typeof DEFAULT_LEAD_TIMES;

export function resolveLeadTimes(
  policyType: string | null | undefined,
  configMap: Map<string, LeadTimeConfig>
): LeadTimes {
  if (!policyType) return DEFAULT_LEAD_TIMES;
  const cfg = configMap.get(policyType.toLowerCase());
  if (!cfg) return DEFAULT_LEAD_TIMES;
  return {
    offset_email_1: cfg.offset_email_1,
    offset_email_2: cfg.offset_email_2,
    offset_sms:     cfg.offset_sms,
    offset_call:    cfg.offset_call,
  } as LeadTimes;
}

export function touchpointScheduledDate(
  expirationDate: string,
  type: TouchpointType,
  leadTimes?: LeadTimes
): string {
  const lt = leadTimes ?? DEFAULT_LEAD_TIMES;
  const expiry = new Date(expirationDate);
  const offsets: Record<TouchpointType, number> = {
    email_90:          -lt.offset_email_1,
    email_60:          -lt.offset_email_2,
    sms_30:            -lt.offset_sms,
    script_14:         -lt.offset_call,
    questionnaire_90:  -lt.offset_email_1, // fires alongside first email
    submission_60:     -lt.offset_email_2,
    recommendation_30: -lt.offset_sms,
    final_notice_7:    -7,                 // always fixed, not configurable
  };
  expiry.setDate(expiry.getDate() + offsets[type]);
  return expiry.toISOString().split("T")[0];
}

export const TOUCHPOINT_LABELS: Record<TouchpointType, string> = {
  email_90: "90-Day Email",
  email_60: "60-Day Follow-up",
  sms_30: "30-Day SMS",
  script_14: "14-Day Call Script",
  questionnaire_90: "90-Day Questionnaire",
  submission_60: "Insurer Submission",
  recommendation_30: "Recommendation Pack",
  final_notice_7: "7-Day Final Notice",
};

export const STAGE_LABELS: Record<CampaignStage, string> = {
  pending: "Not Started",
  email_90_sent: "90-Day Sent",
  email_60_sent: "60-Day Sent",
  sms_30_sent: "SMS Sent",
  script_14_ready: "Call Script Ready",
  complete: "Complete",
  questionnaire_sent: "Questionnaire Sent",
  submission_sent: "Submission Sent",
  recommendation_sent: "Recommendation Sent",
  final_notice_sent: "Final Notice Sent",
  confirmed: "Confirmed",
  lapsed: "Lapsed",
};

// ── Audit Log ─────────────────────────────────────────────────────────────────

export type AuditEventType =
  | "email_sent"
  | "sms_sent"
  | "questionnaire_sent"
  | "questionnaire_responded"
  | "insurer_terms_logged"
  | "submission_sent"
  | "recommendation_sent"
  | "client_confirmed"
  | "final_notice_sent"
  | "lapse_recorded"
  | "doc_requested"
  | "doc_received"
  | "note_added"
  // Agent tier system event types (migration 025)
  | "signal_received"
  | "tier_1_action"
  | "tier_2_drafted"
  | "tier_3_escalated"
  | "sequence_halted"
  | "flag_set";

export interface AuditLogEntry {
  id: string;
  policy_id: string;
  user_id: string;
  event_type: AuditEventType;
  channel: "email" | "sms" | "internal" | "web" | null;
  recipient: string | null;
  content_snapshot: string | null;
  metadata: Record<string, unknown>;
  actor_type: "system" | "agent";
  created_at: string;
}

// ── Insurer Terms ─────────────────────────────────────────────────────────────

export interface InsurerTerms {
  id: string;
  policy_id: string;
  user_id: string;
  insurer_name: string;
  quoted_premium: number | null;
  premium_change: number | null;
  premium_change_pct: number | null;
  payment_terms: string | null;
  new_exclusions: string[];
  changed_conditions: string[];
  effective_date: string | null;
  expiry_date: string | null;
  raw_input_text: string | null;
  parsed_data: Record<string, unknown>;
  is_recommended: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Renewal Questionnaire ─────────────────────────────────────────────────────

export interface RenewalQuestionnaire {
  id: string;
  policy_id: string;
  user_id: string;
  token: string;
  status: "sent" | "responded" | "expired";
  sent_at: string;
  responded_at: string | null;
  expires_at: string;
  responses: Record<string, string> | null;
  ai_suggestions: QuestionnaireSuggestions | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export interface QuestionnaireSuggestions {
  suggested_updates: Array<{
    field: string;
    current_value: string | null;
    suggested_value: string;
    reason: string;
  }>;
  summary: string;
  risk_flags: string[];
}

// ── Extended policy detail ────────────────────────────────────────────────────

export interface PolicyDetailFull extends PolicyDetail {
  renewal_audit_log: AuditLogEntry[];
  insurer_terms: InsurerTerms[];
  renewal_questionnaires: RenewalQuestionnaire[];
}
