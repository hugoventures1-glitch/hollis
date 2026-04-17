/**
 * lib/agent/process-signal.ts
 *
 * Shared inbound signal pipeline (steps 2–11).
 * Called by both the manual /api/agent/signal route (authenticated broker)
 * and the Resend inbound email webhook (no session — admin client only).
 *
 * Callers are responsible for:
 *   - Verifying ownership before calling (RLS check or HMAC + email lookup)
 *   - Fetching parser_outcomes scoped to the correct user_id
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyIntent } from "@/lib/agent/intent-classifier";
import { buildFlagsFromClassification, writeFlagsToPolicy, getCurrentFlags } from "@/lib/agent/flag-writer";
import { routeTier } from "@/lib/agent/tier-router";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainStandard, retainLongTerm } from "@/lib/logAction";
import { notifyBrokerTier3 } from "@/lib/agent/broker-notifier";
import { getResendClient } from "@/lib/resend/client";
import type { AuditEventType, Policy } from "@/types/renewals";
import type { ParserOutcome, ClassificationResult, RenewalFlags, TierDecision } from "@/types/agent";

export interface ProcessSignalParams {
  /** Service-role admin client — bypasses RLS. Caller must verify ownership before calling. */
  admin: SupabaseClient;
  /** Broker's auth.users id — policy owner */
  userId: string;
  policyId: string;
  policy: Pick<
    Policy,
    | "id"
    | "client_name"
    | "policy_name"
    | "expiration_date"
    | "last_contact_at"
    | "renewal_flags"
    | "renewal_paused"
    | "client_email"
    | "carrier"
    | "premium"
    | "agent_name"
    | "agent_email"
  >;
  rawSignal: string;
  senderEmail: string | null;
  senderName: string | null;
  source: "manual" | "email" | "sms";
  /** Top 10 broker-approved parser_outcomes — caller fetches these scoped to userId */
  recentOutcomes: ParserOutcome[];
}

export interface ProcessSignalResult {
  signal_id: string;
  classification: ClassificationResult;
  flags: RenewalFlags;
  tier_decision: TierDecision;
}

