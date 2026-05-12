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
import { logAction, retainStandard } from "@/lib/logAction";

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
    .select("id, client_email, client_name, document_type, policy_id, last_client_message_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chase) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    const threadHeaders: Record<string, string> = {};
    if (chase.last_client_message_id) {
      threadHeaders["In-Reply-To"] = chase.last_client_message_id;
      threadHeaders["References"] = chase.last_client_message_id;
    }

    const replySubject = subject && /^Re:\s*/i.test(subject) ? subject : `Re: ${subject || chase.document_type}`;
    await resend.emails.send({
      from,
      to: chase.client_email,
      subject: replySubject,
      text: emailBody,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(Object.keys(threadHeaders).length > 0 ? { headers: threadHeaders } : {}),
    });

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
