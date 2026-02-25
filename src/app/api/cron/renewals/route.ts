/**
 * GET /api/cron/renewals
 *
 * Daily cron job — checks all active policies and fires due campaign touchpoints.
 * Protected by CRON_SECRET header. Runs as service role (bypasses RLS).
 *
 * Vercel schedule: 0 9 * * * (9 AM UTC daily)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend/client";
import { sendSMS } from "@/lib/twilio/client";
import {
  generateRenewalEmail,
  generateSMSMessage,
  generateCallScript,
} from "@/lib/renewals/generate";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignTouchpoint, TouchpointType } from "@/types/renewals";

const STAGE_MAP: Record<TouchpointType, Policy["campaign_stage"]> = {
  email_90: "email_90_sent",
  email_60: "email_60_sent",
  sms_30: "sms_30_sent",
  script_14: "script_14_ready",
};

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const resend = getResendClient();
  const today = new Date().toISOString().split("T")[0];

  // Fetch all active policies
  const { data: policies, error: policiesError } = await supabase
    .from("policies")
    .select("*")
    .eq("status", "active")
    .neq("campaign_stage", "complete");

  if (policiesError) {
    console.error("[cron] Failed to fetch policies:", policiesError.message);
    return NextResponse.json({ error: policiesError.message }, { status: 500 });
  }

  const results = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const policy of policies as Policy[]) {
    results.processed++;
    const days = daysUntilExpiry(policy.expiration_date);

    // Mark expired policies
    if (days < 0) {
      await supabase
        .from("policies")
        .update({ status: "expired" })
        .eq("id", policy.id);
      continue;
    }

    // Determine which touchpoint types are due today
    const dueTouchpointTypes: TouchpointType[] = [];
    if (days <= 90 && policy.campaign_stage === "pending")       dueTouchpointTypes.push("email_90");
    if (days <= 60 && policy.campaign_stage === "email_90_sent") dueTouchpointTypes.push("email_60");
    if (days <= 30 && policy.campaign_stage === "email_60_sent") dueTouchpointTypes.push("sms_30");
    if (days <= 14 && policy.campaign_stage === "sms_30_sent")   dueTouchpointTypes.push("script_14");

    for (const type of dueTouchpointTypes) {
      // Find the pending touchpoint
      const { data: touchpoint } = await supabase
        .from("campaign_touchpoints")
        .select("*")
        .eq("policy_id", policy.id)
        .eq("type", type)
        .eq("status", "pending")
        .single();

      if (!touchpoint) {
        results.skipped++;
        continue;
      }

      try {
        await fireTouchpoint(
          supabase,
          resend,
          policy,
          touchpoint as CampaignTouchpoint,
          type,
          today
        );
        results.sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${policy.client_name} / ${type}: ${msg}`);
        results.failed++;

        // Mark touchpoint as failed
        await supabase
          .from("campaign_touchpoints")
          .update({ status: "failed" })
          .eq("id", touchpoint.id);
      }
    }
  }

  console.log("[cron] Done:", results);
  return NextResponse.json(results);
}

// ── Fire a single touchpoint ─────────────────────────────────

async function fireTouchpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resend: any,
  policy: Policy,
  touchpoint: CampaignTouchpoint,
  type: TouchpointType,
  today: string
) {
  let providerId: string | null = null;
  let subject: string | null = null;
  let content: string | null = null;
  let channel: "email" | "sms" = "email";

  if (type === "email_90" || type === "email_60") {
    const generated = await generateRenewalEmail(policy, type);
    subject = generated.subject;
    content = generated.body;

    const { data: sent } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@hollis.ai",
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
    content = await generateSMSMessage(policy);
    providerId = await sendSMS(policy.client_phone, content);
    channel = "sms";
  } else if (type === "script_14") {
    // Generate script and store — no external send
    content = await generateCallScript(policy);
    channel = "email"; // logged as internal
  }

  // Update touchpoint
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

  // Advance policy campaign stage
  const newStage = STAGE_MAP[type];
  await supabase
    .from("policies")
    .update({
      campaign_stage: newStage,
      last_contact_at: new Date().toISOString(),
    })
    .eq("id", policy.id);
}
