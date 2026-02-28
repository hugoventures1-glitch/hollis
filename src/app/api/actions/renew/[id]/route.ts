/**
 * POST /api/actions/renew/[id]
 *
 * Fires the next campaign touchpoint for a policy immediately —
 * regardless of schedule. Equivalent to a single manual cron-job run
 * for this specific policy only.
 *
 * Returns:
 *   { success: true, channel: string, recipient: string, newStage: string }
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { sendSMS } from "@/lib/twilio/client";
import {
  generateRenewalEmail,
  generateSMSMessage,
  generateCallScript,
} from "@/lib/renewals/generate";
import type { Policy, CampaignStage, TouchpointType } from "@/types/renewals";

// Campaign stage → next touchpoint type mapping
const STAGE_TO_TOUCHPOINT: Partial<Record<CampaignStage, TouchpointType>> = {
  pending: "email_90",
  email_90_sent: "email_60",
  email_60_sent: "sms_30",
  sms_30_sent: "script_14",
};

// Touchpoint type → next policy stage
const TOUCHPOINT_TO_STAGE: Record<TouchpointType, CampaignStage> = {
  email_90: "email_90_sent",
  email_60: "email_60_sent",
  sms_30: "sms_30_sent",
  script_14: "script_14_ready",
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Fetch policy (scoped to user) ─────────────────────────────────────────
  const { data: policyData, error: policyErr } = await supabase
    .from("policies")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (policyErr || !policyData) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const policy = policyData as Policy;

  if (policy.status !== "active") {
    return NextResponse.json(
      { error: `Policy is ${policy.status}, not active` },
      { status: 400 }
    );
  }

  // ── Handle "Mark Complete" for script_14_ready stage ─────────────────────
  if (policy.campaign_stage === "script_14_ready") {
    const { error: updateErr } = await supabase
      .from("policies")
      .update({ campaign_stage: "complete" })
      .eq("id", policy.id)
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      channel: "internal",
      recipient: policy.client_name,
      newStage: "complete",
    });
  }

  if (policy.campaign_stage === "complete") {
    return NextResponse.json(
      { error: "Campaign is already complete" },
      { status: 400 }
    );
  }

  const touchpointType = STAGE_TO_TOUCHPOINT[policy.campaign_stage];
  if (!touchpointType) {
    return NextResponse.json(
      { error: `No next action available for stage: ${policy.campaign_stage}` },
      { status: 400 }
    );
  }

  // ── Find or create the campaign touchpoint record ─────────────────────────
  const today = new Date().toISOString().split("T")[0];

  let touchpointId: string;
  const { data: existing } = await supabase
    .from("campaign_touchpoints")
    .select("id")
    .eq("policy_id", policy.id)
    .eq("type", touchpointType)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    touchpointId = existing.id;
  } else {
    // Create touchpoint on-the-fly for manual sends
    const { data: created, error: createErr } = await supabase
      .from("campaign_touchpoints")
      .insert({
        policy_id: policy.id,
        user_id: user.id,
        type: touchpointType,
        status: "pending",
        scheduled_at: today,
      })
      .select("id")
      .single();

    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create touchpoint" },
        { status: 500 }
      );
    }
    touchpointId = created.id;
  }

  // ── Generate content and send ─────────────────────────────────────────────
  let channel: "email" | "sms" = "email";
  let recipient: string = policy.client_email ?? policy.client_name;
  let providerId: string | null = null;
  let subject: string | null = null;
  let content: string | null = null;

  try {
    if (touchpointType === "email_90" || touchpointType === "email_60") {
      if (!policy.client_email) {
        return NextResponse.json(
          { error: `No email address on record for ${policy.client_name}` },
          { status: 400 }
        );
      }
      const generated = await generateRenewalEmail(policy, touchpointType);
      subject = generated.subject;
      content = generated.body;

      const resend = getResendClient();
      const { data: sent } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@hollis.ai",
        to: policy.client_email,
        subject,
        text: content,
      });
      providerId = sent?.id ?? null;
      channel = "email";
      recipient = policy.client_email;
    } else if (touchpointType === "sms_30") {
      if (!policy.client_phone) {
        return NextResponse.json(
          { error: `No phone number on record for ${policy.client_name}` },
          { status: 400 }
        );
      }
      content = await generateSMSMessage(policy);
      providerId = await sendSMS(policy.client_phone, content);
      channel = "sms";
      recipient = policy.client_phone;
    } else if (touchpointType === "script_14") {
      // Generate call script and store — no external send
      content = await generateCallScript(policy);
      channel = "email"; // logged as internal
      recipient = policy.client_name;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Update touchpoint to sent ─────────────────────────────────────────────
  await supabase
    .from("campaign_touchpoints")
    .update({
      status: "sent",
      subject,
      content,
      sent_at: new Date().toISOString(),
    })
    .eq("id", touchpointId);

  // ── Log the send ──────────────────────────────────────────────────────────
  await supabase.from("send_logs").insert({
    policy_id: policy.id,
    touchpoint_id: touchpointId,
    user_id: user.id,
    channel,
    recipient,
    status: "sent",
    provider_message_id: providerId,
    sent_at: new Date().toISOString(),
  });

  // ── Advance campaign stage ────────────────────────────────────────────────
  const newStage = TOUCHPOINT_TO_STAGE[touchpointType];
  await supabase
    .from("policies")
    .update({
      campaign_stage: newStage,
      last_contact_at: new Date().toISOString(),
    })
    .eq("id", policy.id)
    .eq("user_id", user.id);

  return NextResponse.json({
    success: true,
    channel,
    recipient,
    newStage,
  });
}
