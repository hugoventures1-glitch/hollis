/**
 * POST /api/doc-chase/[id]/send-reply
 *
 * Sends a broker-reviewed draft reply email to the client for a doc chase request.
 * Called when the broker clicks "Send Reply" in the inbox doc chase panel.
 *
 * Body: { subject: string; body: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAction, retainStandard } from "@/lib/logAction";
import { buildReplyHeaders, normalizeReplySubject } from "@/lib/email/threading";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const subject: string = (body.subject ?? "").trim();
  const emailBody: string = (body.body ?? "").trim();

  if (!emailBody) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  // Verify ownership
  const { data: chase } = await supabase
    .from("doc_chase_requests")
    .select("id, client_email, client_name, document_type, policy_id, last_client_message_id, thread_index, thread_topic")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Look up the full thread context from inbound_signals for RFC 2822 References header.
  let threadingReferences: string | null = null;
  if (chase.last_client_message_id) {
    const admin = createAdminClient();
    const { data: sig } = await admin
      .from("inbound_signals")
      .select("references_headers")
      .eq("message_id", chase.last_client_message_id)
      .limit(1)
      .maybeSingle();
    threadingReferences = (sig as { references_headers?: string | null } | null)?.references_headers ?? null;
  }

  // Fetch broker profile for sender name and reply-to
  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("email_from_name, signal_token")
    .eq("user_id", user.id)
    .maybeSingle();

  const baseFrom = process.env.FROM_EMAIL ?? "noreply@hollisai.com.au";
  const from = profile?.email_from_name
    ? `${profile.email_from_name} <${baseFrom}>`
    : baseFrom;
  const replyTo = profile?.signal_token
    ? `${profile.signal_token}@ildaexi.resend.app`
    : undefined;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);

    const replySubject = normalizeReplySubject(subject || chase.document_type);
    await resend.emails.send({
      from,
      to: chase.client_email,
      subject: replySubject,
      text: emailBody,
      ...(replyTo ? { reply_to: replyTo } : {}),
      headers: buildReplyHeaders({
        messageId: chase.last_client_message_id ?? null,
        referencesHeaders: threadingReferences,
        threadIndex: (chase as Record<string, unknown>).thread_index as string | null ?? null,
        threadTopic: (chase as Record<string, unknown>).thread_topic as string | null ?? null,
        subject: subject || chase.document_type,
      }),
    });

    await supabase
      .from("doc_chase_requests")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    void logAction({
      broker_id: user.id,
      policy_id: chase.policy_id ?? null,
      action_type: "doc_chase_email",
      trigger_reason: `Broker sent draft reply to ${chase.client_name} re: ${chase.document_type} — validation follow-up.`,
      payload: {
        subject: subject || null,
        body: emailBody,
        recipient_email: chase.client_email,
        recipient_name: chase.client_name,
        channel: "email",
      },
      metadata: {
        doc_chase_request_id: chase.id,
        document_type: chase.document_type,
        draft_reply: true,
      },
      outcome: "sent",
      retain_until: retainStandard(),
    });

    return NextResponse.json({ sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
