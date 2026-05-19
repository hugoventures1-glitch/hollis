/**
 * POST /api/agent/escalation/[id]/custom-reply
 *
 * Broker sends a custom email reply to the client from an escalation detail view.
 * Fetches the queue item for context, sends the email via Resend, logs the send,
 * and writes an audit entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend/client";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction } from "@/lib/logAction";
import { buildReplyHeaders, normalizeReplySubject } from "@/lib/email/threading";

const RequestSchema = z.object({
  to: z.string().email("Invalid recipient email"),
  subject: z.string().max(300).optional(),
  body: z.string().min(1, "Reply body is required").max(10_000),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
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

    const { to, body: replyBody, subject: customSubject } = parsed.data;

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch escalation item ────────────────────────────────────────────────────
    const { data: queueItem, error: fetchError } = await supabase
      .from("approval_queue")
      .select(
        "id, policy_id, user_id, signal_id, classified_intent, raw_signal_snippet, tier, in_reply_to, email_references, thread_index, thread_topic"
      )
      .eq("id", queueItemId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: "Escalation item not found" },
        { status: 404 }
      );
    }

    // ── Fetch policy + inbound signal subject in parallel ───────────────────────
    const admin = createAdminClient();
    const [{ data: policy }, { data: inboundSignal }] = await Promise.all([
      admin
        .from("policies")
        .select("client_name, policy_name")
        .eq("id", queueItem.policy_id as string)
        .single(),
      admin
        .from("inbound_signals")
        .select("subject")
        .eq("id", queueItem.signal_id as string)
        .maybeSingle(),
    ]);

    // ── Build email ──────────────────────────────────────────────────────────────
    const fromEmail = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
    const inboundSubject = (inboundSignal as { subject?: string | null } | null)?.subject ?? null;
    const subject =
      customSubject ??
      normalizeReplySubject(
        inboundSubject ?? (policy ? `${policy.policy_name} — ${policy.client_name}` : null)
      );

    const inboundAddress = process.env.INBOUND_EMAIL ?? fromEmail;
    const resend = getResendClient();
    const { data: sendData, error: sendError } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      text: replyBody,
      replyTo: inboundAddress,
      headers: buildReplyHeaders({
        messageId: queueItem.in_reply_to as string | null,
        referencesHeaders: queueItem.email_references as string | null,
        threadIndex: (queueItem as Record<string, unknown>).thread_index as string | null ?? null,
        threadTopic: (queueItem as Record<string, unknown>).thread_topic as string | null ?? null,
        subject: inboundSubject ?? customSubject ?? null,
      }),
    });

    if (sendError) {
      console.error("[escalation/custom-reply] Resend error:", sendError);
      return NextResponse.json(
        { error: "Failed to send email", details: sendError.message },
        { status: 502 }
      );
    }

    const sentAt = new Date().toISOString();

    // ── Audit log ────────────────────────────────────────────────────────────────
    await writeAuditLog({
      supabase: admin,
      policy_id: queueItem.policy_id as string,
      user_id: user.id,
      event_type: "email_sent",
      channel: "email",
      recipient: to,
      content_snapshot: replyBody.slice(0, 500),
      metadata: {
        queue_item_id: queueItemId,
        signal_id: queueItem.signal_id,
        subject,
        provider_message_id: sendData?.id ?? null,
        source: "broker_custom_reply",
      },
      actor_type: "broker",
    });

    // ── Send log ─────────────────────────────────────────────────────────────────
    await admin.from("send_logs").insert({
      policy_id: queueItem.policy_id as string,
      user_id: user.id,
      channel: "email",
      recipient: to,
      status: "sent",
      provider_message_id: sendData?.id ?? null,
      sent_at: sentAt,
    });

    void logAction({
      broker_id: user.id,
      policy_id: queueItem.policy_id as string,
      action_type: "email_sent",
      tier: String(queueItem.tier ?? 3) as "1" | "2" | "3",
      trigger_reason: "Broker sent custom reply from escalation detail",
      payload: {
        to,
        subject,
        queue_item_id: queueItemId,
        provider_message_id: sendData?.id ?? null,
      },
      outcome: "sent",
    });

    return NextResponse.json({ ok: true, message_id: sendData?.id ?? null });
  } catch (err) {
    console.error(
      "[escalation/custom-reply] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
