/**
 * GET /api/cron/final-notice
 *
 * Fires 7-day final notices for policies approaching expiry with no confirmation.
 * Runs at 8 AM UTC daily (1 hour before main renewals cron).
 * Protected by CRON_SECRET header. Uses service role (bypasses RLS).
 *
 * Qualifies a policy if ALL of the following are true:
 * - days_until_expiry <= 7 and > 0
 * - campaign_stage NOT IN (confirmed, lapsed, final_notice_sent, complete)
 * - client_confirmed_at IS NULL
 * - status = 'active'
 * - renewal_paused = false
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend/client";
import { generateFinalNotice, finalNoticeFallback } from "@/lib/renewals/final-notice";
import { writeAuditLog } from "@/lib/audit/log";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy } from "@/types/renewals";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const resend = getResendClient();

  // Open a durable run record
  const { data: runRow } = await supabase
    .from("cron_job_runs")
    .insert({ job_name: "final-notice", status: "running" })
    .select("id")
    .single();
  const runId: string | null = runRow?.id ?? null;

  // Fetch all active, unpaused policies not yet in a terminal state
  const { data: policies, error: policiesError } = await supabase
    .from("policies")
    .select("*")
    .eq("status", "active")
    .eq("renewal_paused", false)
    .is("client_confirmed_at", null)
    .not("campaign_stage", "in", '("confirmed","lapsed","final_notice_sent","complete")');

  if (policiesError) {
    console.error("[cron/final-notice] Failed to fetch policies:", policiesError.message);
    if (runId) {
      await supabase
        .from("cron_job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_summary: policiesError.message })
        .eq("id", runId);
    }
    return NextResponse.json({ error: policiesError.message }, { status: 500 });
  }

  // Filter to those with 1–7 days remaining
  const qualifying = (policies as Policy[]).filter((p) => {
    const days = daysUntilExpiry(p.expiration_date);
    return days >= 1 && days <= 7;
  });

  const results = { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] as string[] };

  for (const policy of qualifying) {
    results.processed++;

    if (!policy.client_email) {
      results.skipped++;
      continue;
    }

    // Fetch agent profile for personalized sign-off
    const { data: profile } = await supabase
      .from("agent_profiles")
      .select("first_name, last_name, phone")
      .eq("user_id", policy.user_id)
      .single();

    const agentName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || undefined
      : undefined;
    const agentEmail = undefined; // cron doesn't know the email — use policy.agent_email if available
    const agentPhone = profile?.phone ?? undefined;

    // Generate final notice
    let notice: { subject: string; body: string };
    try {
      notice = await generateFinalNotice(policy, agentName, agentEmail ?? policy.agent_email, agentPhone);
    } catch (err) {
      console.warn("[cron/final-notice] Claude failed, using fallback:", err instanceof Error ? err.message : err);
      notice = finalNoticeFallback(policy, agentName, agentEmail ?? policy.agent_email);
    }

    // Send via Resend
    let providerId: string | null = null;
    try {
      const { data: sent } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@hollis.ai",
        to: policy.client_email,
        subject: notice.subject,
        text: notice.body,
      });
      providerId = sent?.id ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`${policy.client_name}: ${msg}`);
      results.failed++;
      continue;
    }

    const days = daysUntilExpiry(policy.expiration_date);

    // Log send
    await supabase.from("send_logs").insert({
      policy_id: policy.id,
      user_id: policy.user_id,
      channel: "email",
      recipient: policy.client_email,
      status: "sent",
      provider_message_id: providerId,
      sent_at: new Date().toISOString(),
    });

    // Insert campaign_touchpoint record
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("campaign_touchpoints").insert({
      policy_id: policy.id,
      user_id: policy.user_id,
      type: "final_notice_7",
      status: "sent",
      subject: notice.subject,
      content: notice.body,
      scheduled_at: today,
      sent_at: new Date().toISOString(),
    });

    // Advance stage
    await supabase
      .from("policies")
      .update({ campaign_stage: "final_notice_sent", last_contact_at: today })
      .eq("id", policy.id);

    // Write audit log
    await writeAuditLog({
      supabase,
      policy_id: policy.id,
      user_id: policy.user_id,
      event_type: "final_notice_sent",
      channel: "email",
      recipient: policy.client_email,
      content_snapshot: `Subject: ${notice.subject}\n\n${notice.body}`,
      metadata: {
        days_remaining: days,
        provider_id: providerId,
        expiration_date: policy.expiration_date,
      },
      actor_type: "system",
    });

    results.sent++;
  }

  if (runId) {
    await supabase
      .from("cron_job_runs")
      .update({
        status: "complete",
        finished_at: new Date().toISOString(),
        processed: results.processed,
        sent: results.sent,
        skipped: results.skipped,
        failed: results.failed,
        error_summary: results.errors.length ? results.errors.join("; ") : null,
      })
      .eq("id", runId);
  }

  console.log("[cron/final-notice] Done:", results);
  return NextResponse.json(results);
}
