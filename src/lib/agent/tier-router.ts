/**
 * lib/agent/tier-router.ts
 *
 * Step 5: Routes a classified inbound signal to the correct tier.
 *
 * TIER 3 — Always escalate, halt sequence immediately
 *   Triggered by: hardcoded flag conditions OR always-escalate intents.
 *   Agent halts the sequence and notifies the broker with full context.
 *
 * TIER 2 — Draft, surface for broker approval
 *   Triggered by: third-party contact, confidence 0.60–0.84, novel intents.
 *   Agent drafts the next action and queues it for one-click broker approval.
 *
 * TIER 1 — Fully autonomous
 *   Requires: confidence ≥ 0.85, known autonomous intent, no Tier 3 flags.
 *   Agent acts, logs the action, moves on.
 *
 * The ALWAYS_ESCALATE_INTENTS list is immutable — it cannot be graduated
 * to Tier 1 through learning, regardless of confidence score.
 */

import type {
  TierDecision,
  RenewalFlags,
  ClassificationResult,
  BrokerNotification,
  ProposedAction,
} from "@/types/agent";
import { ALWAYS_BROKER_REVIEW_INTENTS, ALWAYS_ESCALATE_INTENTS, KNOWN_AUTONOMOUS_INTENTS } from "@/types/agent";
import {
  LEARNING_MODE_THRESHOLD,
  PREMIUM_INCREASE_TIER2_PCT,
  PREMIUM_INCREASE_TIER3_PCT,
} from "@/lib/agent/tier-constants";
import { getBrokerTrustLevel } from "@/lib/agent/broker-trust";

// Policy fields needed by the tier router (minimal shape)
export interface PolicyContext {
  id: string;
  client_name: string;
  policy_name: string;
  expiration_date: string;
  last_contact_at?: string | null;
}

// ── Tier 3 helpers ─────────────────────────────────────────────────────────────

function buildBrokerNotification(
  flagReason: string,
  policy: PolicyContext,
  rawSignal: string
): BrokerNotification {
  return {
    title: `${policy.client_name} — ${policy.policy_name}`,
    flag_reason: flagReason,
    policy_id: policy.id,
    client_name: policy.client_name,
    policy_name: policy.policy_name,
    expiry_date: policy.expiration_date,
    last_touchpoint_at: policy.last_contact_at ?? null,
    last_message_snippet: rawSignal.slice(0, 300),
    options: ["resume_sequence", "mark_handled", "call_client"],
  };
}

function makeTier3(
  reason: string,
  flags: RenewalFlags,
  classification: ClassificationResult,
  policy: PolicyContext,
  rawSignal: string
): TierDecision {
  return {
    tier: 3,
    reason,
    classification,
    flags,
    broker_notification: buildBrokerNotification(reason, policy, rawSignal),
  };
}

// ── Tier 2 helpers ─────────────────────────────────────────────────────────────

function buildProposedAction(intent: string, classification: ClassificationResult): ProposedAction {
  const actionMap: Record<string, { description: string; action_type: string }> = {
    confirm_renewal: {
      description: "Mark client as confirmed and advance campaign stage to 'confirmed'",
      action_type: "advance_stage",
    },
    renewal_with_changes: {
      description: "Client confirmed renewal but requested changes — update policy details before proceeding",
      action_type: "broker_change_required",
    },
    request_callback: {
      description: "Create broker callback task and pause the renewal sequence",
      action_type: "create_task_pause_sequence",
    },
    document_received: {
      description: "Log document receipt and update document chase status",
      action_type: "log_document",
    },
    questionnaire_submitted: {
      description: "Parse questionnaire submission and update the renewal record",
      action_type: "parse_questionnaire",
    },
    soft_query: {
      description: "Draft AI response to the client query and send automatically",
      action_type: "draft_and_send_response",
    },
    unverified_third_party: {
      description:
        "Draft verification email to the third-party contact to confirm identity and authority before proceeding",
      action_type: "send_verification_email",
    },
  };

  const mapped = actionMap[intent];
  return {
    description: mapped?.description ?? `Handle "${intent}" intent — ${classification.reasoning}`,
    action_type: mapped?.action_type ?? "advance_sequence",
    payload: {
      intent: classification.intent,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      ...(intent === "renewal_with_changes" && classification.changes_requested?.length
        ? { changes: classification.changes_requested }
        : {}),
    },
  };
}

function makeTier2(
  reason: string,
  flags: RenewalFlags,
  classification: ClassificationResult
): TierDecision {
  return {
    tier: 2,
    reason,
    classification,
    flags,
    proposed_action: buildProposedAction(classification.intent, classification),
  };
}

// ── Tier 1 helpers ─────────────────────────────────────────────────────────────

const AUTONOMOUS_ACTION_DESCRIPTIONS: Record<string, string> = {
  confirm_renewal: "Mark client as confirmed, advance campaign stage to 'confirmed'",
  request_callback: "Create broker callback task, pause renewal sequence",
  document_received: "Log document receipt, update document chase status",
  questionnaire_submitted: "Parse questionnaire submission, update renewal record",
  soft_query: "Draft AI response to client query, send automatically",
  out_of_office: "Log auto-reply detected, resume sequence after detected return date",
};

function makeTier1(
  flags: RenewalFlags,
  classification: ClassificationResult
): TierDecision {
  return {
    tier: 1,
    reason: `Autonomous: ${classification.intent} (confidence ${(classification.confidence * 100).toFixed(0)}%)`,
    classification,
    flags,
    autonomous_action:
      AUTONOMOUS_ACTION_DESCRIPTIONS[classification.intent] ??
      `Handle ${classification.intent}`,
  };
}

