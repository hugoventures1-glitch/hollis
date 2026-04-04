/**
 * types/agent.ts
 *
 * Shared types for the Hollis Agent Tier System.
 *
 * The tier system is a decision gate that sits between the cron job firing
 * and the action being taken. It reads inbound signals, classifies intent,
 * writes renewal flags, and routes to the appropriate tier.
 */

// ── Renewal Flags ──────────────────────────────────────────────────────────────
// Set by: inbound parser, manual broker input, or cron job.
// Stored as JSONB in policies.renewal_flags.

export type RenewalFlags = {
  active_claim: boolean;
  insurer_declined: boolean;
  premium_increase_pct: number | null;  // e.g. 42 = 42% increase; null = not detected
  business_restructure: boolean;
  third_party_contact: boolean;         // reply came from non-policy contact
  silent_client: boolean;               // no engagement within threshold (set by cron)
  days_to_expiry: number;               // computed at runtime, not persisted in JSONB
};

export const DEFAULT_RENEWAL_FLAGS: RenewalFlags = {
  active_claim: false,
  insurer_declined: false,
  premium_increase_pct: null,
  business_restructure: false,
  third_party_contact: false,
  silent_client: false,
  days_to_expiry: 0,
};

// ── Intent Taxonomy ────────────────────────────────────────────────────────────

// Intents the agent can act on autonomously (Tier 1)
export const KNOWN_AUTONOMOUS_INTENTS = [
  "confirm_renewal",
  "request_callback",
  "document_received",
  "questionnaire_submitted",
  "soft_query",
  "out_of_office",
] as const;

export type AutonomousIntent = (typeof KNOWN_AUTONOMOUS_INTENTS)[number];

// Intents that always require Tier 2 broker action (not escalation).
// The broker must complete a real-world task before the renewal can proceed.
// Learning cannot graduate these to Tier 1.
export const ALWAYS_BROKER_REVIEW_INTENTS: string[] = [
  "renewal_with_changes",
];

// Intents that ALWAYS escalate to Tier 3, regardless of confidence score.
// This list is immutable — learning cannot graduate these to Tier 1.
export const ALWAYS_ESCALATE_INTENTS: string[] = [
  "active_claim_mentioned",
  "insurer_declined",
  "premium_increase_major",
  "business_restructure",
  "cancel_policy",
  "legal_dispute_mentioned",
  "unverified_third_party",
];

// Full set of known intents (autonomous + broker-review + escalate)
export const ALL_KNOWN_INTENTS: string[] = [
  ...(KNOWN_AUTONOMOUS_INTENTS as readonly string[]),
  ...ALWAYS_BROKER_REVIEW_INTENTS,
  ...ALWAYS_ESCALATE_INTENTS,
];

// ── Intent Classification ──────────────────────────────────────────────────────

export interface ClassificationResult {
  intent: string;
  confidence: number;             // 0.000 to 1.000
  flags_detected: string[];       // flag names detected in the signal
  premium_increase_pct: number | null;  // extracted value if a premium increase was detected
  reasoning: string;              // brief explanation for audit trail
  changes_requested?: string[];   // populated when intent is renewal_with_changes
}

// ── Inbound Signals ────────────────────────────────────────────────────────────

export interface InboundSignal {
  id: string;
  policy_id: string;
  user_id: string;
  raw_signal: string;
  sender_email: string | null;
  sender_name: string | null;
  source: "manual" | "email" | "sms";
  processed: boolean;
  processed_at: string | null;
  classification_result: ClassificationResult | null;
  created_at: string;
}

// ── Parser Outcomes (Learning Layer) ──────────────────────────────────────────
// Every Tier 2 broker resolution writes here.
// Top 10 broker-approved outcomes are injected as few-shot examples into
// the classifier prompt at Step 8.

export interface ParserOutcome {
  id: string;
  renewal_id: string | null;
  signal_id: string | null;
  user_id: string;
  raw_signal: string;
  classified_intent: string;
  confidence_score: number;
  broker_action: "approved" | "rejected" | "edited" | null;
  final_intent: string | null;
  created_at: string;
}

// ── Approval Queue (Tier 2) ────────────────────────────────────────────────────

export interface ProposedAction {
  description: string;                    // human-readable summary for the broker
  action_type: string;                    // e.g. 'advance_stage', 'send_email', 'create_task'
  payload: Record<string, unknown>;
}

export interface BrokerDecision {
  action: "approved" | "rejected" | "edited";
  edited_intent?: string;
  notes?: string;
}

export interface ApprovalQueueItem {
  id: string;
  policy_id: string;
  user_id: string;
  signal_id: string | null;
  classified_intent: string;
  confidence_score: number;
  raw_signal_snippet: string;
  proposed_action: ProposedAction;
  status: "pending" | "approved" | "rejected" | "edited";
  broker_decision: BrokerDecision | null;
  resolved_at: string | null;
  created_at: string;
}

// ── Tier Routing ───────────────────────────────────────────────────────────────

export type TierLevel = 1 | 2 | 3;

export interface BrokerNotification {
  title: string;
  flag_reason: string;
  policy_id: string;
  client_name: string;
  policy_name: string;
  expiry_date: string;
  last_touchpoint_at: string | null;
  last_message_snippet: string;
  options: ("resume_sequence" | "mark_handled" | "call_client")[];
}

export interface TierDecision {
  tier: TierLevel;
  reason: string;
  classification: ClassificationResult;
  flags: RenewalFlags;
  // Tier 3
  broker_notification?: BrokerNotification;
  // Tier 2
  approval_queue_id?: string;
  proposed_action?: ProposedAction;
  // Tier 1
  autonomous_action?: string;
}
