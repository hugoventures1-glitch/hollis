/**
 * GET /api/cron/renewals
 *
 * Daily cron job — checks all active policies and fires due campaign touchpoints.
 * Protected by CRON_SECRET header. Runs as service role (bypasses RLS).
 *
 * Vercel schedule: 0 9 * * * (9 AM UTC daily)
 *
 * Race-safety: touchpoints are atomically claimed (status → 'processing') before
 * any external send. Concurrent cron executions skip rows already claimed.
 * Stale 'processing' rows (> 10 min) are reset to 'pending' at startup.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend/client";
import { sendSMS } from "@/lib/twilio/client";
import {
  generateRenewalEmail,
  generateSMSMessage,
  generateCallScript,
  type GenerateContext,
} from "@/lib/renewals/generate";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignTouchpoint, TouchpointType } from "@/types/renewals";
import { refreshPolicyHealthScore } from "@/lib/renewals/health-score";
import { isSendThrottled } from "@/lib/cron/throttle";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainStandard } from "@/lib/logAction";

const STAGE_MAP: Record<TouchpointType, Policy["campaign_stage"]> = {
  email_90: "email_90_sent",
  email_60: "email_60_sent",
  sms_30: "sms_30_sent",
  script_14: "script_14_ready",
  // New touchpoint types map to new stages (F3, F7, F2, F5)
  questionnaire_90: "questionnaire_sent",
  submission_60: "submission_sent",
  recommendation_30: "recommendation_sent",
  final_notice_7: "final_notice_sent",
};

// Stale claim threshold: reset 'processing' rows older than this many minutes.
const STALE_CLAIM_MINUTES = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const resend = getResendClient();
  const today = new Date().toISOString().split("T")[0];
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();

  // Open a durable run record
  const { data: runRow } = await supabase
    .from("cron_job_runs")
    .insert({ job_name: "renewals", status: "running" })
    .select("id")
    .single();
  const runId: string | null = runRow?.id ?? null;

  // Reset stale claims from crashed or timed-out previous runs
  await supabase
    .from("campaign_touchpoints")
    .update({ status: "pending", processing_started_at: null })
    .eq("status", "processing")
    .lt("processing_started_at", staleThreshold);

  // Auto-resume any policies whose pause window has expired
  await supabase
    .from("policies")
    .update({ renewal_paused: false, renewal_paused_until: null })
    .eq("renewal_paused", true)
    .lt("renewal_paused_until", today);

  // Fetch all active, non-paused policies that have not reached a terminal state
  const { data: policies, error: policiesError } = await supabase
    .from("policies")
    .select("*")
    .eq("status", "active")
    .eq("renewal_paused", false)
    .not("campaign_stage", "in", '("complete","confirmed","lapsed","final_notice_sent")');

  if (policiesError) {
    console.error("[cron/renewals] Failed to fetch policies:", policiesError.message);
    if (runId) {
      await supabase
        .from("cron_job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_summary: policiesError.message })
        .eq("id", runId);
    }
    return NextResponse.json({ error: policiesError.message }, { status: 500 });
  }

  // Build a per-broker context cache (standing_orders + client notes) so we
  // don't re-fetch the same profile for every policy in the same broker's book.
  const brokerContextCache = new Map<string, GenerateContext>();
  async function getBrokerContext(userId: string, clientEmail: string | null): Promise<GenerateContext> {
    const cached = brokerContextCache.get(userId);
    if (cached) {
      // Still need to fetch client-specific notes per policy
    } else {
      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("standing_orders")
        .eq("user_id", userId)
        .maybeSingle();
      brokerContextCache.set(userId, { standingOrders: profile?.standing_orders ?? null });
    }
    const base = brokerContextCache.get(userId) ?? {};
    // Fetch client notes if there's an email to match on
    let clientNotes: string | null = null;
    if (clientEmail) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("notes")
        .eq("email", clientEmail)
        .maybeSingle();
      clientNotes = clientRow?.notes ?? null;
    }
    return { ...base, clientNotes };
  }

  const results = {
    processed: 0,
    sent: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const policy of policies as Policy[]) {
    results.processed++;
    const days = daysUntilExpiry(policy.expiration_date);

    // Lapse detection: policy has expired with no client confirmation
    if (days <= 0) {
      // Send lapse confirmation email
      if (policy.client_email) {
        const expiryFormatted = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString(
          "en-AU",
          { day: "numeric", month: "long", year: "numeric" }
        );
        const lapseBody = `Dear ${policy.client_name},\n\nThis is to confirm that your ${policy.policy_name} with ${policy.carrier} lapsed on ${expiryFormatted}.\n\nAs of this date, your cover has ended and you are currently uninsured. Any claims arising after this date will not be covered.\n\nPlease contact us immediately to discuss reinstating your cover or arranging alternative insurance.\n\n${policy.agent_name ?? "Your Broker"}\n${policy.agent_email ?? ""}`.trim();
        const lapseSubject = `IMPORTANT: Your ${policy.policy_name} has lapsed`;

        const { data: lapseProfile } = await supabase
          .from("agent_profiles")
          .select("email_from_name")
          .eq("user_id", policy.user_id)
          .maybeSingle();
        const lapseBaseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
        const lapseFrom = lapseProfile?.email_from_name
          ? `${lapseProfile.email_from_name} <${lapseBaseFrom}>`
          : lapseBaseFrom;

        try {
          const { data: sent } = await resend.emails.send({
            from: lapseFrom,
            to: policy.client_email,
            subject: lapseSubject,
            text: lapseBody,
          });
          await supabase.from("send_logs").insert({
            policy_id: policy.id,
            user_id: policy.user_id,
            channel: "email",
            recipient: policy.client_email,
            status: "sent",
            provider_message_id: sent?.id ?? null,
            sent_at: new Date().toISOString(),
          });
          await writeAuditLog({
            supabase,
            policy_id: policy.id,
            user_id: policy.user_id,
            event_type: "lapse_recorded",
            channel: "email",
            recipient: policy.client_email,
            content_snapshot: `Subject: ${lapseSubject}\n\n${lapseBody}`,
            metadata: { expiration_date: policy.expiration_date },
            actor_type: "system",
          });
          void logAction({
            broker_id: policy.user_id,
            policy_id: policy.id,
            action_type: "renewal_email",
            tier: "1",
            trigger_reason: `Policy ${policy.policy_name ?? policy.id} expired on ${policy.expiration_date} — lapse confirmation email sent to ${policy.client_name}.`,
            payload: {
              subject: lapseSubject,
              body: lapseBody,
              recipient_email: policy.client_email,
              recipient_name: policy.client_name,
              channel: "email",
              template_used: "lapse_confirmation",
            },
            metadata: {
              carrier: policy.carrier ?? null,
              expiration_date: policy.expiration_date,
            },
            outcome: "sent",
            retain_until: retainStandard(),
          });
        } catch (err) {
          console.error("[cron/renewals] Lapse email failed for", policy.client_name, err instanceof Error ? err.message : err);
        }
      } else {
        // No email — still write audit log
        await writeAuditLog({
          supabase,
          policy_id: policy.id,
          user_id: policy.user_id,
          event_type: "lapse_recorded",
          channel: "internal",
          content_snapshot: `Policy lapsed on ${policy.expiration_date} — no client email on record.`,
          metadata: { expiration_date: policy.expiration_date },
          actor_type: "system",
        });
      }

      await supabase
        .from("policies")
        .update({ status: "expired", campaign_stage: "lapsed", lapsed_at: new Date().toISOString() })
        .eq("id", policy.id);
      continue;
    }

    // Determine which touchpoint types are due today.
    //
    // Catch-up logic: when a policy is imported after an early-window touchpoint
    // has already passed (e.g. email_90 skipped because it was imported at day 75),
    // the stage stays "pending" even though later windows are now due. We therefore
    // check BOTH the time window AND the set of stages that legitimately precede the
    // current one — allowing the agent to fire the correct next touchpoint even if
    // the chain was started mid-sequence.
    const dueTouchpointTypes: TouchpointType[] = [];
    const pendingOrSkipped = ["pending", "email_90_sent"]; // stages that allow email_60 catch-up
    if (days <= 90 && policy.campaign_stage === "pending")       dueTouchpointTypes.push("email_90");
    if (days <= 60 && pendingOrSkipped.includes(policy.campaign_stage)) dueTouchpointTypes.push("email_60");
    if (days <= 30 && ["email_60_sent", ...pendingOrSkipped].includes(policy.campaign_stage)) dueTouchpointTypes.push("sms_30");
    if (days <= 14 && ["sms_30_sent", "email_60_sent", ...pendingOrSkipped].includes(policy.campaign_stage)) dueTouchpointTypes.push("script_14");

    for (const type of dueTouchpointTypes) {
      // Find the pending touchpoint — only fire it if it's actually due today
      // (scheduled_at <= today guards against firing future touchpoints that the
      // expanded stage-catch-up logic would otherwise expose)
      const { data: touchpointRows } = await supabase
        .from("campaign_touchpoints")
        .select("*")
        .eq("policy_id", policy.id)
        .eq("type", type)
        .eq("status", "pending")
        .lte("scheduled_at", today)
        .limit(1);

      let touchpoint = touchpointRows?.[0] as CampaignTouchpoint | undefined;

      // Auto-create the touchpoint if it doesn't exist yet.
      // This handles policies imported after the scheduled window has already
      // opened — no manual seeding step required.
      if (!touchpoint) {
        const { data: created } = await supabase
          .from("campaign_touchpoints")
          .insert({
            policy_id: policy.id,
            user_id: policy.user_id,
            type,
            status: "pending",
            scheduled_at: today,
          })
          .select()
          .single();
        if (!created) {
          results.skipped++;
          continue;
        }
        touchpoint = created as CampaignTouchpoint;
      }

      // If a Tier 2 approval queue item is already pending for this touchpoint type,
      // leave the touchpoint in 'pending' and wait for broker decision.
      const { data: pendingQueueItem } = await supabase
        .from("approval_queue")
        .select("id")
        .eq("policy_id", policy.id)
        .eq("status", "pending")
        .eq("classified_intent", `send_${type}`)
        .maybeSingle();

      if (pendingQueueItem) {
        results.skipped++;
        continue;
      }

      // Atomically claim: only proceeds if this worker wins the race
      const { data: claimed } = await supabase
        .from("campaign_touchpoints")
        .update({ status: "processing", processing_started_at: new Date().toISOString() })
        .eq("id", touchpoint.id)
        .eq("status", "pending")
        .select("id");

      if (!claimed?.length) {
        // Another worker claimed this touchpoint first
        results.skipped++;
        continue;
      }

      // Throttle guard: skip if client was already contacted for this policy within 48 h
      const recipient =
        type === "sms_30"
          ? (policy.client_phone ?? policy.client_email ?? "")
          : (policy.client_email ?? "");
      const throttled = await isSendThrottled(supabase, recipient, policy.id, "policy_id", 48);
      if (throttled) {
        // Release the claim and skip
        await supabase
          .from("campaign_touchpoints")
          .update({ status: "pending", processing_started_at: null })
          .eq("id", touchpoint.id);
        results.skipped++;
        continue;
      }

      // ── Tier routing: check renewal flags before firing ─────────────────────
      const { tier, reason: tierReason } = checkTierRouting(policy, days);

      if (tier === 3) {
        // Hard stop — mark skipped, write audit log, notify broker
        await supabase
          .from("campaign_touchpoints")
          .update({ status: "skipped" })
          .eq("id", touchpoint.id);

        await writeAuditLog({
          supabase,
          policy_id: policy.id,
          user_id: policy.user_id,
          event_type: "tier_3_escalated",
          channel: "internal",
          content_snapshot: `${tierReason} — auto-send halted for ${policy.client_name} / ${type}`,
          metadata: { touchpoint_id: touchpoint.id, touchpoint_type: type, flag_reason: tierReason },
          actor_type: "system",
        });

        void logAction({
          broker_id: policy.user_id,
          policy_id: policy.id,
          action_type: "renewal_email",
          tier: "3",
          trigger_reason: `${tierReason} — outbound ${type} to ${policy.client_name} halted (Tier 3 escalation).`,
          payload: { touchpoint_type: type, flag_reason: tierReason },
          metadata: { carrier: policy.carrier ?? null, days_to_expiry: days, touchpoint_id: touchpoint.id },
          outcome: "blocked",
          retain_until: retainStandard(),
        });

        results.skipped++;
        continue;
      }

      if (tier === 2) {
        // Draft the outbound content, insert to approval_queue, release claim
        const ctx = await getBrokerContext(policy.user_id, policy.client_email ?? null);
        let draftSubject: string | null = null;
        let draftBody: string | null = null;
        const draftChannel: "email" | "sms" = type === "sms_30" ? "sms" : "email";

        try {
          if (type === "email_90" || type === "email_60") {
            const generated = await generateRenewalEmail(policy, type, ctx);
            draftSubject = generated.subject;
            draftBody = generated.body;
          } else if (type === "sms_30") {
            draftBody = await generateSMSMessage(policy, ctx);
          } else if (type === "script_14") {
            draftBody = await generateCallScript(policy, ctx);
          }
        } catch (genErr) {
          console.error("[cron/renewals] Draft generation failed for Tier 2:", genErr instanceof Error ? genErr.message : genErr);
          // Fall back to a placeholder so the item still appears in the queue
          draftBody = `[Draft content could not be generated — please compose manually]`;
        }

        const touchpointLabel = TOUCHPOINT_TYPE_LABELS[type] ?? type;

        await supabase.from("approval_queue").insert({
          policy_id: policy.id,
          user_id: policy.user_id,
          signal_id: null,
          classified_intent: `send_${type}`,
          confidence_score: 0.95,
          raw_signal_snippet: tierReason,
          proposed_action: {
            description: `Send ${touchpointLabel} to ${policy.client_name} (${draftChannel === "sms" ? (policy.client_phone ?? "no phone") : (policy.client_email ?? "no email")}). Flagged: ${tierReason}.`,
            action_type: "send_renewal_email",
            payload: {
              touchpoint_id: touchpoint.id,
              touchpoint_type: type,
              subject: draftSubject,
              body: draftBody,
              recipient_email: policy.client_email ?? null,
              recipient_phone: policy.client_phone ?? null,
              recipient_name: policy.client_name,
              policy_id: policy.id,
              user_id: policy.user_id,
              channel: draftChannel,
              flag_reason: tierReason,
            },
          },
          status: "pending",
        });

        // Release the claim — the touchpoint stays 'pending' until broker approves
        await supabase
          .from("campaign_touchpoints")
          .update({ status: "pending", processing_started_at: null })
          .eq("id", touchpoint.id);

        await writeAuditLog({
          supabase,
          policy_id: policy.id,
          user_id: policy.user_id,
          event_type: "tier_2_drafted",
          channel: "internal",
          content_snapshot: draftSubject
            ? `Subject: ${draftSubject}\n\n${draftBody ?? ""}`
            : (draftBody ?? ""),
          metadata: { touchpoint_id: touchpoint.id, touchpoint_type: type, flag_reason: tierReason },
          actor_type: "system",
        });

        void logAction({
          broker_id: policy.user_id,
          policy_id: policy.id,
          action_type: "renewal_email",
          tier: "2",
          trigger_reason: `${tierReason} — ${type} to ${policy.client_name} drafted and queued for broker approval.`,
          payload: {
            subject: draftSubject ?? null,
            body: draftBody ?? null,
            recipient_email: policy.client_email ?? null,
            recipient_name: policy.client_name,
            channel: draftChannel,
            template_used: type,
            flag_reason: tierReason,
          },
          metadata: { carrier: policy.carrier ?? null, days_to_expiry: days, touchpoint_id: touchpoint.id },
          outcome: "queued",
          retain_until: retainStandard(),
        });

        results.queued++;
        continue;
      }

      // ── Tier 1: autonomous send ──────────────────────────────────────────────
      try {
        const ctx = await getBrokerContext(policy.user_id, policy.client_email ?? null);
        await fireTouchpoint(supabase, resend, policy, touchpoint, type, today, ctx);
        results.sent++;
        await refreshPolicyHealthScore(policy.id, supabase);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${policy.client_name} / ${type}: ${msg}`);
        results.failed++;

        await supabase
          .from("campaign_touchpoints")
          .update({ status: "failed" })
          .eq("id", touchpoint.id);
      }
    }
  }

  if (runId) {
    await supabase
      .from("cron_job_runs")
      .update({
        status: "complete",
        finished_at: new Date().toISOString(),
        processed: results.processed,
        sent: results.sent,
        queued: results.queued,
        skipped: results.skipped,
        failed: results.failed,
        error_summary: results.errors.length ? results.errors.join("; ") : null,
      })
      .eq("id", runId);
  }

  console.log("[cron/renewals] Done:", results);
  return NextResponse.json(results);
}

// ── Touchpoint labels (human-readable for queue descriptions) ─────────────────

const TOUCHPOINT_TYPE_LABELS: Record<TouchpointType, string> = {
  email_90: "90-day renewal email",
  email_60: "60-day follow-up email",
  sms_30: "30-day renewal SMS",
  script_14: "14-day call script",
  questionnaire_90: "90-day questionnaire",
  submission_60: "60-day insurer submission",
  recommendation_30: "30-day recommendation",
  final_notice_7: "7-day final notice",
};

// ── Tier routing decision ─────────────────────────────────────────────────────
//
// Reads renewal_flags on the policy and returns the appropriate tier:
//   Tier 3 — hard stop: active claim, insurer declined, business restructure
//   Tier 2 — needs broker approval: silent client, third-party contact, large premium increase
//   Tier 1 — autonomous send: no flags set

function checkTierRouting(
  policy: Policy,
  _days: number,
): { tier: 1 | 2 | 3; reason: string } {
  const flags = policy.renewal_flags;
  if (!flags) return { tier: 1, reason: "No flags" };

  // Tier 3: hard stop — these flags indicate the sequence should NOT proceed
  if (flags.active_claim)
    return { tier: 3, reason: "Active claim on record — outbound halted" };
  if (flags.insurer_declined)
    return { tier: 3, reason: "Insurer has declined cover" };
  if (flags.business_restructure)
    return { tier: 3, reason: "Business restructure flagged — broker must review" };

  // Tier 2: broker approval required before send
  if (flags.silent_client)
    return { tier: 2, reason: "Client has not engaged after multiple touchpoints" };
  if (flags.third_party_contact)
    return { tier: 2, reason: "Reply received from a non-policy contact" };
  if (flags.premium_increase_pct !== null && flags.premium_increase_pct >= 25)
    return {
      tier: 2,
      reason: `Premium increase of ${flags.premium_increase_pct}% detected — broker review required`,
    };

  return { tier: 1, reason: "No flags" };
}

// ── Fire a single touchpoint ──────────────────────────────────────────────────

async function fireTouchpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resend: any,
  policy: Policy,
  touchpoint: CampaignTouchpoint,
  type: TouchpointType,
  today: string,
  ctx?: GenerateContext,
) {
  let providerId: string | null = null;
  let subject: string | null = null;
  let content: string | null = null;
  let channel: "email" | "sms" = "email";

  if (type === "email_90" || type === "email_60") {
    // Bounce suppression: skip if the address has previously hard-bounced
    const { data: clientRow } = await supabase
      .from("clients")
      .select("email_bounced")
      .eq("email", policy.client_email)
      .maybeSingle();
    if (clientRow?.email_bounced) {
      throw new Error("Email address has bounced — send suppressed");
    }

    const generated = await generateRenewalEmail(policy, type, ctx);
    subject = generated.subject;
    content = generated.body;

    const { data: brokerProfile } = await supabase
      .from("agent_profiles")
      .select("email_from_name")
      .eq("user_id", policy.user_id)
      .maybeSingle();
    const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
    const from = brokerProfile?.email_from_name
      ? `${brokerProfile.email_from_name} <${baseFrom}>`
      : baseFrom;

    const { data: sent } = await resend.emails.send({
      from,
      to: policy.client_email,
      subject,
      text: content,
    });
    providerId = sent?.id ?? null;
    channel = "email";
  } else if (type === "sms_30") {
    if (!policy.client_phone) {
      throw new Error("No phone number on record");
    }
    content = await generateSMSMessage(policy, ctx);
    providerId = await sendSMS(policy.client_phone, content);
    channel = "sms";
  } else if (type === "script_14") {
    content = await generateCallScript(policy, ctx);
    channel = "email"; // logged as internal
  }

  // Mark touchpoint sent
  await supabase
    .from("campaign_touchpoints")
    .update({
      status: "sent",
      subject,
      content,
      sent_at: new Date().toISOString(),
    })
    .eq("id", touchpoint.id);

  // Log the send
  await supabase.from("send_logs").insert({
    policy_id: policy.id,
    touchpoint_id: touchpoint.id,
    user_id: policy.user_id,
    channel,
    recipient: channel === "sms" ? policy.client_phone! : policy.client_email,
    status: "sent",
    provider_message_id: providerId,
    sent_at: new Date().toISOString(),
  });

  // Write to renewal audit log
  await writeAuditLog({
    supabase,
    policy_id: policy.id,
    user_id: policy.user_id,
    event_type: channel === "sms" ? "sms_sent" : "email_sent",
    channel,
    recipient: channel === "sms" ? (policy.client_phone ?? null) : (policy.client_email ?? null),
    content_snapshot: subject ? `Subject: ${subject}\n\n${content}` : content,
    metadata: {
      touchpoint_id: touchpoint.id,
      touchpoint_type: type,
      subject: subject ?? null,
      provider_id: providerId,
    },
    actor_type: "system",
  });

  // Advance policy campaign stage
  const newStage = STAGE_MAP[type];

  // Log to hollis_actions (fire-and-forget)
  const days = daysUntilExpiry(policy.expiration_date);
  const isSms = type === "sms_30";
  const templateLabels: Record<TouchpointType, string> = {
    email_90: "90-day renewal email",
    email_60: "60-day renewal email",
    sms_30:   "30-day renewal SMS",
    script_14: "14-day call script",
    questionnaire_90: "90-day questionnaire",
    submission_60: "60-day submission",
    recommendation_30: "30-day recommendation",
    final_notice_7: "7-day final notice",
  };
  void logAction({
    broker_id: policy.user_id,
    policy_id: policy.id,
    action_type: isSms ? "renewal_sms" : "renewal_email",
    tier: "1",
    trigger_reason: `Policy ${policy.policy_name ?? policy.id} is ${days} day${days !== 1 ? "s" : ""} from expiry — ${templateLabels[type] ?? type} dispatched to ${policy.client_name}.`,
    payload: {
      subject: subject ?? null,
      body: content ?? null,
      recipient_email: isSms ? null : (policy.client_email ?? null),
      recipient_name: policy.client_name,
      channel,
      template_used: type,
      previous_stage: policy.campaign_stage,
      new_stage: newStage,
    },
    metadata: {
      carrier: policy.carrier ?? null,
      days_to_expiry: days,
      touchpoint_id: touchpoint.id,
      provider_id: providerId,
    },
    outcome: "sent",
    retain_until: retainStandard(),
  });
  await supabase
    .from("policies")
    .update({
      campaign_stage: newStage,
      last_contact_at: today,
    })
    .eq("id", policy.id);
}
