/**
 * GET /api/cron/silence-check
 *
 * Step 9: Silence detection cron — runs daily at 7 AM UTC (before final-notice at 8 AM).
 * Protected by CRON_SECRET header. Uses service role (bypasses RLS).
 *
 * Rule from spec:
 *   If a client has received touchpoints at 90, 60, and 30 days with ZERO engagement
 *   (no open, no reply, no form submission), the system escalates at 14 days before expiry.
 *
 * At 14-day threshold:
 *   - Sequence halts (renewal_paused = true with renewal_paused_until = expiration_date)
 *   - silent_client flag set to true in renewal_flags
 *   - Broker notified by email
 *   - Surfaced as priority case (visible in /review with flag context)
 *   - Written to renewal_audit_log
 *
 * Before the 14-day threshold:
 *   - Sequence continues as normal. This cron does nothing.
 *
 * Silence is defined as: policy has received at least the 90-day and 60-day touchpoints
 * (email_sent audit events or campaign_touchpoints with status=sent) and has NO
 * inbound_signals recorded (no client reply at any channel).
 *
 * Step 10 — Audit: every silent-client flag set is written to renewal_audit_log.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysUntilExpiry } from "@/types/renewals";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainLongTerm } from "@/lib/logAction";
import { notifyBrokerTier3 } from "@/lib/agent/broker-notifier";
import { routeTier } from "@/lib/agent/tier-router";
import { DEFAULT_RENEWAL_FLAGS } from "@/types/agent";
import type { Policy } from "@/types/renewals";
import type { RenewalFlags } from "@/types/agent";

// Minimum touchpoints a client must have received before silence is actionable
const REQUIRED_TOUCHPOINT_TYPES = ["email_90", "email_60", "sms_30"] as const;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Open a durable run record
  const { data: runRow } = await supabase
    .from("cron_job_runs")
    .insert({ job_name: "silence-check", status: "running" })
    .select("id")
    .single();
  const runId: string | null = runRow?.id ?? null;

  // Fetch all active, non-paused, non-terminal policies
  const { data: policies, error: policiesError } = await supabase
    .from("policies")
    .select("*")
    .eq("status", "active")
    .eq("renewal_paused", false)
    .is("client_confirmed_at", null)
    .not("campaign_stage", "in", '("confirmed","lapsed","final_notice_sent","complete")');

  if (policiesError) {
    console.error("[cron/silence-check] Failed to fetch policies:", policiesError.message);
    if (runId) {
      await supabase
        .from("cron_job_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_summary: policiesError.message,
        })
        .eq("id", runId);
    }
    return NextResponse.json({ error: policiesError.message }, { status: 500 });
  }

  const results = {
    processed: 0,
    flagged: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const policy of policies as Policy[]) {
    results.processed++;

    const days = daysUntilExpiry(policy.expiration_date);

    // Only check policies at or under 14 days — before this, let the normal sequence run
    if (days > 14 || days <= 0) {
      results.skipped++;
      continue;
    }

    // Check if silent_client is already set (avoid re-notifying)
    const existingFlags = (policy.renewal_flags as RenewalFlags | null) ?? DEFAULT_RENEWAL_FLAGS;
    if (existingFlags.silent_client) {
      results.skipped++;
      continue;
    }

    // ── Check for required outbound touchpoints ───────────────────────────────
    // The client must have received at least the 90d, 60d, and 30d touches
    // for silence to be meaningful (otherwise it's just early)
    const { data: sentTouchpoints } = await supabase
      .from("campaign_touchpoints")
      .select("type")
      .eq("policy_id", policy.id)
      .eq("status", "sent")
      .in("type", [...REQUIRED_TOUCHPOINT_TYPES]);

    const sentTypes = new Set((sentTouchpoints ?? []).map((t: { type: string }) => t.type));
    const hasAllRequired = REQUIRED_TOUCHPOINT_TYPES.every((t) => sentTypes.has(t));

    if (!hasAllRequired) {
      // Client hasn't received all 3 touchpoints yet — not silently ignoring, just hasn't reached that point
      results.skipped++;
      continue;
    }

    // ── Check for any inbound signal (reply, engagement) ─────────────────────
    const { count: signalCount } = await supabase
      .from("inbound_signals")
      .select("id", { count: "exact", head: true })
      .eq("policy_id", policy.id);

    if ((signalCount ?? 0) > 0) {
      // Client has engaged — not silent
      results.skipped++;
      continue;
    }

    // ── Client is silent at ≤14 days — take action ───────────────────────────

    // 1. Set silent_client flag + update days_to_expiry
    const updatedFlags: RenewalFlags = {
      ...existingFlags,
      silent_client: true,
      days_to_expiry: days,
    };

    // Strip runtime-only field before persisting
    const { days_to_expiry: _omit, ...persistedFlags } = updatedFlags;
    void _omit;

    await supabase
      .from("policies")
      .update({ renewal_flags: persistedFlags })
      .eq("id", policy.id);

    // 2. Halt the renewal sequence by setting renewal_paused + pause until expiry
    await supabase
      .from("policies")
      .update({
        renewal_paused: true,
        renewal_paused_until: policy.expiration_date,
        renewal_manual_override: `[AGENT] Sequence halted — no client engagement across 3 touchpoints at ${days} days to expiry.`,
      })
      .eq("id", policy.id);

    // 3. Write audit log (Step 10)
    await writeAuditLog({
      supabase,
      policy_id: policy.id,
      user_id: policy.user_id,
      event_type: "tier_3_escalated",
      channel: "internal",
      metadata: {
        reason: "silent_client",
        days_to_expiry: days,
        touchpoints_sent: [...sentTypes],
        flag_set: "silent_client",
        sequence_halted: true,
      },
      actor_type: "system",
    });

    await writeAuditLog({
      supabase,
      policy_id: policy.id,
      user_id: policy.user_id,
      event_type: "sequence_halted",
      channel: "internal",
      content_snapshot: `Sequence halted — no engagement from ${policy.client_name} across 3 touchpoints. Policy expires in ${days} days.`,
      metadata: { days_to_expiry: days },
      actor_type: "system",
    });

    // 4. Log to hollis_actions (fire-and-forget)
    void logAction({
      broker_id: policy.user_id,
      policy_id: policy.id,
      action_type: "silence_detected",
      tier: "3",
      trigger_reason: `No client engagement from ${policy.client_name} across 3 touchpoints (90d, 60d, 30d) with ${days} day${days !== 1 ? "s" : ""} to expiry — sequence halted and broker escalation triggered.`,
      payload: {
        channel: "internal",
        escalation_reason: `Silent client at ${days} days to expiry — zero inbound signals after 3 outbound touchpoints.`,
      },
      metadata: {
        days_to_expiry: days,
        touchpoints_sent: [...sentTypes],
        expiration_date: policy.expiration_date,
        flag_set: "silent_client",
        sequence_halted: true,
      },
      outcome: "escalated",
      retain_until: retainLongTerm(),
    });
    void logAction({
      broker_id: policy.user_id,
      policy_id: policy.id,
      action_type: "renewal_halted",
      tier: "3",
      trigger_reason: `Renewal sequence for ${policy.client_name} halted — silent client rule triggered at ${days} days to expiry.`,
      payload: { channel: "internal" },
      metadata: {
        days_to_expiry: days,
        expiration_date: policy.expiration_date,
        halt_reason: "silent_client",
      },
      outcome: "halted",
      retain_until: retainLongTerm(),
    });

    // 5. Send broker alert email via Tier 3 notification path
    const silenceDecision = routeTier(
      updatedFlags,
      {
        intent: "silence_detected",
        confidence: 1.0,
        flags_detected: ["silent_client"],
        premium_increase_pct: null,
        reasoning: `No client engagement across 3 touchpoints with ${days} days to expiry.`,
      },
      {
        id: policy.id,
        client_name: policy.client_name,
        policy_name: policy.policy_name,
        expiration_date: policy.expiration_date,
        last_contact_at: policy.last_contact_at ?? null,
      },
      `No engagement from ${policy.client_name} across 3 touchpoints. Policy expires in ${days} days.`
    );

    await notifyBrokerTier3(supabase, policy.user_id, policy.id, silenceDecision).catch(
      (err) =>
        console.error(
          "[cron/silence-check] Broker notification failed for policy",
          policy.id,
          err instanceof Error ? err.message : err
        )
    );

    results.flagged++;
    console.log(
      `[cron/silence-check] Silent client flagged: ${policy.client_name} (${policy.id}), ${days} days to expiry`
    );
  }

  if (runId) {
    await supabase
      .from("cron_job_runs")
      .update({
        status: "complete",
        finished_at: new Date().toISOString(),
        processed: results.processed,
        sent: results.flagged,
        skipped: results.skipped,
        failed: results.errors.length,
        error_summary: results.errors.length ? results.errors.join("; ") : null,
      })
      .eq("id", runId);
  }

  console.log("[cron/silence-check] Done:", results);
  return NextResponse.json(results);
}
