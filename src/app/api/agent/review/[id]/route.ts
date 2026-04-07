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
import { logAction, retainStandard } from "@/lib/logAction";

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

    // edited_intent is optional for body-only edits (e.g. draft_and_send_response items
    // where the broker only rewrites the reply body without correcting the intent label).

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

    // ── Execute: broker-approved reply to an inbound client signal ──────────────
    // Handles soft_query items where a draft reply was pre-generated by the
    // signal pipeline. Fires the (optionally edited) reply via Resend.
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "draft_and_send_response"
    ) {
      const payload = (queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload ?? {};
      const subject        = (payload.subject         as string | null) ?? null;
      const body           = (payload.body            as string | null) ?? null;
      const finalBody      = edited_body ?? body;
      const recipientEmail = (payload.recipient_email as string | null) ?? null;

      if (recipientEmail && finalBody) {
        try {
          const resend = getResendClient();

          const { data: brokerProfile } = await admin
            .from("agent_profiles")
            .select("email_from_name, email")
            .eq("user_id", user.id)
            .maybeSingle();

          const baseFrom = process.env.FROM_EMAIL ?? "";
          const from = brokerProfile?.email_from_name
            ? `${brokerProfile.email_from_name} <${baseFrom}>`
            : baseFrom;

          const { data: sent } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: subject ?? "Re: Your renewal enquiry",
            text: finalBody,
            replyTo: (brokerProfile as { email?: string | null } | null)?.email ?? undefined,
          });

          // Log via logAction — skip send_logs (no touchpoint_id for reply emails)
          void logAction({
            broker_id: user.id,
            policy_id: queueItem.policy_id as string,
            action_type: "tier2_reply_sent",
            tier: "2",
            trigger_reason: `Broker ${action === "edited" ? "edited and approved" : "approved"} a soft_query reply — sent to ${recipientEmail}.`,
            payload: {
              subject: subject ?? null,
              body: finalBody,
              recipient: recipientEmail,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
              broker_action: action,
            },
            metadata: {
              queue_item_id: queueItemId,
              signal_id: queueItem.signal_id,
              classified_intent: queueItem.classified_intent,
            },
            outcome: "sent",
            retain_until: retainStandard(),
          });
        } catch (sendErr) {
          // Queue item is already resolved — don't block the response, log the failure.
          console.error(
            "[agent/review] Failed to send draft_and_send_response email:",
            sendErr instanceof Error ? sendErr.message : sendErr
          );
        }
      } else {
        // Missing recipient or body — queue item still resolves, but no email fires.
        console.warn("[agent/review] draft_and_send_response: missing recipient or body — send skipped.");
        void logAction({
          broker_id: user.id,
          policy_id: queueItem.policy_id as string,
          action_type: "tier2_reply_skipped",
          tier: "2",
          trigger_reason: `draft_and_send_response approved but no ${!recipientEmail ? "recipient email" : "body"} — send skipped.`,
          metadata: { queue_item_id: queueItemId },
          outcome: "failed",
          retain_until: retainStandard(),
        });
      }
    }

    // ── Execute: broker confirmed renewal — advance campaign stage ───────────────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "advance_stage"
    ) {
      try {
        await admin
          .from("policies")
          .update({
            campaign_stage: "confirmed",
            client_confirmed_at: resolvedAt,
            last_contact_at: resolvedAt.slice(0, 10),
          })
          .eq("id", queueItem.policy_id as string);

        void logAction({
          broker_id: user.id,
          policy_id: queueItem.policy_id as string,
          action_type: "renewal_stage_transition",
          tier: "2",
          trigger_reason: `Broker approved confirm_renewal — policy advanced to 'confirmed' stage.`,
          metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
          outcome: "sent",
          retain_until: retainStandard(),
        });
      } catch (execErr) {
        console.error(
          "[agent/review] Failed to execute advance_stage:",
          execErr instanceof Error ? execErr.message : execErr
        );
      }
    }

    // ── Execute: broker approved callback request — pause renewal sequence ────────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "create_task_pause_sequence"
    ) {
      try {
        await admin
          .from("policies")
          .update({ renewal_paused: true })
          .eq("id", queueItem.policy_id as string);

        void logAction({
          broker_id: user.id,
          policy_id: queueItem.policy_id as string,
          action_type: "renewal_halted",
          tier: "2",
          trigger_reason: `Broker approved request_callback — renewal sequence paused pending broker callback.`,
          metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
          outcome: "sent",
          retain_until: retainStandard(),
        });
      } catch (execErr) {
        console.error(
          "[agent/review] Failed to execute create_task_pause_sequence:",
          execErr instanceof Error ? execErr.message : execErr
        );
      }
    }

    // ── Execute: broker confirmed document received — close doc-chase requests ────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "log_document"
    ) {
      try {
        await admin
          .from("doc_chase_requests")
          .update({ status: "received", received_at: resolvedAt })
          .eq("policy_id", queueItem.policy_id as string)
          .neq("status", "received");

        void logAction({
          broker_id: user.id,
          policy_id: queueItem.policy_id as string,
          action_type: "document_logged",
          tier: "2",
          trigger_reason: `Broker approved document_received — doc-chase requests closed.`,
          metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
          outcome: "sent",
          retain_until: retainStandard(),
        });
      } catch (execErr) {
        console.error(
          "[agent/review] Failed to execute log_document:",
          execErr instanceof Error ? execErr.message : execErr
        );
      }
    }

    // ── Execute: broker confirmed renewal-with-changes handled ───────────────────
    // broker_change_required is a To Do item — broker makes external changes and
    // marks it done. No DB writes needed beyond queue resolution.
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "broker_change_required"
    ) {
      void logAction({
        broker_id: user.id,
        policy_id: queueItem.policy_id as string,
        action_type: "broker_change_confirmed",
        tier: "2",
        trigger_reason: `Broker confirmed renewal_with_changes has been handled externally.`,
        metadata: {
          queue_item_id: queueItemId,
          signal_id: queueItem.signal_id,
          notes: notes ?? null,
        },
        outcome: "sent",
        retain_until: retainStandard(),
      });
    }

    // ── Execute: broker acknowledged questionnaire submission ─────────────────────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "parse_questionnaire"
    ) {
      void logAction({
        broker_id: user.id,
        policy_id: queueItem.policy_id as string,
        action_type: "questionnaire_logged",
        tier: "2",
        trigger_reason: `Broker acknowledged questionnaire_submitted signal.`,
        metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
        outcome: "classified",
        retain_until: retainStandard(),
      });
    }

    // ── Execute: verification email for unverified third-party contact ────────────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "send_verification_email"
    ) {
      const payload = (queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload ?? {};
      const subject        = (payload.subject         as string | null) ?? null;
      const body           = (payload.body            as string | null) ?? null;
      const finalBody      = edited_body ?? body;
      const recipientEmail = (payload.recipient_email as string | null) ?? null;

      if (recipientEmail && finalBody) {
        try {
          const resend = getResendClient();

          const { data: brokerProfile } = await admin
            .from("agent_profiles")
            .select("email_from_name, email")
            .eq("user_id", user.id)
            .maybeSingle();

          const baseFrom = process.env.FROM_EMAIL ?? "";
          const from = brokerProfile?.email_from_name
            ? `${brokerProfile.email_from_name} <${baseFrom}>`
            : baseFrom;

          const { data: sent } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: subject ?? "Identity verification required",
            text: finalBody,
            replyTo: (brokerProfile as { email?: string | null } | null)?.email ?? undefined,
          });

          void logAction({
            broker_id: user.id,
            policy_id: queueItem.policy_id as string,
            action_type: "tier2_verification_sent",
            tier: "2",
            trigger_reason: `Broker approved verification email — sent to ${recipientEmail}.`,
            payload: {
              subject: subject ?? null,
              body: finalBody,
              recipient: recipientEmail,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
            outcome: "sent",
            retain_until: retainStandard(),
          });
        } catch (sendErr) {
          console.error(
            "[agent/review] Failed to send send_verification_email:",
            sendErr instanceof Error ? sendErr.message : sendErr
          );
        }
      } else {
        void logAction({
          broker_id: user.id,
          policy_id: queueItem.policy_id as string,
          action_type: "tier2_verification_skipped",
          tier: "2",
          trigger_reason: `send_verification_email approved but no ${!recipientEmail ? "recipient email" : "body"} in payload — send skipped.`,
          metadata: { queue_item_id: queueItemId },
          outcome: "failed",
          retain_until: retainStandard(),
        });
      }
    }

    // ── Execute: fallback advance_sequence — log only ─────────────────────────────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "advance_sequence"
    ) {
      void logAction({
        broker_id: user.id,
        policy_id: queueItem.policy_id as string,
        action_type: "tier2_action_executed",
        tier: "2",
        trigger_reason: `Broker approved fallback advance_sequence action for intent "${queueItem.classified_intent}".`,
        metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
        outcome: "sent",
        retain_until: retainStandard(),
      });
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
