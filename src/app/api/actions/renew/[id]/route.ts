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
import { daysUntilExpiry } from "@/types/renewals";
import { writeAuditLog } from "@/lib/audit/log";
import { resolveTierRouting } from "@/lib/renewals/tier-routing";

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
  questionnaire_90: "questionnaire_sent",
  submission_60: "submission_sent",
  recommendation_30: "recommendation_sent",
  final_notice_7: "final_notice_sent",
};

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const body = await _request.json().catch(() => ({}));
  const override = body?.override === true;

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

  // ── Tier routing gate ─────────────────────────────────────────────────────
  const daysToExpiry = daysUntilExpiry(policy.expiration_date);
  const tierResult = await resolveTierRouting(supabase, policy, touchpointType, daysToExpiry);

  if (tierResult.tier === 3) {
    return NextResponse.json(
      { blocked: true, tier: 3, reason: tierResult.reason },
      { status: 403 },
    );
  }
  if (tierResult.tier === 2 && !override) {
    return NextResponse.json(
      { flagged: true, tier: 2, reason: tierResult.reason, mode: tierResult.mode },
      { status: 200 },
    );
  }
  // Tier 1, or Tier 2 with explicit override — proceed to send

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

      const { data: agentProfile } = await supabase
        .from("agent_profiles")
        .select("email_from_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
      const from = agentProfile?.email_from_name
        ? `${agentProfile.email_from_name} <${baseFrom}>`
        : baseFrom;

      const resend = getResendClient();
      const { data: sent } = await resend.emails.send({
        from,
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

  // ── Write to renewal audit log ────────────────────────────────────────────
  await writeAuditLog({
    supabase,
    policy_id: policy.id,
    user_id: user.id,
    event_type: channel === "sms" ? "sms_sent" : "email_sent",
    channel,
    recipient,
    content_snapshot: subject ? `Subject: ${subject}\n\n${content}` : content,
    metadata: {
      touchpoint_id: touchpointId,
      touchpoint_type: touchpointType,
      subject: subject ?? null,
      provider_id: providerId,
      triggered_by: "manual",
      tier: tierResult.tier,
      tier_mode: tierResult.mode,
      override_used: override,
    },
    actor_type: "agent",
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

  // ── Record in parser_outcomes (contributes to learning-mode graduation) ──
  void supabase.from("parser_outcomes").insert({
    renewal_id: policy.id,
    signal_id: null,
    user_id: user.id,
    raw_signal: `manual_send:${touchpointType}`,
    classified_intent: "manual_send",
    confidence_score: 1.0,
    broker_action: "approved",
    final_intent: "manual_send",
    original_body: null,
    edited_body: null,
  });

  return NextResponse.json({
    success: true,
    channel,
    recipient,
    newStage,
  });
}
