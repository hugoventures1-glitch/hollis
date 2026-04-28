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
import { daysUntilExpiry, resolveLeadTimes } from "@/types/renewals";
import type { Policy, CampaignTouchpoint, TouchpointType, LeadTimeConfig, LeadTimes } from "@/types/renewals";
import { refreshPolicyHealthScore } from "@/lib/renewals/health-score";
import { isSendThrottled } from "@/lib/cron/throttle";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainStandard } from "@/lib/logAction";
import { resolveTierRouting } from "@/lib/renewals/tier-routing";
import { draftDocumentChaseSequence } from "@/lib/doc-chase/generate";
import { generateInsuranceSubmission } from "@/lib/renewals/submission";
import { generateRecommendationPack } from "@/lib/renewals/recommendation-pack";
import type { InsurerTerms } from "@/types/renewals";

const STAGE_MAP: Record<TouchpointType, Policy["campaign_stage"]> = {
  email_90: "email_90_sent",
  email_60: "email_60_sent",
  sms_30: "sms_30_sent",
  script_14: "script_14_ready",
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

  // Pre-load all lead time configs across all brokers (service role bypasses RLS).
  // Keyed by user_id → policy_type for O(1) lookup per policy.
  const { data: allLeadTimeRows } = await supabase
    .from("renewal_lead_time_configs")
    .select("*");

  const leadTimeConfigMap = new Map<string, Map<string, LeadTimeConfig>>();
  for (const cfg of (allLeadTimeRows ?? []) as LeadTimeConfig[]) {
    if (!leadTimeConfigMap.has(cfg.user_id)) {
      leadTimeConfigMap.set(cfg.user_id, new Map());
    }
    leadTimeConfigMap.get(cfg.user_id)!.set(cfg.policy_type.toLowerCase(), cfg);
  }

  function getLeadTimes(policy: Policy): LeadTimes {
    return resolveLeadTimes(policy.policy_type, leadTimeConfigMap.get(policy.user_id) ?? new Map());
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
        .select("standing_orders, email_signature")
        .eq("user_id", userId)
        .maybeSingle();
      brokerContextCache.set(userId, {
        standingOrders: profile?.standing_orders ?? null,
        emailSignature: profile?.email_signature ?? null,
      });
    }
    const base = brokerContextCache.get(userId) ?? {};
    // Fetch client notes if there's an email to match on
    let clientNotes: string | null = null;
    if (clientEmail) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("notes")
        .eq("user_id", userId)
        .eq("email", clientEmail)
        .maybeSingle();
      clientNotes = clientRow?.notes ?? null;
    }
    // Fetch recent body edits for style learning
    const { data: bodyEdits } = await supabase
      .from("parser_outcomes")
      .select("original_body, edited_body")
      .eq("user_id", userId)
      .not("edited_body", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    const recentBodyEdits = (bodyEdits ?? [])
      .filter((r: { original_body: string | null; edited_body: string | null }) => r.original_body && r.edited_body)
      .map((r: { original_body: string | null; edited_body: string | null }) => ({ original: r.original_body!, edited: r.edited_body! }));

    return { ...base, clientNotes, recentBodyEdits };
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

    // ── Resolve freshest contact info from clients table ──────────────────
    // The policies table stores denormalized client_email/client_phone that
    // can go stale when a broker edits the client record. Override with the
    // authoritative values from the clients table before any send logic runs.
    {
      const { data: freshClient } = await supabase
        .from("clients")
        .select("email, phone")
        .eq("user_id", policy.user_id)
        .ilike("name", policy.client_name)
        .maybeSingle();
      if (freshClient) {
        if (freshClient.email) policy.client_email = freshClient.email;
        if (freshClient.phone) policy.client_phone = freshClient.phone;
      }
    }

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
          .select("email_from_name, email, signal_token")
          .eq("user_id", policy.user_id)
          .maybeSingle();
        const lapseBaseFrom = process.env.FROM_EMAIL ?? "noreply@hollisai.com.au";
        const lapseFrom = lapseProfile?.email_from_name
          ? `${lapseProfile.email_from_name} <${lapseBaseFrom}>`
          : lapseBaseFrom;

        try {
          const { data: sent } = await resend.emails.send({
            from: lapseFrom,
            to: policy.client_email,
            subject: lapseSubject,
            text: lapseBody,
            replyTo: lapseProfile?.signal_token
              ? `${lapseProfile.signal_token}@ildaexi.resend.app`
              : (process.env.INBOUND_EMAIL ?? lapseProfile?.email ?? undefined),
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

      // Auto-reject pending approval_queue items since policy has lapsed
      await supabase
        .from("approval_queue")
        .update({ status: "rejected" })
        .eq("policy_id", policy.id)
        .eq("status", "pending");

      continue;
    }

    // Determine which single touchpoint type is due today.
    //
    // Two cases:
    //
    // 1. Catch-up (stage === "pending"): policy was imported after an early window
    //    already passed. Fire ONLY the most appropriate touchpoint for where the
    //    policy sits today — never the earlier template. A client 60 days out
    //    should receive the 60-day email, not the 90-day email followed by the
    //    60-day email in the same run.
    //
    // 2. Sequential (stage !== "pending"): policy is mid-sequence. Fire the next
    //    logical touchpoint only once the prior stage has been recorded.
    //    Uses else-if so only one touchpoint fires per policy per cron run,
    //    preventing same-day email + SMS stacking.
    const dueTouchpointTypes: TouchpointType[] = [];

    const lt = getLeadTimes(policy);

    if (policy.campaign_stage === "pending") {
      // Catch-up: pick the single best-fit touchpoint for today's window
      if      (days <= lt.offset_call)    dueTouchpointTypes.push("script_14");
      else if (days <= lt.offset_sms)     dueTouchpointTypes.push("sms_30");
      else if (days <= lt.offset_email_2) dueTouchpointTypes.push("email_60");
      else if (days <= lt.offset_email_1) dueTouchpointTypes.push("email_90");
      // > offset_email_1 days: nothing due yet
    } else {
      // Sequential: fire next due touchpoint in priority order (first match wins)
      if (days <= lt.offset_call && ["email_90_sent", "email_60_sent", "sms_30_sent"].includes(policy.campaign_stage)) {
        dueTouchpointTypes.push("script_14");
      } else if (days <= lt.offset_sms && ["email_90_sent", "email_60_sent"].includes(policy.campaign_stage)) {
        dueTouchpointTypes.push("sms_30");
      } else if (days <= lt.offset_email_2 && policy.campaign_stage === "email_90_sent") {
        dueTouchpointTypes.push("email_60");
      } else if (policy.campaign_stage === "script_14_ready") {
        dueTouchpointTypes.push("submission_60");
      } else if (policy.campaign_stage === "submission_sent") {
        dueTouchpointTypes.push("recommendation_30");
      }
    }

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

      // ── Tier routing: auto-detect flags + confidence-based routing ──────────
      const { tier, reason: tierReason, mode: tierMode } = await resolveTierRouting(
        supabase, policy, type, days
      );

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
          } else if (type === "submission_60") {
            const [
              { data: t2Client },
              { data: t2LatestCheck },
              { data: t2PriorTerms },
              { data: t2SubProfile },
            ] = await Promise.all([
              supabase.from("clients").select("name, business_type, industry, num_employees, annual_revenue, owns_vehicles, num_locations, primary_state, notes").eq("user_id", policy.user_id).ilike("name", `%${policy.client_name}%`).maybeSingle(),
              supabase.from("policy_checks").select("id").eq("user_id", policy.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
              supabase.from("insurer_terms").select("insurer_name, quoted_premium, payment_terms, new_exclusions, changed_conditions").eq("policy_id", policy.id).eq("user_id", policy.user_id).order("created_at", { ascending: false }),
              supabase.from("agent_profiles").select("first_name, last_name, phone, agency_name, agency_afsl, email_from_name, email").eq("user_id", policy.user_id).maybeSingle(),
            ]);
            let t2AuditFlags: Array<{ severity: string; title: string; what_found: string; why_it_matters?: string | null }> = [];
            if (t2LatestCheck) {
              const { data: t2Flags } = await supabase.from("policy_check_flags").select("severity, title, what_found, why_it_matters").eq("policy_check_id", t2LatestCheck.id).in("severity", ["critical", "warning"]).order("severity");
              t2AuditFlags = t2Flags ?? [];
            }
            const t2AgentName = t2SubProfile ? [t2SubProfile.first_name, t2SubProfile.last_name].filter(Boolean).join(" ") || "Your Broker" : "Your Broker";
            const t2Generated = await generateInsuranceSubmission({
              policy,
              client: t2Client ?? null,
              auditFlags: t2AuditFlags,
              priorTerms: t2PriorTerms ?? [],
              agentName: t2AgentName,
              agentEmail: t2SubProfile?.email ?? policy.agent_email ?? "",
              agentPhone: t2SubProfile?.phone ?? null,
              agencyName: t2SubProfile?.agency_name ?? null,
              agencyAfsl: t2SubProfile?.agency_afsl ?? null,
            });
            draftSubject = t2Generated.subject;
            draftBody = t2Generated.body;
          } else if (type === "recommendation_30") {
            const [{ data: t2RecTerms }, { data: t2RecProfile }] = await Promise.all([
              supabase.from("insurer_terms").select("*").eq("policy_id", policy.id).eq("user_id", policy.user_id).order("created_at", { ascending: true }),
              supabase.from("agent_profiles").select("first_name, last_name, phone, agency_name, email_from_name, agency_afsl, email").eq("user_id", policy.user_id).maybeSingle(),
            ]);
            if (t2RecTerms && t2RecTerms.length > 0 && t2RecProfile?.agency_afsl?.trim()) {
              const t2RecAgentName = [t2RecProfile.first_name, t2RecProfile.last_name].filter(Boolean).join(" ") || "Your Broker";
              const t2Pack = await generateRecommendationPack(policy, t2RecTerms as InsurerTerms[], t2RecAgentName, t2RecProfile.email ?? policy.agent_email ?? "", t2RecProfile.phone ?? null);
              const t2Disclosure = `\n\n---\n\nIMPORTANT DISCLOSURE\n\nThis recommendation has been prepared by ${t2RecProfile.agency_name ?? "Your Broker"} (AFSL ${t2RecProfile.agency_afsl}) as general advice only. It does not take into account your individual objectives, financial situation or needs. Before acting on this advice, you should consider whether it is appropriate for your circumstances.`;
              draftSubject = t2Pack.subject;
              draftBody = t2Pack.body + t2Disclosure;
            } else {
              const expiryFmt = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
              draftBody = `Dear ${policy.client_name},\n\nFollowing our renewal review for your ${policy.policy_name} due on ${expiryFmt}, we have prepared our recommendation for the upcoming renewal.\n\nPlease expect to hear from us shortly with the full recommendation pack.\n\n${policy.agent_name ?? "Your Broker"}\n${policy.agent_email ?? ""}`.trim();
            }
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
          confidence_score: null,
          raw_signal_snippet: `${TOUCHPOINT_TYPE_LABELS[type] ?? type} · ${policy.client_name}`,
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
          trigger_reason: `[${tierMode === "learning" ? "learning mode" : "flag detected"}] ${tierReason} — ${type} to ${policy.client_name} drafted and queued for broker approval.`,
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
  submission_60: "60-day insurer submission",
  recommendation_30: "30-day recommendation",
  final_notice_7: "7-day final notice",
};

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
      .select("email_from_name, email, email_signature, signal_token")
      .eq("user_id", policy.user_id)
      .maybeSingle();
    const baseFrom = process.env.FROM_EMAIL ?? "noreply@hollisai.com.au";
    const from = brokerProfile?.email_from_name
      ? `${brokerProfile.email_from_name} <${baseFrom}>`
      : baseFrom;

    const { data: sent } = await resend.emails.send({
      from,
      to: policy.client_email,
      subject,
      text: content,
      replyTo: brokerProfile?.signal_token
        ? `${brokerProfile.signal_token}@ildaexi.resend.app`
        : (process.env.INBOUND_EMAIL ?? brokerProfile?.email ?? undefined),
    });
    providerId = sent?.id ?? null;
    channel = "email";

    // Auto-trigger doc chase after 90-day email send (if not already active)
    if (type === "email_90") {
      try {
        const { data: existingChase } = await supabase
          .from("doc_chase_requests")
          .select("id")
          .eq("policy_id", policy.id)
          .not("status", "in", '("cancelled")')
          .limit(1)
          .maybeSingle();

        if (!existingChase) {
          // Insert doc_chase_request
          const { data: chaseReq } = await supabase
            .from("doc_chase_requests")
            .insert({
              policy_id: policy.id,
              user_id: policy.user_id,
              client_name: policy.client_name,
              client_email: policy.client_email,
              document_type: "renewal documents",
              status: "active",
              escalation_level: "email",
            })
            .select("id")
            .single();

          if (chaseReq) {
            // Insert doc_chase_sequence
            const { data: chaseSeq } = await supabase
              .from("doc_chase_sequences")
              .insert({
                request_id: chaseReq.id,
                user_id: policy.user_id,
                sequence_status: "active",
              })
              .select("id")
              .single();

            if (chaseSeq) {
              // Draft messages with Claude
              const agentName = brokerProfile?.email_from_name ?? policy.agent_name ?? "Your Agent";
              const agentEmail = brokerProfile?.email ?? policy.agent_email ?? (process.env.FROM_EMAIL ?? "noreply@hollisai.com.au");
              const touches = await draftDocumentChaseSequence(
                policy.client_name,
                "renewal documents",
                agentName,
                agentEmail,
                null,
                policy.client_phone ?? null,
                undefined,
                brokerProfile?.email_signature ?? null
              );

              const TOUCH_DELAYS_DAYS = [0, 5, 10, 20];
              const now = new Date();
              const messageInserts = touches.map((touch, i) => {
                const scheduledFor = new Date(now.getTime() + TOUCH_DELAYS_DAYS[i] * 86_400_000);
                return {
                  sequence_id: chaseSeq.id,
                  touch_number: i + 1,
                  scheduled_for: scheduledFor.toISOString(),
                  status: "scheduled",
                  subject: touch.subject ?? "",
                  body: touch.body,
                  channel: touch.channel,
                  phone_script: touch.channel === "phone_script" ? touch.phone_script ?? null : null,
                };
              });

              await supabase.from("doc_chase_messages").insert(messageInserts);

              void logAction({
                broker_id: policy.user_id,
                policy_id: policy.id,
                action_type: "renewal_email",
                tier: "1",
                trigger_reason: `Doc chase sequence auto-created for ${policy.client_name} after 90-day renewal email.`,
                payload: {
                  doc_chase_request_id: chaseReq.id,
                  doc_chase_sequence_id: chaseSeq.id,
                  document_type: "renewal documents",
                  touches_scheduled: 4,
                },
                metadata: { carrier: policy.carrier ?? null },
                outcome: "sent",
                retain_until: retainStandard(),
              });
            }
          }
        }
      } catch (docChaseErr) {
        console.error("[cron/renewals] Doc chase auto-create failed for", policy.client_name, docChaseErr instanceof Error ? docChaseErr.message : docChaseErr);
        // Non-fatal — email send already succeeded
      }
    }
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
  } else if (type === "submission_60") {
    const [
      { data: subClient },
      { data: subLatestCheck },
      { data: subPriorTerms },
      { data: subProfile },
    ] = await Promise.all([
      supabase.from("clients").select("name, business_type, industry, num_employees, annual_revenue, owns_vehicles, num_locations, primary_state, notes").eq("user_id", policy.user_id).ilike("name", `%${policy.client_name}%`).maybeSingle(),
      supabase.from("policy_checks").select("id").eq("user_id", policy.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("insurer_terms").select("insurer_name, quoted_premium, payment_terms, new_exclusions, changed_conditions").eq("policy_id", policy.id).eq("user_id", policy.user_id).order("created_at", { ascending: false }),
      supabase.from("agent_profiles").select("first_name, last_name, phone, agency_name, agency_afsl, email_from_name, email").eq("user_id", policy.user_id).maybeSingle(),
    ]);
    let subAuditFlags: Array<{ severity: string; title: string; what_found: string; why_it_matters?: string | null }> = [];
    if (subLatestCheck) {
      const { data: subFlags } = await supabase.from("policy_check_flags").select("severity, title, what_found, why_it_matters").eq("policy_check_id", subLatestCheck.id).in("severity", ["critical", "warning"]).order("severity");
      subAuditFlags = subFlags ?? [];
    }
    const subAgentName = subProfile ? [subProfile.first_name, subProfile.last_name].filter(Boolean).join(" ") || "Your Broker" : "Your Broker";
    const subAgentEmail = subProfile?.email ?? policy.agent_email ?? "";
    if (!subAgentEmail) throw new Error("No broker email — cannot deliver submission");
    const submission = await generateInsuranceSubmission({
      policy,
      client: subClient ?? null,
      auditFlags: subAuditFlags,
      priorTerms: subPriorTerms ?? [],
      agentName: subAgentName,
      agentEmail: subAgentEmail,
      agentPhone: subProfile?.phone ?? null,
      agencyName: subProfile?.agency_name ?? null,
      agencyAfsl: subProfile?.agency_afsl ?? null,
    });
    subject = submission.subject;
    content = submission.body;
    const subBaseFrom = process.env.FROM_EMAIL ?? "noreply@hollisai.com.au";
    const subFrom = subProfile?.email_from_name ? `${subProfile.email_from_name} <${subBaseFrom}>` : subBaseFrom;
    const { data: subSent } = await resend.emails.send({ from: subFrom, to: subAgentEmail, subject, text: content });
    providerId = subSent?.id ?? null;
    channel = "email";
  } else if (type === "recommendation_30") {
    if (!policy.client_email) throw new Error("No client email on record for recommendation");
    const [{ data: recTerms }, { data: recProfile }] = await Promise.all([
      supabase.from("insurer_terms").select("*").eq("policy_id", policy.id).eq("user_id", policy.user_id).order("created_at", { ascending: true }),
      supabase.from("agent_profiles").select("first_name, last_name, phone, agency_name, email_from_name, agency_afsl, email, signal_token").eq("user_id", policy.user_id).maybeSingle(),
    ]);
    const recBaseFrom = process.env.FROM_EMAIL ?? "noreply@hollisai.com.au";
    const recFrom = recProfile?.email_from_name ? `${recProfile.email_from_name} <${recBaseFrom}>` : recBaseFrom;
    if (recTerms && recTerms.length > 0 && recProfile?.agency_afsl?.trim()) {
      const recAgentName = [recProfile.first_name, recProfile.last_name].filter(Boolean).join(" ") || "Your Broker";
      const pack = await generateRecommendationPack(policy, recTerms as InsurerTerms[], recAgentName, recProfile.email ?? policy.agent_email ?? "", recProfile.phone ?? null);
      const disclosure = `\n\n---\n\nIMPORTANT DISCLOSURE\n\nThis recommendation has been prepared by ${recProfile.agency_name ?? "Your Broker"} (AFSL ${recProfile.agency_afsl}) as general advice only. It does not take into account your individual objectives, financial situation or needs. Before acting on this advice, you should consider whether it is appropriate for your circumstances.`;
      subject = pack.subject;
      content = pack.body + disclosure;
    } else {
      console.warn(`[cron/renewals] recommendation_30 fallback for policy ${policy.id}: terms=${recTerms?.length ?? 0}, afsl=${!!recProfile?.agency_afsl}`);
      const recExpiry = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
      subject = `Your ${policy.policy_name} renewal recommendation`;
      content = `Dear ${policy.client_name},\n\nFollowing our review of your ${policy.policy_name} due for renewal on ${recExpiry}, we have prepared our renewal recommendation for you.\n\nPlease review the recommendation and let us know if you have any questions or would like to proceed.\n\n${policy.agent_name ?? "Your Broker"}\n${policy.agent_email ?? ""}`.trim();
    }
    const recReplyTo = recProfile?.signal_token
      ? `${recProfile.signal_token}@ildaexi.resend.app`
      : (process.env.INBOUND_EMAIL ?? recProfile?.email ?? undefined);
    const { data: recSent } = await resend.emails.send({ from: recFrom, to: policy.client_email, subject, text: content, ...(recReplyTo ? { replyTo: recReplyTo } : {}) });
    providerId = recSent?.id ?? null;
    channel = "email";
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
