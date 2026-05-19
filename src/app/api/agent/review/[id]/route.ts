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
import { LEARNING_MODE_THRESHOLD } from "@/lib/agent/tier-constants";
import { buildReplyHeaders, normalizeReplySubject } from "@/lib/email/threading";

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
    .select("id, policy_id, user_id, signal_id, classified_intent, confidence_score, raw_signal_snippet, proposed_action, status, doc_chase_request_id, in_reply_to, email_references, thread_index, thread_topic")
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

      // Re-fetch current client contact details so changes made after the draft
      // was created are reflected in the actual send — never use stale payload values.
      const { data: livePolicy } = await admin
        .from("policies")
        .select("client_email, client_phone")
        .eq("id", queueItem.policy_id as string)
        .maybeSingle();

      const recipientEmail = livePolicy?.client_email ?? (payload.recipient_email as string | null) ?? null;
      const recipientPhone = livePolicy?.client_phone ?? (payload.recipient_phone as string | null) ?? null;

      const STAGE_MAP: Record<string, string> = {
        email_90:          "email_90_sent",
        email_60:          "email_60_sent",
        sms_30:            "sms_30_sent",
        script_14:         "script_14_ready",
        submission_60:     "submission_sent",
        recommendation_30: "recommendation_sent",
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

          const { data: sent, error: resendError } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: subject ?? "Renewal reminder",
            text: finalBody,
          });
          if (resendError) throw new Error(resendError.message ?? "Resend failed");

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

          await writeAuditLog({
            supabase: admin,
            policy_id: queueItem.policy_id as string,
            user_id: user.id,
            event_type: "email_sent",
            channel: "email",
            recipient: recipientEmail,
            content_snapshot: subject ? `Subject: ${subject}\n\n${finalBody ?? ""}` : (finalBody ?? ""),
            metadata: {
              queue_item_id: queueItemId,
              touchpoint_id: touchpointId,
              touchpoint_type: touchpointType,
              subject: subject ?? null,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            actor_type: "agent",
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

          await writeAuditLog({
            supabase: admin,
            policy_id: queueItem.policy_id as string,
            user_id: user.id,
            event_type: "sms_sent",
            channel: "sms",
            recipient: recipientPhone,
            content_snapshot: finalBody ?? "",
            metadata: {
              queue_item_id: queueItemId,
              touchpoint_id: touchpointId,
              touchpoint_type: touchpointType,
            },
            actor_type: "agent",
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
        console.error(
          "[agent/review] Failed to execute approved send:",
          sendErr instanceof Error ? sendErr.message : sendErr
        );
        // Revert queue item to pending so broker sees the failure and can retry.
        // Use admin client — session-scoped supabase client may be stale after async Resend call.
        await admin
          .from("approval_queue")
          .update({ status: "pending", broker_decision: null, resolved_at: null })
          .eq("id", queueItemId);
        return NextResponse.json(
          { error: sendErr instanceof Error ? sendErr.message : "Email send failed" },
          { status: 500 }
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
      let   inboundSubject = (payload.inbound_subject as string | null) ?? null;
      const body           = (payload.body            as string | null) ?? null;
      const finalBody      = edited_body ?? body;
      const recipientEmail = (payload.recipient_email as string | null) ?? null;

      // Fallback: look up subject from inbound_signals for items created before the
      // inbound_subject pipeline was wired up (payload.inbound_subject will be null).
      if (!inboundSubject && queueItem.signal_id) {
        const { data: signalRow } = await admin
          .from("inbound_signals")
          .select("subject")
          .eq("id", queueItem.signal_id as string)
          .maybeSingle();
        inboundSubject = (signalRow as { subject?: string | null } | null)?.subject ?? null;
      }

      if (recipientEmail && finalBody) {
        try {
          const resend = getResendClient();

          const { data: brokerProfile } = await admin
            .from("agent_profiles")
            .select("email_from_name, signal_token")
            .eq("user_id", user.id)
            .maybeSingle();

          const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
          const from = brokerProfile?.email_from_name
            ? `${brokerProfile.email_from_name} <${baseFrom}>`
            : baseFrom;
          const replyTo = process.env.INBOUND_EMAIL
            ?? ((brokerProfile as { signal_token?: string | null } | null)?.signal_token
              ? `${(brokerProfile as { signal_token: string }).signal_token}@ildaexi.resend.app`
              : undefined);

          const replySubject = normalizeReplySubject(inboundSubject ?? subject);
          const { data: sent, error: resendError } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: replySubject,
            text: finalBody,
            replyTo,
            headers: buildReplyHeaders({
              messageId: queueItem.in_reply_to as string | null,
              referencesHeaders: queueItem.email_references as string | null,
              threadIndex: (queueItem as Record<string, unknown>).thread_index as string | null ?? null,
              threadTopic: (queueItem as Record<string, unknown>).thread_topic as string | null ?? null,
              subject: inboundSubject ?? subject,
            }),
          });
          if (resendError) throw new Error(resendError.message ?? "Resend failed");

          await admin.from("send_logs").insert({
            policy_id: queueItem.policy_id,
            touchpoint_id: null,
            user_id: user.id,
            channel: "email",
            recipient: recipientEmail,
            status: "sent",
            provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            sent_at: resolvedAt,
          });

          await writeAuditLog({
            supabase: admin,
            policy_id: queueItem.policy_id as string,
            user_id: user.id,
            event_type: "email_sent",
            channel: "email",
            recipient: recipientEmail,
            content_snapshot: subject ? `Subject: ${replySubject}\n\n${finalBody ?? ""}` : (finalBody ?? ""),
            metadata: {
              queue_item_id: queueItemId,
              subject: replySubject ?? null,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            actor_type: "agent",
          });

          // Log via logAction
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
          console.error(
            "[agent/review] Failed to send draft_and_send_response email:",
            sendErr instanceof Error ? sendErr.message : sendErr
          );
          // Revert queue item to pending so broker sees the failure and can retry.
          // Use admin client — session-scoped supabase client may be stale after async Resend call.
          await admin
            .from("approval_queue")
            .update({ status: "pending", broker_decision: null, resolved_at: null })
            .eq("id", queueItemId);
          return NextResponse.json(
            { error: sendErr instanceof Error ? sendErr.message : "Email send failed" },
            { status: 500 }
          );
        }
      } else {
        // Missing recipient or body — revert and surface as an error so broker knows.
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
        await admin
          .from("approval_queue")
          .update({ status: "pending", broker_decision: null, resolved_at: null })
          .eq("id", queueItemId);
        return NextResponse.json(
          { error: `No ${!recipientEmail ? "recipient email" : "body"} in payload — send skipped` },
          { status: 500 }
        );
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

        // Auto-reject any other pending queue items for this policy — renewal is done
        await admin
          .from("approval_queue")
          .update({ status: "rejected" })
          .eq("policy_id", queueItem.policy_id as string)
          .neq("id", queueItemId)
          .eq("status", "pending");

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

        // Send thank-you acknowledgment to the client — mirrors the Tier 1 path
        // in process-signal.ts. Wrapped in its own try/catch so a Resend failure
        // never blocks the confirmation that already happened above.
        let confirmedPolicy: { client_email: string | null; client_name: string; policy_name: string; carrier: string | null; agent_name: string | null; agent_email: string | null; expiration_date: string | null; premium: number | null } | null = null;
        try {
          const { data: policyData, error: policyFetchErr } = await admin
            .from("policies")
            .select("client_name, client_email, policy_name, carrier, agent_name, agent_email, expiration_date, premium")
            .eq("id", queueItem.policy_id as string)
            .maybeSingle();
          if (policyFetchErr) console.error("[agent/review] Policy fetch failed:", policyFetchErr.message, policyFetchErr);
          confirmedPolicy = policyData ?? null;

          const { data: confirmedProfile, error: profileFetchErr } = await admin
            .from("agent_profiles")
            .select("email_from_name, signal_token, standing_orders")
            .eq("user_id", user.id)
            .maybeSingle();
          if (profileFetchErr) console.error("[agent/review] Profile fetch failed:", profileFetchErr.message, profileFetchErr);

          // Fall back to sender_email from the inbound signal if client_email is missing
          let recipientEmail = confirmedPolicy?.client_email ?? null;
          if (!recipientEmail && queueItem.signal_id) {
            const { data: signalRow } = await admin
              .from("inbound_signals")
              .select("sender_email")
              .eq("id", queueItem.signal_id as string)
              .maybeSingle();
            recipientEmail = (signalRow as { sender_email?: string | null } | null)?.sender_email ?? null;
            if (recipientEmail) console.log("[agent/review] Using signal sender_email as fallback recipient:", recipientEmail);
          }

          if (!recipientEmail) {
            console.warn("[agent/review] confirm_renewal ack skipped — no recipient email found", {
              policyId: queueItem.policy_id,
              clientEmail: confirmedPolicy?.client_email ?? null,
              signalId: queueItem.signal_id,
            });
          }

          if (confirmedPolicy && recipientEmail) {
            const { generateAckEmail } = await import("@/lib/agent/responder");
            const draft = await generateAckEmail("confirm_renewal", confirmedPolicy as Parameters<typeof generateAckEmail>[1], {
              standingOrders: (confirmedProfile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
            });

            const resend = getResendClient();
            const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
            const from = confirmedProfile?.email_from_name
              ? `${confirmedProfile.email_from_name} <${baseFrom}>`
              : baseFrom;

            const replySubject = draft.subject && /^Re:\s*/i.test(draft.subject)
              ? draft.subject
              : `Re: ${draft.subject ?? "Your renewal"}`;

            const { data: sent, error: resendError } = await resend.emails.send({
              from,
              to: recipientEmail,
              subject: replySubject,
              text: draft.body,
              replyTo: process.env.INBOUND_EMAIL
                ?? ((confirmedProfile as { signal_token?: string | null } | null)?.signal_token
                  ? `${(confirmedProfile as { signal_token: string }).signal_token}@ildaexi.resend.app`
                  : undefined),
            });
            if (resendError) throw new Error(resendError.message ?? "Resend failed");

            await admin.from("send_logs").insert({
              policy_id: queueItem.policy_id,
              touchpoint_id: null,
              user_id: user.id,
              channel: "email",
              recipient: recipientEmail,
              status: "sent",
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
              sent_at: resolvedAt,
            });

            await writeAuditLog({
              supabase: admin,
              policy_id: queueItem.policy_id as string,
              user_id: user.id,
              event_type: "email_sent",
              channel: "email",
              recipient: recipientEmail,
              content_snapshot: draft.subject ? `Subject: ${replySubject}\n\n${draft.body}` : draft.body,
              metadata: {
                queue_item_id: queueItemId,
                subject: replySubject ?? null,
                provider_message_id: (sent as { id?: string } | null)?.id ?? null,
                intent: "confirm_renewal",
              },
              actor_type: "agent",
            });

            void logAction({
              broker_id: user.id,
              policy_id: queueItem.policy_id as string,
              action_type: "tier2_ack_sent_confirm_renewal",
              tier: "2",
              trigger_reason: `Thank-you acknowledgment sent to ${recipientEmail} after broker confirmed renewal.`,
              payload: {
                subject: draft.subject,
                body: draft.body,
                recipient: recipientEmail,
                provider_message_id: (sent as { id?: string } | null)?.id ?? null,
              },
              metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
              outcome: "sent",
              retain_until: retainStandard(),
            });
          }
        } catch (ackErr) {
          console.error(
            "[agent/review] Failed to send confirm_renewal thank-you email:",
            ackErr instanceof Error ? ackErr.message : ackErr,
            { recipientEmail: confirmedPolicy?.client_email ?? null, policyId: queueItem.policy_id }
          );
        }
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

    // ── Execute: broker approved close_doc_chase — mark specific chase received ──
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "close_doc_chase"
    ) {
      try {
        const chaseId = (queueItem as { doc_chase_request_id?: string | null }).doc_chase_request_id;
        if (chaseId) {
          await admin
            .from("doc_chase_requests")
            .update({ status: "received", received_at: resolvedAt })
            .eq("id", chaseId);
        }

        void logAction({
          broker_id: user.id,
          policy_id: queueItem.policy_id as string,
          action_type: "doc_chase_closed",
          tier: "2",
          trigger_reason: `Broker approved close_doc_chase — doc-chase request marked received.`,
          metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id, doc_chase_request_id: chaseId },
          outcome: "sent",
          retain_until: retainStandard(),
        });
      } catch (execErr) {
        console.error(
          "[agent/review] Failed to execute close_doc_chase:",
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
        // Close policy-linked doc chases
        await admin
          .from("doc_chase_requests")
          .update({ status: "received", received_at: resolvedAt })
          .eq("policy_id", queueItem.policy_id as string)
          .neq("status", "received");

        // Also close standalone doc chases (no policy_id) matched by sender email.
        // Mirrors the Tier 1 path in process-signal.ts lines 319-340.
        if (queueItem.signal_id) {
          const { data: signalRow } = await admin
            .from("inbound_signals")
            .select("sender_email")
            .eq("id", queueItem.signal_id as string)
            .maybeSingle();
          const senderEmail = signalRow?.sender_email ?? null;
          if (senderEmail) {
            await admin
              .from("doc_chase_requests")
              .update({ status: "received", received_at: resolvedAt })
              .eq("client_email", senderEmail)
              .is("policy_id", null)
              .neq("status", "received");
          }
        }

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

    // ── Execute: broker approved document required — create doc chase request ──────
    // The renewal agent surfaced a missing document. Broker approved. We now create
    // the full doc_chase_request + sequence + 4 messages using the same logic as
    // POST /api/doc-chase, but via admin client so it can run server-side.
    if (
      (action === "approved" || action === "edited") &&
      (queueItem.proposed_action as { action_type?: string })?.action_type === "create_doc_chase_request"
    ) {
      const payload = (queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload ?? {};
      const documentType = (payload.document_type as string | null) ?? null;

      try {
        const { data: policy } = await admin
          .from("policies")
          .select("client_name, client_email, client_phone, expiration_date, agent_name, agent_email")
          .eq("id", queueItem.policy_id as string)
          .single();

        if (policy && documentType) {
          const { draftDocumentChaseSequence } = await import("@/lib/doc-chase/generate");

          // Fetch broker email signature
          const { data: reviewBrokerProfile } = await admin
            .from("agent_profiles")
            .select("email_signature")
            .eq("user_id", user.id)
            .maybeSingle();

          // Compute days until expiry for touch cadence
          let daysUntilExpiry: number | null = null;
          if (policy.expiration_date) {
            const exp = new Date((policy.expiration_date as string) + "T00:00:00");
            const nowDate = new Date();
            nowDate.setHours(0, 0, 0, 0);
            daysUntilExpiry = Math.ceil((exp.getTime() - nowDate.getTime()) / 86_400_000);
          }

          const touchDelays: [number, number, number, number] =
            daysUntilExpiry !== null && daysUntilExpiry <= 7  ? [0, 1, 2, 4]  :
            daysUntilExpiry !== null && daysUntilExpiry <= 14 ? [0, 2, 4, 7]  :
            daysUntilExpiry !== null && daysUntilExpiry <= 30 ? [0, 3, 6, 12] :
            daysUntilExpiry !== null && daysUntilExpiry <= 60 ? [0, 5, 10, 20] :
            [0, 7, 14, 28];

          const chaseNotes = (payload.notes as string | null) ?? null;

          const touches = await draftDocumentChaseSequence(
            policy.client_name as string,
            documentType,
            (policy.agent_name as string | null) ?? "Your Agent",
            (policy.agent_email as string | null) ?? (process.env.FROM_EMAIL ?? ""),
            chaseNotes,
            (policy.client_phone as string | null) ?? null,
            daysUntilExpiry,
            reviewBrokerProfile?.email_signature ?? null
          );

          const { data: chaseReq } = await admin
            .from("doc_chase_requests")
            .insert({
              user_id: user.id,
              client_name: policy.client_name,
              client_email: (policy.client_email as string).toLowerCase(),
              client_phone: (policy.client_phone as string | null) ?? null,
              document_type: documentType,
              policy_id: queueItem.policy_id,
              notes: chaseNotes,
              status: "active",
              escalation_level: "email",
            })
            .select()
            .single();

          if (chaseReq) {
            const { data: chaseSeq } = await admin
              .from("doc_chase_sequences")
              .insert({ user_id: user.id, request_id: chaseReq.id, sequence_status: "active" })
              .select()
              .single();

            if (chaseSeq) {
              const now = new Date();
              await admin.from("doc_chase_messages").insert(
                touches.map((touch, i) => ({
                  sequence_id: chaseSeq.id,
                  touch_number: i + 1,
                  scheduled_for: new Date(now.getTime() + touchDelays[i] * 86_400_000).toISOString(),
                  status: "scheduled",
                  subject: touch.subject ?? "",
                  body: touch.body,
                  channel: touch.channel,
                  phone_script: touch.channel === "phone_script" ? (touch.phone_script ?? null) : null,
                }))
              );
            }

            await writeAuditLog({
              supabase: admin,
              policy_id: queueItem.policy_id as string,
              user_id: user.id,
              event_type: "doc_requested",
              channel: "email",
              recipient: (policy.client_email as string).toLowerCase(),
              content_snapshot: `Document requested: ${documentType}${chaseNotes ? ` — ${chaseNotes}` : ""}`,
              metadata: {
                doc_chase_request_id: chaseReq.id,
                document_type: documentType,
                client_name: policy.client_name,
                triggered_by: "renewal_agent",
              },
              actor_type: "agent",
            });

            void logAction({
              broker_id: user.id,
              policy_id: queueItem.policy_id as string,
              action_type: "doc_chase_created",
              tier: "2",
              trigger_reason: `Broker approved document_required — doc chase started for "${documentType}" from ${policy.client_name}.`,
              payload: {
                doc_chase_request_id: chaseReq.id,
                document_type: documentType,
                client_name: policy.client_name,
                client_email: policy.client_email,
              },
              metadata: { queue_item_id: queueItemId, signal_id: queueItem.signal_id },
              outcome: "sent",
              retain_until: retainStandard(),
            });
          }
        }
      } catch (execErr) {
        console.error(
          "[agent/review] Failed to execute create_doc_chase_request:",
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
            .select("email_from_name, signal_token")
            .eq("user_id", user.id)
            .maybeSingle();

          const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
          const from = brokerProfile?.email_from_name
            ? `${brokerProfile.email_from_name} <${baseFrom}>`
            : baseFrom;
          const replyTo = process.env.INBOUND_EMAIL
            ?? ((brokerProfile as { signal_token?: string | null } | null)?.signal_token
              ? `${(brokerProfile as { signal_token: string }).signal_token}@ildaexi.resend.app`
              : undefined);

          const replySubject = subject && /^Re:\s*/i.test(subject) ? subject : `Re: ${subject ?? "Identity verification required"}`;
          const { data: sent, error: resendError } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: replySubject,
            text: finalBody,
            replyTo,
          });
          if (resendError) throw new Error(resendError.message ?? "Resend failed");

          await admin.from("send_logs").insert({
            policy_id: queueItem.policy_id,
            touchpoint_id: null,
            user_id: user.id,
            channel: "email",
            recipient: recipientEmail,
            status: "sent",
            provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            sent_at: resolvedAt,
          });

          await writeAuditLog({
            supabase: admin,
            policy_id: queueItem.policy_id as string,
            user_id: user.id,
            event_type: "email_sent",
            channel: "email",
            recipient: recipientEmail,
            content_snapshot: subject ? `Subject: ${replySubject}\n\n${finalBody ?? ""}` : (finalBody ?? ""),
            metadata: {
              queue_item_id: queueItemId,
              subject: replySubject ?? null,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            actor_type: "agent",
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

    // ── Generic: close linked doc chase for any approved/edited item ───────────
    if (
      (action === "approved" || action === "edited") &&
      (queueItem as { doc_chase_request_id?: string | null }).doc_chase_request_id
    ) {
      try {
        const chaseId = (queueItem as { doc_chase_request_id?: string | null }).doc_chase_request_id;
        if (chaseId) {
          await admin
            .from("doc_chase_requests")
            .update({ status: "received", received_at: resolvedAt })
            .eq("id", chaseId);
        }
      } catch (execErr) {
        console.error(
          "[agent/review] Failed to close linked doc_chase_request_id:",
          execErr instanceof Error ? execErr.message : execErr
        );
      }
    }

    // When broker rejects, mark the touchpoint skipped so the cron doesn't
    // keep attempting to fire it on subsequent runs.
    if (action === "rejected") {
      const payload = (queueItem.proposed_action as { payload?: Record<string, unknown> })?.payload ?? {};
      const touchpointId   = (payload.touchpoint_id   as string | null) ?? null;
      const touchpointType = (payload.touchpoint_type as string | null) ?? null;
      if (touchpointId) {
        await admin
          .from("campaign_touchpoints")
          .update({ status: "skipped" })
          .eq("id", touchpointId);
      }

      // ── Enhanced reject for call script items ────────────────────────────────
      // Flagging + Tier 3 escalation mirrors what POST /reject-script does, but
      // triggered from the inbox rather than the policy page.
      if (touchpointType === "script_14") {
        try {
          // Set call_script_rejected flag on the policy
          const { data: currentPolicy } = await admin
            .from("policies")
            .select("renewal_flags")
            .eq("id", queueItem.policy_id as string)
            .single();

          const existingFlags = (currentPolicy?.renewal_flags as Record<string, unknown>) ?? {};
          await admin
            .from("policies")
            .update({ renewal_flags: { ...existingFlags, call_script_rejected: true } })
            .eq("id", queueItem.policy_id as string);

          // Refresh health score so the -25 penalty takes effect
          const { refreshPolicyHealthScore } = await import("@/lib/renewals/health-score");
          await refreshPolicyHealthScore(queueItem.policy_id as string, admin);

          // Create a Tier 3 escalation so the broker sees it prominently in the inbox
          const { data: policyInfo } = await admin
            .from("policies")
            .select("policy_name, client_name")
            .eq("id", queueItem.policy_id as string)
            .single();

          await admin
            .from("approval_queue")
            .insert({
              policy_id: queueItem.policy_id,
              user_id: user.id,
              signal_id: null,
              tier: 3,
              classified_intent: "call_script_rejected",
              confidence_score: 1.0,
              raw_signal_snippet: `Broker rejected the call script for ${policyInfo?.client_name ?? "client"} — manual intervention required.`,
              proposed_action: {
                description: "Call Script Rejected",
                action_type: "broker_change_required",
                payload: {
                  policy_name: policyInfo?.policy_name ?? null,
                  client_name: policyInfo?.client_name ?? null,
                  rejection_reason: "call_script_rejected",
                  original_queue_item_id: queueItemId,
                },
              },
              status: "pending",
            });
        } catch (flagErr) {
          // Don't block the rejection response — log and continue
          console.error("[agent/review] Failed to apply call_script_rejected flag:", flagErr instanceof Error ? flagErr.message : flagErr);
        }
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