export async function processInboundSignal(
  params: ProcessSignalParams
): Promise<ProcessSignalResult> {
  const {
    admin,
    userId,
    policyId,
    policy,
    rawSignal,
    senderEmail,
    senderName,
    source,
    recentOutcomes,
  } = params;

  // ── 2. Write inbound_signals record ───────────────────────────────────────────
  const { data: signal, error: signalError } = await admin
    .from("inbound_signals")
    .insert({
      policy_id: policyId,
      user_id: userId,
      raw_signal: rawSignal,
      sender_email: senderEmail,
      sender_name: senderName,
      source,
    })
    .select("id")
    .single();

  if (signalError || !signal) {
    throw new Error(
      `[process-signal] Failed to write inbound_signals: ${signalError?.message ?? "unknown error"}`
    );
  }

  // ── 3. Few-shot outcomes passed in by caller ───────────────────────────────────
  // (recentOutcomes already fetched and scoped to userId)

  // ── 4. Classify intent ─────────────────────────────────────────────────────────
  const classification = await classifyIntent(rawSignal, recentOutcomes);

  // ── 5–6. Build flags + write to policy ────────────────────────────────────────
  const currentFlags = await getCurrentFlags(admin, policyId);
  const updatedFlags = buildFlagsFromClassification(
    currentFlags,
    classification,
    policy.expiration_date as string
  );

  await writeFlagsToPolicy(admin, policyId, updatedFlags);

  // ── 7. Route to tier ───────────────────────────────────────────────────────────
  const tierDecision = await routeTier(
    admin,
    userId,
    updatedFlags,
    classification,
    {
      id: policy.id as string,
      client_name: policy.client_name as string,
      policy_name: policy.policy_name as string,
      expiration_date: policy.expiration_date as string,
      last_contact_at: policy.last_contact_at as string | null,
    },
    rawSignal
  );

  // ── 8. Write audit log ─────────────────────────────────────────────────────────
  const auditEventMap: Record<1 | 2 | 3, AuditEventType> = {
    1: "tier_1_action",
    2: "tier_2_drafted",
    3: "tier_3_escalated",
  };

  await writeAuditLog({
    supabase: admin,
    policy_id: policyId,
    user_id: userId,
    event_type: auditEventMap[tierDecision.tier],
    channel: "internal",
    content_snapshot: rawSignal.slice(0, 1000),
    metadata: {
      signal_id: signal.id,
      intent: classification.intent,
      confidence: classification.confidence,
      flags_detected: classification.flags_detected,
      premium_increase_pct: classification.premium_increase_pct,
      tier: tierDecision.tier,
      reason: tierDecision.reason,
      reasoning: classification.reasoning,
      source,
      ...(tierDecision.tier === 3 && {
        broker_notification: tierDecision.broker_notification,
      }),
    },
    actor_type: "system",
  });

  // ── Fetch agent profile ────────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from("agent_profiles")
    .select("email_from_name, email, standing_orders")
    .eq("user_id", userId)
    .maybeSingle();

  // Resolve recipient — prefer the inbound sender, fall back to policy client_email
  const recipientEmail = senderEmail ?? (policy.client_email as string | null) ?? null;

  // ── 9. Tier 1: execute autonomous actions ──────────────────────────────────────
  if (tierDecision.tier === 1) {
    const intent = classification.intent;

    if (intent === "out_of_office" || intent === "questionnaire_submitted") {
      // Log only — no outbound email for these intents
      if (intent === "out_of_office") {
        const resumeDate = new Date();
        resumeDate.setDate(resumeDate.getDate() + 7);
        await admin
          .from("policies")
          .update({
            renewal_paused: true,
            renewal_paused_until: resumeDate.toISOString().slice(0, 10),
          })
          .eq("id", policyId);
      }

      void logAction({
        broker_id: userId,
        policy_id: policyId,
        action_type: intent === "out_of_office" ? "out_of_office_logged" : "questionnaire_logged",
        tier: "1",
        trigger_reason:
          intent === "out_of_office"
            ? `Auto-reply detected from ${senderName ?? senderEmail ?? "client"} — sequence paused for 7 days.`
            : `Client ${senderName ?? senderEmail ?? "unknown"} indicated questionnaire submission.`,
        payload: { raw_signal_snippet: rawSignal.slice(0, 500) },
        metadata: { signal_id: signal.id, intent, confidence: classification.confidence },
        outcome: "classified",
        retain_until: retainStandard(),
      });
    } else if (
      ["soft_query", "confirm_renewal", "request_callback", "document_received"].includes(intent)
    ) {
      if (!recipientEmail) {
        console.warn(
          `[process-signal] Tier 1 intent "${intent}" — no recipient email, skipping send.`
        );
        void logAction({
          broker_id: userId,
          policy_id: policyId,
          action_type: "tier1_no_recipient",
          tier: "1",
          trigger_reason: `Tier 1 intent "${intent}" could not execute — no sender_email or client_email available.`,
          metadata: { signal_id: signal.id, intent },
          outcome: "failed",
          retain_until: retainStandard(),
        });
      } else {
        try {
          const baseFrom = process.env.FROM_EMAIL ?? "";
          const from = profile?.email_from_name
            ? `${profile.email_from_name} <${baseFrom}>`
            : baseFrom;
          const resend = getResendClient();

          let draft: { subject: string; body: string };
          if (intent === "soft_query") {
            const { generateQueryResponse } = await import("@/lib/agent/responder");
            draft = await generateQueryResponse(rawSignal, policy as Policy, {
              standingOrders:
                (profile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
              clientNotes: null,
            });
          } else {
            const { generateAckEmail } = await import("@/lib/agent/responder");
            draft = await generateAckEmail(
              intent as "confirm_renewal" | "request_callback" | "document_received",
              policy as Policy,
              {
                standingOrders:
                  (profile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
                clientNotes: null,
              }
            );
          }

          const { data: sent } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: draft.subject,
            text: draft.body,
            replyTo: process.env.INBOUND_EMAIL ?? (profile as { email?: string | null } | null)?.email ?? undefined,
          });

          // Intent-specific side effects
          if (intent === "confirm_renewal") {
            await admin
              .from("policies")
              .update({
                campaign_stage: "confirmed",
                client_confirmed_at: new Date().toISOString(),
                last_contact_at: new Date().toISOString().slice(0, 10),
              })
              .eq("id", policyId);
          } else if (intent === "request_callback") {
            await admin.from("policies").update({ renewal_paused: true }).eq("id", policyId);
          }

          void logAction({
            broker_id: userId,
            policy_id: policyId,
            action_type:
              intent === "soft_query" ? "tier1_reply_sent" : `tier1_ack_sent_${intent}`,
            tier: "1",
            trigger_reason:
              intent === "soft_query"
                ? `Tier 1 autonomous reply sent to ${recipientEmail} in response to soft_query.`
                : `Tier 1 acknowledgment sent to ${recipientEmail} for intent "${intent}".`,
            payload: {
              subject: draft.subject,
              body: draft.body,
              recipient: recipientEmail,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            metadata: { signal_id: signal.id, intent, confidence: classification.confidence },
            outcome: "sent",
            retain_until: retainStandard(),
          });
        } catch (execErr) {
          console.error(
            `[process-signal] Tier 1 "${intent}" execution failed:`,
            execErr instanceof Error ? execErr.message : execErr
          );
        }
      }
    }
  }

  // ── document_received: close open doc-chase requests ──────────────────────────
  // Runs regardless of whether an ack email was sent (no recipient gate).
  // The DB trigger mark_document_received() cascades to cancel pending
  // doc_chase_messages and complete the doc_chase_sequences record.
  if (tierDecision.tier === 1 && classification.intent === "document_received") {
    const receivedAt = new Date().toISOString();
    // Close doc chases linked to this policy
    await admin
      .from("doc_chase_requests")
      .update({ status: "received", received_at: receivedAt })
      .eq("policy_id", policyId)
      .neq("status", "received");
    // Also close standalone doc chases (no policy_id) for this sender
    if (senderEmail) {
      await admin
        .from("doc_chase_requests")
        .update({ status: "received", received_at: receivedAt })
        .eq("client_email", senderEmail)
        .is("policy_id", null)
        .neq("status", "received");
    }
  }

  // ── 10. Tier 2: write to approval_queue ────────────────────────────────────────
  if (tierDecision.tier === 2 && tierDecision.proposed_action) {
    // Pre-generate a reply draft for soft_query signals so the broker sees
    // a ready-to-approve response in the inbox.
    if (
      classification.intent === "soft_query" &&
      tierDecision.proposed_action.action_type === "draft_and_send_response" &&
      recipientEmail
    ) {
      try {
        const { generateQueryResponse } = await import("@/lib/agent/responder");
        const draft = await generateQueryResponse(rawSignal, policy as Policy, {
          standingOrders:
            (profile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
          clientNotes: null,
        });
        tierDecision.proposed_action.payload = {
          ...tierDecision.proposed_action.payload,
          subject: draft.subject,
          body: draft.body,
          recipient_email: recipientEmail,
        };
      } catch (draftErr) {
        console.error(
          "[process-signal] Failed to pre-generate Tier 2 draft:",
          draftErr instanceof Error ? draftErr.message : draftErr
        );
      }
    }

    const { data: queueItem, error: queueError } = await admin
      .from("approval_queue")
      .insert({
        policy_id: policyId,
        user_id: userId,
        signal_id: signal.id,
        classified_intent: classification.intent,
        confidence_score: classification.confidence,
        raw_signal_snippet: rawSignal.slice(0, 500),
        proposed_action: tierDecision.proposed_action,
        status: "pending",
      })
      .select("id")
      .single();

    if (queueError) {
      console.error("[process-signal] Failed to write approval_queue:", queueError.message);
    } else if (queueItem) {
      tierDecision.approval_queue_id = queueItem.id as string;
    }

    void logAction({
      broker_id: userId,
      policy_id: policyId,
      action_type: "approval_queued",
      tier: "2",
      trigger_reason: `Inbound signal from ${senderName ?? senderEmail ?? "client"} classified as "${classification.intent}" (confidence ${Math.round(classification.confidence * 100)}%) — queued for broker review before action.`,
      payload: {
        intent_classification: classification.intent,
        confidence_score: classification.confidence,
        channel: "internal",
        escalation_reason: tierDecision.reason,
      },
      metadata: {
        signal_id: signal.id,
        flags_detected: classification.flags_detected,
        premium_increase_pct: classification.premium_increase_pct ?? null,
        reasoning: classification.reasoning,
        approval_queue_id: tierDecision.approval_queue_id ?? null,
      },
      outcome: "queued",
      retain_until: retainLongTerm(),
    });
  }

  // Log the intent classification itself (all tiers)
  void logAction({
    broker_id: userId,
    policy_id: policyId,
    action_type: "renewal_intent_classified",
    tier: String(tierDecision.tier),
    trigger_reason: `Inbound signal from ${senderName ?? senderEmail ?? "client"} classified as "${classification.intent}" with ${Math.round(classification.confidence * 100)}% confidence — routed to Tier ${tierDecision.tier}.`,
    payload: {
      intent_classification: classification.intent,
      confidence_score: classification.confidence,
      channel: "internal",
    },
    metadata: {
      signal_id: signal.id,
      flags_detected: classification.flags_detected,
      premium_increase_pct: classification.premium_increase_pct ?? null,
      reasoning: classification.reasoning,
      tier_reason: tierDecision.reason,
      source,
    },
    outcome: "classified",
    retain_until: tierDecision.tier === 3 ? retainLongTerm() : retainStandard(),
  });

  // ── 11. Tier 3: send broker alert email ────────────────────────────────────────
  if (tierDecision.tier === 3) {
    notifyBrokerTier3(admin, userId, policyId, tierDecision).catch((err) =>
      console.error(
        "[process-signal] Broker notification failed:",
        err instanceof Error ? err.message : err
      )
    );

    void logAction({
      broker_id: userId,
      policy_id: policyId,
      action_type: "escalation",
      tier: "3",
      trigger_reason: `Signal from ${senderName ?? senderEmail ?? "client"} triggered Tier 3 hard escalation — ${tierDecision.reason}`,
      payload: {
        intent_classification: classification.intent,
        confidence_score: classification.confidence,
        channel: "internal",
        escalation_reason: tierDecision.reason,
      },
      metadata: {
        signal_id: signal.id,
        flags_detected: classification.flags_detected,
        premium_increase_pct: classification.premium_increase_pct ?? null,
        reasoning: classification.reasoning,
      },
      outcome: "escalated",
      retain_until: retainLongTerm(),
    });
  }

  // ── Mark signal as processed ───────────────────────────────────────────────────
  await admin
    .from("inbound_signals")
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      classification_result: classification,
    })
    .eq("id", signal.id);

  return {
    signal_id: signal.id as string,
    classification,
    flags: updatedFlags,
    tier_decision: tierDecision,
  };
}
