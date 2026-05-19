/**
 * lib/agent/process-signal.ts
 *
 * Shared inbound signal pipeline (steps 2–11).
 * Called by both the manual /api/agent/signal route (authenticated broker)
 * and the Resend inbound email webhook (no session — admin client only).
 *
 * Callers are responsible for:
 *   - Verifying ownership before calling (RLS check or HMAC + email lookup)
 *   - Fetching parser_outcomes scoped to the correct user_id
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyIntent } from "@/lib/agent/intent-classifier";
import { buildFlagsFromClassification, writeFlagsToPolicy, getCurrentFlags } from "@/lib/agent/flag-writer";
import { routeTier } from "@/lib/agent/tier-router";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainStandard, retainLongTerm } from "@/lib/logAction";
import { notifyBrokerTier3, notifyBrokerSoftQuerySent } from "@/lib/agent/broker-notifier";
import { getResendClient } from "@/lib/resend/client";
import { buildReplyHeaders, normalizeReplySubject } from "@/lib/email/threading";
import type { AuditEventType, Policy } from "@/types/renewals";
import type { ParserOutcome, ClassificationResult, RenewalFlags, TierDecision } from "@/types/agent";

const ESCALATION_LABELS: Record<string, string> = {
  active_claim_mentioned: "Active Claim Mentioned",
  cancel_policy:          "Cancellation Requested",
  legal_dispute:          "Legal Dispute Flagged",
  business_restructure:   "Business Change Flagged",
  coverage_gap_detected:  "Coverage Gap Detected",
  premium_spike:          "Premium Spike",
  non_renewal:            "Non-Renewal Indicated",
};

function escalationLabel(intent: string): string {
  return ESCALATION_LABELS[intent] ?? "Manual Review Required";
}

export interface ProcessSignalParams {
  /** Service-role admin client — bypasses RLS. Caller must verify ownership before calling. */
  admin: SupabaseClient;
  /** Broker's auth.users id — policy owner */
  userId: string;
  policyId: string;
  policy: Pick<
    Policy,
    | "id"
    | "client_name"
    | "policy_name"
    | "expiration_date"
    | "last_contact_at"
    | "renewal_flags"
    | "renewal_paused"
    | "client_email"
    | "carrier"
    | "premium"
    | "agent_name"
    | "agent_email"
  >;
  rawSignal: string;
  senderEmail: string | null;
  senderName: string | null;
  source: "manual" | "email" | "sms";
  /** Top 10 broker-approved parser_outcomes — caller fetches these scoped to userId */
  recentOutcomes: ParserOutcome[];
  /** Resend internal email_id (from webhook payload) */
  emailId?: string | null;
  /** SMTP Message-ID header from the inbound email */
  messageId?: string | null;
  /** In-Reply-To header from the inbound email */
  inReplyTo?: string | null;
  /** References header from the inbound email */
  referencesHeaders?: string | null;
  /** Subject line from the inbound email — used as the reply subject so the thread stays consistent */
  inboundSubject?: string | null;
  /** Outlook Thread-Index header from the inbound email */
  threadIndex?: string | null;
  /** Outlook Thread-Topic header from the inbound email */
  threadTopic?: string | null;
  /** Optional attachment from the inbound email — stored to Supabase storage and linked to the approval_queue item */
  attachment?: { buffer: Buffer; filename: string; content_type: string } | null;
}

export interface ProcessSignalResult {
  signal_id: string;
  classification: ClassificationResult;
  flags: RenewalFlags;
  tier_decision: TierDecision;
}