// ── Main router ────────────────────────────────────────────────────────────────

export async function routeTier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  flags: RenewalFlags,
  classification: ClassificationResult,
  policy: PolicyContext,
  rawSignal: string
): Promise<TierDecision> {
  // ── TIER 3: Hardcoded flag triggers ──────────────────────────────────────────
  // These checks are immutable. No amount of confidence can override them.

  if (flags.active_claim) {
    return makeTier3(
      `Active claim detected on ${policy.policy_name}. Renewal sequence halted. Review before proceeding.`,
      flags,
      classification,
      policy,
      rawSignal
    );
  }

  if (flags.insurer_declined) {
    return makeTier3(
      `Insurer has declined to quote on ${policy.policy_name}. Immediate action required.`,
      flags,
      classification,
      policy,
      rawSignal
    );
  }

  if (flags.premium_increase_pct !== null) {
    if (flags.premium_increase_pct > PREMIUM_INCREASE_TIER3_PCT) {
      return makeTier3(
        `Premium has increased ${flags.premium_increase_pct}% on ${policy.policy_name}. Exceeds ${PREMIUM_INCREASE_TIER3_PCT}% hard stop threshold.`,
        flags,
        classification,
        policy,
        rawSignal
      );
    }
    if (flags.premium_increase_pct >= PREMIUM_INCREASE_TIER2_PCT) {
      return makeTier2(
        `Premium increase of ${flags.premium_increase_pct}% on ${policy.policy_name} — in review band (${PREMIUM_INCREASE_TIER2_PCT}–${PREMIUM_INCREASE_TIER3_PCT}%). Broker review required.`,
        flags,
        classification
      );
    }
  }

  if (flags.business_restructure) {
    return makeTier3(
      `Client has indicated a business change on ${policy.policy_name}. Renewal cannot proceed without verification.`,
      flags,
      classification,
      policy,
      rawSignal
    );
  }

  // ── TIER 3: Always-escalate intent override list ──────────────────────────────
  // This list is immutable. Learning cannot graduate these to Tier 1.

  if (ALWAYS_ESCALATE_INTENTS.includes(classification.intent)) {
    return makeTier3(
      `Intent "${classification.intent}" is on the immutable escalation list for ${policy.policy_name}.`,
      flags,
      classification,
      policy,
      rawSignal
    );
  }

  // ── TIER 3: Silent client at 14-day expiry threshold ──────────────────────────

  if (flags.silent_client && flags.days_to_expiry <= 14) {
    return makeTier3(
      `No engagement from ${policy.client_name} across 3 touchpoints. Policy expires in ${flags.days_to_expiry} days. Manual intervention required.`,
      flags,
      classification,
      policy,
      rawSignal
    );
  }

  // ── TIER 2: Intents that always require broker action (not escalation) ───────
  // e.g. renewal_with_changes — client confirmed renewal but broker must update
  // policy details in the real world before the sequence can proceed.

  if (ALWAYS_BROKER_REVIEW_INTENTS.includes(classification.intent)) {
    return makeTier2(
      `Intent "${classification.intent}" requires broker to complete real-world tasks before proceeding`,
      flags,
      classification
    );
  }

  // ── TIER 2: Third-party contact ───────────────────────────────────────────────

  if (flags.third_party_contact) {
    return makeTier2(
      "Signal from unverified third-party contact — draft verification step requires broker approval",
      flags,
      classification
    );
  }

  // ── TIER 2: Novel intent (not in known taxonomy) ──────────────────────────────
  // Broker decision gets logged as a new intent example for the learning layer.

  const isKnownIntent = [
    ...(KNOWN_AUTONOMOUS_INTENTS as readonly string[]),
    ...ALWAYS_ESCALATE_INTENTS,
  ].includes(classification.intent);

  if (!isKnownIntent) {
    return makeTier2(
      `Novel intent "${classification.intent}" — not in known taxonomy, requires broker classification`,
      flags,
      classification
    );
  }

  // ── TIER 2: Confidence 0.60–0.84 ─────────────────────────────────────────────

  if (classification.confidence >= 0.6 && classification.confidence < 0.85) {
    return makeTier2(
      `Confidence ${(classification.confidence * 100).toFixed(0)}% — in broker review threshold (0.60–0.85)`,
      flags,
      classification
    );
  }

  // ── TIER 2: Below actionable confidence floor ─────────────────────────────────

  if (classification.confidence < 0.6) {
    return makeTier2(
      `Confidence ${(classification.confidence * 100).toFixed(0)}% — below actionable threshold, broker decision required`,
      flags,
      classification
    );
  }

  // ── Learning mode: hold Tier 1 candidates for broker review ──────────────────
  // A broker in learning mode must review even high-confidence autonomous actions
  // so the confidence baseline is built through real broker approvals.
  const { isLearning, approvedCount } = await getBrokerTrustLevel(supabase, userId);
  if (isLearning) {
    return makeTier2(
      `Learning mode — ${approvedCount}/${LEARNING_MODE_THRESHOLD} approvals recorded. Autonomous action held for broker confirmation until confidence baseline is established.`,
      flags,
      classification
    );
  }

  // ── TIER 1: Fully autonomous ──────────────────────────────────────────────────
  // Confidence ≥ 0.85, known autonomous intent, no blocking flags.

  return makeTier1(flags, classification);
}
