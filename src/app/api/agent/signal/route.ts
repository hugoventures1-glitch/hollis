/**
 * POST /api/agent/signal
 *
 * Step 2 stub: manually submit an inbound signal for testing the agent tier system.
 * In production this endpoint will be replaced (or supplemented) by a Resend
 * inbound email webhook. The table schema and pipeline are identical — only the
 * signal ingestion source changes.
 *
 * Pipeline (Steps 2–6 wired together):
 *   1. Validate input, assert policy ownership
 *   2. Write inbound_signals record (source='manual')
 *   3. Fetch recent broker-approved parser_outcomes for few-shot injection
 *   4. Classify intent via Claude (intent-classifier)
 *   5. Merge flags from classification + existing policy state (flag-writer)
 *   6. Write updated renewal_flags to policies table
 *   7. Route to Tier 1 / 2 / 3 (tier-router)
 *   8. Write audit log entry
 *   9. For Tier 2: insert approval_queue record
 *  10. For Tier 3: send broker alert email (Step 6)
 *  11. Mark signal as processed
 *
 * Returns: { signal_id, classification, flags, tier_decision }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyIntent } from "@/lib/agent/intent-classifier";
import { buildFlagsFromClassification, writeFlagsToPolicy, getCurrentFlags } from "@/lib/agent/flag-writer";
import { routeTier } from "@/lib/agent/tier-router";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainStandard, retainLongTerm } from "@/lib/logAction";
import { notifyBrokerTier3 } from "@/lib/agent/broker-notifier";
import type { AuditEventType } from "@/types/renewals";
import type { ParserOutcome } from "@/types/agent";

const RequestSchema = z.object({
  policy_id: z.string().uuid("policy_id must be a valid UUID"),
  raw_signal: z.string().min(1, "Signal cannot be empty").max(10_000, "Signal too long"),
  sender_email: z.string().email("sender_email must be a valid email").optional(),
  sender_name: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // ── Parse + validate request body ───────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { policy_id, raw_signal, sender_email, sender_name } = parsed.data;

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch policy (enforces RLS — user must own this policy) ──────────────────
    const { data: policy, error: policyError } = await supabase
      .from("policies")
      .select("id, client_name, policy_name, expiration_date, last_contact_at, renewal_flags, renewal_paused")
      .eq("id", policy_id)
      .single();

    if (policyError || !policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    // Admin client for operations that bypass RLS (flag writes, audit log)
    const admin = createAdminClient();

    // ── 2. Write inbound_signals record ─────────────────────────────────────────
    const { data: signal, error: signalError } = await supabase
      .from("inbound_signals")
      .insert({
        policy_id,
        user_id: user.id,
        raw_signal,
        sender_email: sender_email ?? null,
        sender_name: sender_name ?? null,
        source: "manual",
      })
      .select("id")
      .single();

    if (signalError || !signal) {
      console.error("[agent/signal] Failed to write inbound_signals:", signalError?.message);
      return NextResponse.json({ error: "Failed to record signal" }, { status: 500 });
    }

    // ── 3. Fetch recent broker-approved parser_outcomes for few-shot injection ───
    const { data: recentOutcomes } = await supabase
      .from("parser_outcomes")
      .select("*")
      .eq("user_id", user.id)
      .in("broker_action", ["approved", "edited"])
      .order("created_at", { ascending: false })
      .limit(10);

    // ── 4. Classify intent ───────────────────────────────────────────────────────
    let classification;
    try {
      classification = await classifyIntent(
        raw_signal,
        (recentOutcomes as ParserOutcome[]) ?? []
      );
    } catch (classifyErr) {
      console.error("[agent/signal] Intent classification failed:", classifyErr);
      return NextResponse.json({ error: "Intent classification failed" }, { status: 500 });
    }

    // ── 5–6. Build flags + write to policy ──────────────────────────────────────
    const currentFlags = await getCurrentFlags(admin, policy_id);
    const updatedFlags = buildFlagsFromClassification(
      currentFlags,
      classification,
      policy.expiration_date as string
    );

    await writeFlagsToPolicy(admin, policy_id, updatedFlags);

    // ── 7. Route to tier ─────────────────────────────────────────────────────────
    const tierDecision = routeTier(
      updatedFlags,
      classification,
      {
        id: policy.id as string,
        client_name: policy.client_name as string,
        policy_name: policy.policy_name as string,
        expiration_date: policy.expiration_date as string,
        last_contact_at: policy.last_contact_at as string | null,
      },
      raw_signal
    );

    // ── 8. Write audit log ───────────────────────────────────────────────────────
    const auditEventMap: Record<1 | 2 | 3, AuditEventType> = {
      1: "tier_1_action",
      2: "tier_2_drafted",
      3: "tier_3_escalated",
    };

    await writeAuditLog({
      supabase: admin,
      policy_id,
      user_id: user.id,
      event_type: auditEventMap[tierDecision.tier],
      channel: "internal",
      content_snapshot: raw_signal.slice(0, 1000),
      metadata: {
        signal_id: signal.id,
        intent: classification.intent,
        confidence: classification.confidence,
        flags_detected: classification.flags_detected,
        premium_increase_pct: classification.premium_increase_pct,
        tier: tierDecision.tier,
        reason: tierDecision.reason,
        reasoning: classification.reasoning,
        ...(tierDecision.tier === 3 && {
          broker_notification: tierDecision.broker_notification,
        }),
      },
      actor_type: "system",
    });

    // ── 9. Tier 2: write to approval_queue ───────────────────────────────────────
    if (tierDecision.tier === 2 && tierDecision.proposed_action) {
      const { data: queueItem, error: queueError } = await supabase
        .from("approval_queue")
        .insert({
          policy_id,
          user_id: user.id,
          signal_id: signal.id,
          classified_intent: classification.intent,
          confidence_score: classification.confidence,
          raw_signal_snippet: raw_signal.slice(0, 500),
          proposed_action: tierDecision.proposed_action,
          status: "pending",
        })
        .select("id")
        .single();

      if (queueError) {
        console.error("[agent/signal] Failed to write approval_queue:", queueError.message);
        // Non-fatal — continue; audit log already written
      } else if (queueItem) {
        tierDecision.approval_queue_id = queueItem.id as string;
      }

      void logAction({
        broker_id: user.id,
        policy_id,
        action_type: "approval_queued",
        tier: "2",
        trigger_reason: `Inbound signal from ${sender_name ?? sender_email ?? "client"} classified as "${classification.intent}" (confidence ${Math.round(classification.confidence * 100)}%) — queued for broker review before action.`,
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

    // Also log the intent classification itself (all tiers)
    void logAction({
      broker_id: user.id,
      policy_id,
      action_type: "renewal_intent_classified",
      tier: String(tierDecision.tier),
      trigger_reason: `Inbound signal from ${sender_name ?? sender_email ?? "client"} classified as "${classification.intent}" with ${Math.round(classification.confidence * 100)}% confidence — routed to Tier ${tierDecision.tier}.`,
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
      },
      outcome: "classified",
      retain_until: tierDecision.tier === 3 ? retainLongTerm() : retainStandard(),
    });

    // ── 10. Tier 3: send broker alert email ─────────────────────────────────────
    if (tierDecision.tier === 3) {
      // Fire-and-forget — a notification failure must not block the response
      notifyBrokerTier3(admin, user.id, policy_id, tierDecision).catch((err) =>
        console.error("[agent/signal] Broker notification failed:", err instanceof Error ? err.message : err)
      );

      void logAction({
        broker_id: user.id,
        policy_id,
        action_type: "escalation",
        tier: "3",
        trigger_reason: `Signal from ${sender_name ?? sender_email ?? "client"} triggered Tier 3 hard escalation — ${tierDecision.reason}`,
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

    // ── 11. Mark signal as processed ────────────────────────────────────────────
    await supabase
      .from("inbound_signals")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        classification_result: classification,
      })
      .eq("id", signal.id);

    // Return the full pipeline result
    return NextResponse.json({
      signal_id: signal.id,
      classification,
      flags: updatedFlags,
      tier_decision: tierDecision,
    });
  } catch (err) {
    console.error("[agent/signal] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