export async function processInboundSignal(
  params: ProcessSignalParams
): Promise<ProcessSignalResult> {
  const {
    admin,
    userId,
    policyId,
    policy,
    rawSignal,
    senderEmail,
    senderName,
    source,
    recentOutcomes,
    emailId,
    messageId,
    inReplyTo,
    referencesHeaders,
    inboundSubject,
    threadIndex,
    threadTopic,
    attachment,
  } = params;

  // ── 2. Write inbound_signals record ───────────────────────────────────────────
  const { data: signal, error: signalError } = await admin
    .from("inbound_signals")
    .insert({
      policy_id: policyId,
      user_id: userId,
      raw_signal: rawSignal,
      sender_email: senderEmail,
      sender_name: senderName,
      source,
      email_id: emailId ?? null,
      message_id: messageId ?? null,
      in_reply_to: inReplyTo ?? null,
      references_headers: referencesHeaders ?? null,
      subject: inboundSubject ?? null,
      thread_index: threadIndex ?? null,
      thread_topic: threadTopic ?? null,
    })
    .select("id")
    .single();

  if (signalError || !signal) {
    throw new Error(
      `[process-signal] Failed to write inbound_signals: ${signalError?.message ?? "unknown error"}`
    );
  }

  // ── 2b. Write signal_received audit entry ─────────────────────────────────────
  // Logged immediately so the activity feed shows the inbound reply regardless
  // of how the tier router later classifies and routes it.
  await writeAuditLog({
    supabase: admin,
    policy_id: policyId,
    user_id: userId,
    event_type: "signal_received",
    channel: source === "email" ? "email" : source === "sms" ? "sms" : "internal",
    recipient: senderEmail,
    content_snapshot: rawSignal.slice(0, 500),
    metadata: {
      signal_id: signal.id,
      sender_email: senderEmail,
      sender_name: senderName,
      source,
    },
    actor_type: "system",
  });

  // ── 2c. Store email attachment (if any) ───────────────────────────────────────
  // We have the signal.id now — use it to build a unique storage path.
  let attachmentStoragePath: string | null = null;
  let attachmentFilename: string | null = null;
  let attachmentContentType: string | null = null;
  if (attachment) {
    try {
      const uuid = crypto.randomUUID();
      const safeName = attachment.filename.replace(/[^a-z0-9._-]/gi, "_").slice(0, 100);
      const storagePath = `signals/${userId}/${signal.id}/${uuid}-${safeName}`;
      const { error: uploadErr } = await admin.storage
        .from("doc-chase-attachments")
        .upload(storagePath, attachment.buffer, { contentType: attachment.content_type, upsert: false });
      if (!uploadErr) {
        attachmentStoragePath = storagePath;
        attachmentFilename = attachment.filename;
        attachmentContentType = attachment.content_type;
      } else {
        console.error("[process-signal] Attachment upload failed:", uploadErr.message);
      }
    } catch (attachErr) {
      console.error("[process-signal] Attachment storage error:", attachErr);
    }
  }

  // ── 3. Few-shot outcomes passed in by caller ───────────────────────────────────
  // (recentOutcomes already fetched and scoped to userId)

  // ── 4. Classify intent ─────────────────────────────────────────────────────────
  const classification = await classifyIntent(rawSignal, recentOutcomes);

  // ── 4b. Look up active doc chase for document_received intents ─────────────────
  let docChaseRequestId: string | null = null;
  if (classification.intent === "document_received") {
    const { data: chaseReq } = await admin
      .from("doc_chase_requests")
      .select("id")
      .eq("policy_id", policyId)
      .in("status", ["sent", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    docChaseRequestId = (chaseReq as { id?: string } | null)?.id ?? null;
  }

  // ── 5–6. Build flags + write to policy ────────────────────────────────────────
  const currentFlags = await getCurrentFlags(admin, policyId);
  const updatedFlags = buildFlagsFromClassification(
    currentFlags,
    classification,
    policy.expiration_date as string
  );

  await writeFlagsToPolicy(admin, policyId, updatedFlags);

  // ── 7. Route to tier ───────────────────────────────────────────────────────────
  const tierDecision = await routeTier(
    admin,
    userId,
    updatedFlags,
    classification,
    {
      id: policy.id as string,
      client_name: policy.client_name as string,
      policy_name: policy.policy_name as string,
      expiration_date: policy.expiration_date as string,
      last_contact_at: policy.last_contact_at as string | null,
    },
    rawSignal,
    docChaseRequestId
  );

  // ── 8. Write audit log ─────────────────────────────────────────────────────────
  const auditEventMap: Record<1 | 2 | 3, AuditEventType> = {
    1: "tier_1_action",
    2: "tier_2_drafted",
    3: "tier_3_escalated",
  };

  await writeAuditLog({
    supabase: admin,
    policy_id: policyId,
    user_id: userId,
    event_type: auditEventMap[tierDecision.tier],
    channel: "internal",
    content_snapshot: rawSignal.slice(0, 1000),
    metadata: {
      signal_id: signal.id,
      intent: classification.intent,
      confidence: classification.confidence,
      flags_detected: classification.flags_detected,
      premium_increase_pct: classification.premium_increase_pct,
      tier: tierDecision.tier,
      reason: tierDecision.reason,
      reasoning: classification.reasoning,
      source,
      ...(tierDecision.tier === 3 && {
        broker_notification: tierDecision.broker_notification,
      }),
    },
    actor_type: "system",
  });

  // ── Fetch agent profile + client knowledge base ───────────────────────────────
  const [{ data: profile }, { data: clientRecord }] = await Promise.all([
    admin
      .from("agent_profiles")
      .select("email_from_name, email, standing_orders")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("clients")
      .select("knowledge_base")
      .eq("user_id", userId)
      .ilike("name", policy.client_name as string)
      .maybeSingle(),
  ]);

  // Cap at 3000 chars in the signal pipeline — the prompt already carries
  // outbound history + standing orders + the raw signal.
  const clientKnowledgeBase =
    ((clientRecord as { knowledge_base?: string | null } | null)?.knowledge_base ?? "").slice(0, 3000) || null;

  // ── Fetch recent outbound history ──────────────────────────────────────────────
  // Gives the responder context about what Hollis previously sent, so it can
  // answer questions like "where is the vehicle schedule?" without confusion.
  let outboundHistory: string | null = null;
  try {
    const [{ data: sentTouchpoints }, { data: autoReplies }] = await Promise.all([
      admin
        .from("campaign_touchpoints")
        .select("subject, content, sent_at, type")
        .eq("policy_id", policyId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(3),
      admin
        .from("hollis_actions")
        .select("payload, created_at")
        .eq("policy_id", policyId)
        .eq("action_type", "tier1_reply_sent")
        .order("created_at", { ascending: false })
        .limit(2),
    ]);

    const parts: string[] = [];

    for (const reply of autoReplies ?? []) {
      const p = reply.payload as { subject?: string; body?: string } | null;
      if (p?.subject || p?.body) {
        const date = new Date(reply.created_at as string).toLocaleDateString("en-AU");
        parts.push(`[Hollis reply — ${date}]\nSubject: ${p.subject ?? ""}\n${(p.body ?? "").slice(0, 600)}`);
      }
    }

    for (const tp of sentTouchpoints ?? []) {
      const date = tp.sent_at
        ? new Date(tp.sent_at as string).toLocaleDateString("en-AU")
        : "unknown date";
      parts.push(`[Campaign email — ${date} (${tp.type})]\nSubject: ${tp.subject ?? ""}\n${(tp.content ?? "").slice(0, 600)}`);
    }

    if (parts.length > 0) outboundHistory = parts.join("\n\n---\n\n");
  } catch (histErr) {
    console.warn("[process-signal] Failed to fetch outbound history:", histErr);
  }

  // Resolve recipient — prefer the inbound sender, fall back to policy client_email
  const recipientEmail = senderEmail ?? (policy.client_email as string | null) ?? null;

  // ── 9. Tier 1: execute autonomous actions ──────────────────────────────────────
  if (tierDecision.tier === 1) {
    const intent = classification.intent;

    if (intent === "out_of_office") {
      // Use Claude-extracted return date if available; fall back to +7 days
      let resumeDateStr: string;
      const extractedReturnDate = classification.ooo_return_date ?? null;
      if (extractedReturnDate) {
        resumeDateStr = extractedReturnDate;
      } else {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 7);
        resumeDateStr = fallback.toISOString().slice(0, 10);
      }

      // Lapse risk: if the client won't be back before the policy expires,
      // escalate to Tier 3 instead of silently pausing the sequence.
      const expiryDate = policy.expiration_date as string | null;
      const lapseRisk = !!expiryDate && resumeDateStr >= expiryDate;

      if (lapseRisk) {
        // Override to Tier 3 — policy will expire while client is unreachable
        notifyBrokerTier3(admin, userId, policyId, tierDecision).catch((err) =>
          console.error(
            "[process-signal] OOO lapse-risk broker notification failed:",
            err instanceof Error ? err.message : err
          )
        );

        await admin
          .from("approval_queue")
          .insert({
            policy_id: policyId,
            user_id: userId,
            signal_id: signal.id,
            classified_intent: "out_of_office",
            confidence_score: classification.confidence,
            raw_signal_snippet: rawSignal.slice(0, 500),
            proposed_action: {
              description: "Out of Office — Lapse Risk",
              action_type: "escalation_review",
              payload: {
                ooo_return_date: resumeDateStr,
                expiry_date: expiryDate,
                lapse_risk: true,
                intent: "out_of_office",
              },
            },
            status: "pending",
            tier: 3,
            in_reply_to: messageId ?? null,
            email_references: referencesHeaders ?? null,
            thread_index: threadIndex ?? null,
            thread_topic: threadTopic ?? null,
          });

        void logAction({
          broker_id: userId,
          policy_id: policyId,
          action_type: "escalation",
          tier: "3",
          trigger_reason: `OOO lapse risk — client returns ${resumeDateStr}, policy expires ${expiryDate}. Escalated to Tier 3.`,
          payload: { raw_signal_snippet: rawSignal.slice(0, 500), ooo_return_date: resumeDateStr, expiry_date: expiryDate },
          metadata: { signal_id: signal.id, intent, confidence: classification.confidence },
          outcome: "escalated",
          retain_until: retainStandard(),
        });
      } else {
        // Safe to pause — client returns before policy expires
        await admin
          .from("policies")
          .update({
            renewal_paused: true,
            renewal_paused_until: resumeDateStr,
          })
          .eq("id", policyId);

        void logAction({
          broker_id: userId,
          policy_id: policyId,
          action_type: "out_of_office_logged",
          tier: "1",
          trigger_reason: `Auto-reply detected from ${senderName ?? senderEmail ?? "client"} — sequence paused until ${resumeDateStr}${extractedReturnDate ? " (extracted from OOO message)" : " (fallback: +7 days)"}.`,
          payload: { raw_signal_snippet: rawSignal.slice(0, 500), ooo_return_date: resumeDateStr },
          metadata: { signal_id: signal.id, intent, confidence: classification.confidence },
          outcome: "classified",
          retain_until: retainStandard(),
        });
      }
    } else if (
      // v2 canonical + v1 backward-compat names
      ["coverage_question", "confirmed", "soft_query", "confirm_renewal", "request_callback", "document_received"].includes(intent)
    ) {
      if (!recipientEmail) {
        console.warn(
          `[process-signal] Tier 1 intent "${intent}" — no recipient email, skipping send.`
        );
        void logAction({
          broker_id: userId,
          policy_id: policyId,
          action_type: "tier1_no_recipient",
          tier: "1",
          trigger_reason: `Tier 1 intent "${intent}" could not execute — no sender_email or client_email available.`,
          metadata: { signal_id: signal.id, intent },
          outcome: "failed",
          retain_until: retainStandard(),
        });
      } else {
        try {
          const baseFrom = process.env.FROM_EMAIL ?? "";
          const from = profile?.email_from_name
            ? `${profile.email_from_name} <${baseFrom}>`
            : baseFrom;
          const resend = getResendClient();

          let draft: { subject: string; body: string };
          // coverage_question is the v2 name for soft_query — same auto-reply handler
          if (intent === "soft_query" || intent === "coverage_question") {
            const { generateQueryResponse } = await import("@/lib/agent/responder");
            draft = await generateQueryResponse(rawSignal, policy as Policy, {
              standingOrders:
                (profile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
              clientNotes: clientKnowledgeBase,
              outboundHistory,
            });
          } else {
            const { generateAckEmail } = await import("@/lib/agent/responder");
            // "confirmed" is the v2 name for confirm_renewal — same ack handler
            const ackIntent = (intent === "confirmed" ? "confirm_renewal" : intent) as
              | "confirm_renewal"
              | "request_callback"
              | "document_received";
            draft = await generateAckEmail(ackIntent, policy as Policy, {
              standingOrders:
                (profile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
              clientNotes: clientKnowledgeBase,
            });
          }

          const replySubject = normalizeReplySubject(inboundSubject ?? draft.subject);
          const { data: sent } = await resend.emails.send({
            from,
            to: recipientEmail,
            subject: replySubject,
            text: draft.body,
            replyTo: process.env.INBOUND_EMAIL ?? (profile as { email?: string | null } | null)?.email ?? undefined,
            headers: buildReplyHeaders({
              messageId: messageId ?? null,
              referencesHeaders: referencesHeaders ?? null,
              threadIndex: threadIndex ?? null,
              threadTopic: threadTopic ?? null,
              subject: inboundSubject ?? draft.subject,
            }),
          });

          // Intent-specific side effects
          // "confirmed" is the v2 canonical name for confirm_renewal
          if (intent === "confirm_renewal" || intent === "confirmed") {
            await admin
              .from("policies")
              .update({
                campaign_stage: "confirmed",
                client_confirmed_at: new Date().toISOString(),
                last_contact_at: new Date().toISOString().slice(0, 10),
              })
              .eq("id", policyId);

            // Auto-reject any pending queue items — renewal is done
            await admin
              .from("approval_queue")
              .update({ status: "rejected" })
              .eq("policy_id", policyId)
              .eq("status", "pending");

            // Fix 6: cross-sell opportunity — create a broker task without blocking the confirm flow
            if (classification.secondary_flags?.includes("cross_sell_signal")) {
              await admin.from("approval_queue").insert({
                policy_id: policyId,
                user_id: userId,
                signal_id: signal.id,
                classified_intent: "cross_sell_opportunity",
                confidence_score: classification.confidence,
                raw_signal_snippet: rawSignal.slice(0, 500),
                proposed_action: {
                  description: `${policy.client_name} mentioned needing another insurance product — review and follow up with a cross-sell conversation.`,
                  action_type: "cross_sell_opportunity",
                  payload: {
                    intent: "cross_sell_signal",
                    reasoning: classification.reasoning,
                    raw_signal_snippet: rawSignal.slice(0, 300),
                  },
                },
                status: "pending",
              });
            }
          } else if (intent === "request_callback") {
            await admin.from("policies").update({ renewal_paused: true }).eq("id", policyId);
          }

          // Write email_sent to the activity feed so the broker can see what was sent
          await writeAuditLog({
            supabase: admin,
            policy_id: policyId,
            user_id: userId,
            event_type: "email_sent",
            channel: "email",
            recipient: recipientEmail,
            content_snapshot: `Subject: ${replySubject}\n\n${draft.body}`,
            metadata: {
              signal_id: signal.id,
              intent,
              subject: replySubject,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            actor_type: "agent",
          });

          const isQueryIntent = intent === "soft_query" || intent === "coverage_question";
          void logAction({
            broker_id: userId,
            policy_id: policyId,
            action_type: isQueryIntent ? "tier1_reply_sent" : `tier1_ack_sent_${intent}`,
            tier: "1",
            trigger_reason: isQueryIntent
              ? `Tier 1 autonomous reply sent to ${recipientEmail} in response to ${intent}.`
              : `Tier 1 acknowledgment sent to ${recipientEmail} for intent "${intent}".`,
            payload: {
              subject: draft.subject,
              body: draft.body,
              recipient: recipientEmail,
              provider_message_id: (sent as { id?: string } | null)?.id ?? null,
            },
            metadata: { signal_id: signal.id, intent, confidence: classification.confidence },
            outcome: "sent",
            retain_until: retainStandard(),
          });

          // FYI the broker whenever Hollis sends an autonomous coverage_question / soft_query reply
          // so they know what was sent and can follow up if the reply deferred to them.
          if (intent === "soft_query" || intent === "coverage_question") {
            notifyBrokerSoftQuerySent(
              admin,
              userId,
              policyId,
              policy.client_name as string,
              policy.policy_name as string,
              recipientEmail,
              draft
            ).catch((err) =>
              console.error(
                "[process-signal] Broker soft_query FYI failed:",
                err instanceof Error ? err.message : err
              )
            );
          }
        } catch (execErr) {
          console.error(
            `[process-signal] Tier 1 "${intent}" execution failed:`,
            execErr instanceof Error ? execErr.message : execErr
          );
        }
      }
    }
  }

  // ── document_received: close open doc-chase requests ──────────────────────────
  // Runs regardless of whether an ack email was sent (no recipient gate).
  // The DB trigger mark_document_received() cascades to cancel pending
  // doc_chase_messages and complete the doc_chase_sequences record.
  if (tierDecision.tier === 1 && classification.intent === "document_received") {
    const receivedAt = new Date().toISOString();
    // Close doc chases linked to this policy
    await admin
      .from("doc_chase_requests")
      .update({ status: "received", received_at: receivedAt })
      .eq("policy_id", policyId)
      .neq("status", "received");
    // Also close standalone doc chases (no policy_id) for this sender
    if (senderEmail) {
      await admin
        .from("doc_chase_requests")
        .update({ status: "received", received_at: receivedAt })
        .eq("client_email", senderEmail)
        .is("policy_id", null)
        .neq("status", "received");
    }
  }

  // ── 9b. Merge attachment metadata into the tier decision payload ────────────
  // This runs AFTER tier routing so both Tier 2 and Tier 3 escalations carry
  // attachment info into the approval_queue row.
  if (attachmentStoragePath && tierDecision.proposed_action) {
    tierDecision.proposed_action.payload = {
      ...tierDecision.proposed_action.payload,
      attachment_path: attachmentStoragePath,
      attachment_filename: attachmentFilename,
      attachment_content_type: attachmentContentType,
    };
  }

  // ── 10. Tier 2: write to approval_queue ────────────────────────────────────────
  if (tierDecision.tier === 2 && tierDecision.proposed_action) {
    // Pre-generate a reply draft for soft_query signals so the broker sees
    // a ready-to-approve response in the inbox.
    if (
      // coverage_question (v2) and soft_query (v1 compat) both pre-generate a reply draft
      (classification.intent === "coverage_question" ||
        classification.intent === "soft_query" ||
        classification.intent === "schedule_meeting") &&
      tierDecision.proposed_action.action_type === "draft_and_send_response" &&
      recipientEmail
    ) {
      try {
        const { generateQueryResponse } = await import("@/lib/agent/responder");
        const draft = await generateQueryResponse(rawSignal, policy as Policy, {
          standingOrders:
            (profile as { standing_orders?: string | null } | null)?.standing_orders ?? null,
          clientNotes: clientKnowledgeBase,
          outboundHistory,
        });
        tierDecision.proposed_action.payload = {
          ...tierDecision.proposed_action.payload,
          subject: draft.subject,
          body: draft.body,
          recipient_email: recipientEmail,
          inbound_subject: inboundSubject ?? null,
        };
      } catch (draftErr) {
        console.error(
          "[process-signal] Failed to pre-generate Tier 2 draft:",
          draftErr instanceof Error ? draftErr.message : draftErr
        );
      }
    }



    const { data: queueItem, error: queueError } = await admin
      .from("approval_queue")
      .insert({
        policy_id: policyId,
        user_id: userId,
        signal_id: signal.id,
        classified_intent: classification.intent,
        confidence_score: classification.confidence,
        raw_signal_snippet: rawSignal.slice(0, 500),
        proposed_action: tierDecision.proposed_action,
        task_type: tierDecision.proposed_action.task_type ?? null,
        status: "pending",
        doc_chase_request_id: docChaseRequestId,
        in_reply_to: messageId ?? null,
        email_references: referencesHeaders ?? null,
        thread_index: threadIndex ?? null,
        thread_topic: threadTopic ?? null,
      })
      .select("id")
      .single();

    if (queueError) {
      console.error("[process-signal] Failed to write approval_queue:", queueError.message);
    } else if (queueItem) {
      tierDecision.approval_queue_id = queueItem.id as string;
    }

    void logAction({
      broker_id: userId,
      policy_id: policyId,
      action_type: "approval_queued",
      tier: "2",
      trigger_reason: `Inbound signal from ${senderName ?? senderEmail ?? "client"} classified as "${classification.intent}" (confidence ${Math.round(classification.confidence * 100)}%) — queued for broker review before action.`,
      payload: {
        intent_classification: classification.intent,
        confidence_score: classification.confidence,
        channel: "internal",
        escalation_reason: tierDecision.reason,
      },
      metadata: {
        signal_id: signal.id,
        flags_detected: classification.flags_detected,
        premium_increase_pct: classification.premium_increase_pct ?? null,
        reasoning: classification.reasoning,
        approval_queue_id: tierDecision.approval_queue_id ?? null,
      },
      outcome: "queued",
      retain_until: retainLongTerm(),
    });
  }


  // ── 11. Tier 3: send broker alert email + surface in Hollis inbox ───────────
  if (tierDecision.tier === 3) {
    // Fix 2: declined_churn — suppress all future touchpoints and mark stage as declined
    if (classification.intent === "declined_churn") {
      await admin
        .from("policies")
        .update({ campaign_stage: "declined" })
        .eq("id", policyId);

      // Cancel all pending touchpoints so no further emails/SMS fire
      await admin
        .from("campaign_touchpoints")
        .update({ status: "cancelled" })
        .eq("policy_id", policyId)
        .eq("status", "pending");

      void logAction({
        broker_id: userId,
        policy_id: policyId,
        action_type: "policy_declined_churn",
        tier: "3",
        trigger_reason: `Client explicitly leaving for another broker — campaign stage set to "declined", all pending touchpoints cancelled.`,
        payload: { raw_signal_snippet: rawSignal.slice(0, 500) },
        metadata: { signal_id: signal.id, intent: classification.intent, confidence: classification.confidence },
        outcome: "escalated",
        retain_until: retainLongTerm(),
      });
    }

    notifyBrokerTier3(admin, userId, policyId, tierDecision).catch((err) =>
      console.error(
        "[process-signal] Broker notification failed:",
        err instanceof Error ? err.message : err
      )
    );

    // Escalation label for declined_churn is RETENTION so it surfaces clearly in inbox
    const isChurn = classification.intent === "declined_churn";

    // Write to approval_queue so the escalation appears in the Hollis inbox
    const { data: escalationQueueItem, error: escalationQueueError } = await admin
      .from("approval_queue")
      .insert({
        policy_id: policyId,
        user_id: userId,
        signal_id: signal.id,
        classified_intent: classification.intent,
        confidence_score: classification.confidence,
        raw_signal_snippet: rawSignal.slice(0, 500),
        proposed_action: {
          description: isChurn
            ? "Retention Risk — Client Churning"
            : escalationLabel(classification.intent),
          action_type: isChurn ? "retention_escalation" : "escalation_review",
          payload: {
            ...(tierDecision.broker_notification ?? {}),
            escalation_reason: tierDecision.reason,
            intent: classification.intent,
            flags: updatedFlags,
            attachment_path: tierDecision.proposed_action?.payload?.attachment_path,
            attachment_filename: tierDecision.proposed_action?.payload?.attachment_filename,
            attachment_content_type: tierDecision.proposed_action?.payload?.attachment_content_type,
          },
        },
        task_type: isChurn ? "retention_at_risk" : "escalation_review",
        status: "pending",
        tier: 3,
        in_reply_to: messageId ?? null,
        email_references: referencesHeaders ?? null,
        thread_index: threadIndex ?? null,
        thread_topic: threadTopic ?? null,
      })
      .select("id")
      .single();

    if (escalationQueueError) {
      console.error(
        "[process-signal] Failed to write Tier 3 escalation to approval_queue:",
        escalationQueueError.message
      );
    }

    void logAction({
      broker_id: userId,
      policy_id: policyId,
      action_type: "escalation",
      tier: "3",
      trigger_reason: `Signal from ${senderName ?? senderEmail ?? "client"} triggered Tier 3 hard escalation — ${tierDecision.reason}`,
      payload: {
        intent_classification: classification.intent,
        confidence_score: classification.confidence,
        channel: "internal",
        escalation_reason: tierDecision.reason,
        approval_queue_id: escalationQueueItem?.id ?? null,
      },
      metadata: {
        signal_id: signal.id,
        flags_detected: classification.flags_detected,
        premium_increase_pct: classification.premium_increase_pct ?? null,
        reasoning: classification.reasoning,
      },
      outcome: "escalated",
      retain_until: retainLongTerm(),
    });
  }

  // ── Mark signal as processed ───────────────────────────────────────────────────
  await admin
    .from("inbound_signals")
    .update({
      processed: true,
      processed_at: new Date().toISOString(),
      classification_result: classification,
    })
    .eq("id", signal.id);

  return {
    signal_id: signal.id as string,
    classification,
    flags: updatedFlags,
    tier_decision: tierDecision,
  };
}
