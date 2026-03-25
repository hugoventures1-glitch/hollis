/**
 * PATCH /api/agent/review/[id]
 *
 * Step 7 + 8: Broker resolves a Tier 2 approval queue item.
 *
 * Actions:
 *   - approved: broker accepts the proposed action as-is
 *   - rejected: broker rejects, no action taken
 *   - edited:   broker modifies the intent/action before approving
 *
 * Side effects (Step 8 — learning layer):
 *   - Every resolution writes a record to parser_outcomes so the classifier
 *     learns from broker decisions via few-shot injection on the next signal.
 *   - approved/edited outcomes become few-shot examples for the next classifier call.
 *
 * Step 10 — Audit log:
 *   - Every resolution is written to renewal_audit_log.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { getResendClient } from "@/lib/resend/client";
import { sendSMS } from "@/lib/twilio/client";

const RequestSchema = z.object({
  action: z.enum(["approved", "rejected", "edited"]),
  edited_intent: z.string().optional(),   // required when action = 'edited'
  notes: z.string().max(1000).optional(),
  edited_body: z.string().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: queueItemId } = await params;

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

    const { action, edited_intent, notes, edited_body } = parsed.data;

    if (action === "edited" && !edited_intent) {
      return NextResponse.json(
        { error: "edited_intent is required when action is 'edited'" },
        { status: 400 }
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch approval queue item (RLS enforces ownership) ───────────────────────
    const { data: queueItem, error: fetchError } = await supabase
      .from("approval_queue")
      .select("id, policy_id, user_id, signal_id, classified_intent, confidence_score, raw_signal_snippet, proposed_action, status")
      .eq("id", queueItemId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
    }

    if (queueItem.status !== "pending") {
      return NextResponse.json(
        { error: `Queue item is already ${queueItem.status}` },
        { status: 409 }
      );
    }

    const resolvedAt = new Date().toISOString();
    const finalIntent =
      action === "edited" && edited_intent
        ? edited_intent
        : (queueItem.classified_intent as string);

    // ── Update approval_queue record ─────────────────────────────────────────────
    await supabase
      .from("approval_queue")
      .update({
        status: action,
        broker_decision: {
          action,
          edited_intent: edited_intent ?? null,
          notes: notes ?? null,
          edited_body: edited_body ?? null,
        },
        resolved_at: resolvedAt,
      })
      .eq("id", queueItemId);

    // ── Step 8: Write to parser_outcomes (learning layer) ────────────────────────
    // Approved and edited outcomes become few-shot examples for the next signal.
    // Rejected outcomes are recorded but excluded from few-shot injection.
    const admin = createAdminClient();

    await supabase
      .from("parser_outcomes")
      .insert({
        renewal_id: queueItem.policy_id,
        signal_id: queueItem.signal_id,
        user_id: user.id,
        raw_signal: queueItem.raw_signal_snippet,
        classified_intent: queueItem.classified_intent,
        confidence_score: queueItem.confidence_score,
        broker_action: action,
        final_intent: finalIntent,
        original_body: ((queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload?.body as string | undefined) ?? null,
        edited_body: edited_body ?? null,
      });

    // ── Step 10: Write audit log ─────────────────────────────────────────────────
    const actionLabels: Record<string, string> = {
      approved: "Broker approved the proposed action",
      rejected: "Broker rejected the proposed action",
      edited: `Broker edited intent to "${finalIntent}"`,
    };

    await writeAuditLog({
      supabase: admin,
      policy_id: queueItem.policy_id as string,
      user_id: user.id,
      event_type: "tier_2_drafted",   // re-uses tier_2_drafted; metadata differentiates resolution
      channel: "internal",
      content_snapshot: queueItem.raw_signal_snippet as string,
      metadata: {
        queue_item_id: queueItemId,
        signal_id: queueItem.signal_id,
        classified_intent: queueItem.classified_intent,
        final_intent: finalIntent,
        broker_action: action,
        confidence_score: queueItem.confidence_score,
        resolution: actionLabels[action],
        notes: notes ?? null,
        resolved_at: resolvedAt,
      },
      actor_type: "agent",
    });

    // ── Execute the proposed action when broker approves or edits ────────────────
    // For outbound renewal emails/SMS queued by the cron's Tier 2 routing,
    // the proposed_action.payload contains the pre-generated draft content.
    // We fire it now, exactly as the cron would have done autonomously.
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "send_renewal_email"
    ) {
      const payload = (queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload ?? {};
      const touchpointId   = (payload.touchpoint_id   as string  | null) ?? null;
      const touchpointType = (payload.touchpoint_type as string  | null) ?? null;
      const channel        = (payload.channel         as string) ?? "email";
      const subject        = (payload.subject         as string  | null) ?? null;
      const body           = (payload.body            as string  | null) ?? null;
      const finalBody      = edited_body ?? body;
      const recipientEmail = (payload.recipient_email as string  | null) ?? null;
      const recipientPhone = (payload.recipient_phone as string  | null) ?? null;

      const STAGE_MAP: Record<string, string> = {
        email_90:  "email_90_sent",
        email_60:  "email_60_sent",
        sms_30:    "sms_30_sent",
        script_14: "script_14_ready",
      };

      try {
        if (channel === "email" && recipientEmail && finalBody) {
          const resend = getResendClient();

          const { data: brokerProfile } = await admin
            .from("agent_profiles")
            .select("email_from_name")
            .eq("user_id", user.id)
            .maybeSingle();

          const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
          const from = brokerProfile?.email_from_name
            ? `${brokerProfile.email_from_name} <${baseFrom}>`
            : baseFrom;

          const { data: sent } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: subject ?? "Renewal reminder",
            text: finalBody,
          });

          if (touchpointId) {
            await admin
              .from("campaign_touchpoints")
              .update({ status: "sent", subject, content: finalBody, sent_at: resolvedAt })
              .eq("id", touchpointId);
          }

          await admin.from("send_logs").insert({
            policy_id: queueItem.policy_id,
            touchpoint_id: touchpointId,
            user_id: user.id,
            channel: "email",
            recipient: recipientEmail,
            status: "sent",
            provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            sent_at: resolvedAt,
          });

          if (touchpointType && STAGE_MAP[touchpointType]) {
            await admin
              .from("policies")
              .update({
                campaign_stage: STAGE_MAP[touchpointType],
                last_contact_at: resolvedAt.slice(0, 10),
              })
              .eq("id", queueItem.policy_id as string);
          }
        } else if (channel === "sms" && recipientPhone && finalBody) {
          await sendSMS(recipientPhone, finalBody);

          if (touchpointId) {
            await admin
              .from("campaign_touchpoints")
              .update({ status: "sent", content: finalBody, sent_at: resolvedAt })
              .eq("id", touchpointId);
          }

          await admin.from("send_logs").insert({
            policy_id: queueItem.policy_id,
            touchpoint_id: touchpointId,
            user_id: user.id,
            channel: "sms",
            recipient: recipientPhone,
            status: "sent",
            sent_at: resolvedAt,
          });

          if (touchpointType && STAGE_MAP[touchpointType]) {
            await admin
              .from("policies")
              .update({
                campaign_stage: STAGE_MAP[touchpointType],
                last_contact_at: resolvedAt.slice(0, 10),
              })
              .eq("id", queueItem.policy_id as string);
          }
        }
      } catch (sendErr) {
        // Don't fail the resolution — queue item is already marked approved.
        // Log the error and let the broker retry manually if needed.
        console.error(
          "[agent/review] Failed to execute approved send:",
          sendErr instanceof Error ? sendErr.message : sendErr
        );
      }
    }

    // When broker rejects, mark the touchpoint skipped so the cron doesn't
    // keep attempting to fire it on subsequent runs.
    if (action === "rejected") {
      const payload = (queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload ?? {};
      const touchpointId = (payload.touchpoint_id as string | null) ?? null;
      if (touchpointId) {
        await admin
          .from("campaign_touchpoints")
          .update({ status: "skipped" })
          .eq("id", touchpointId);
      }
    }

    return NextResponse.json({
      id: queueItemId,
      status: action,
      final_intent: finalIntent,
      resolved_at: resolvedAt,
    });
  } catch (err) {
    console.error("[agent/review] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
