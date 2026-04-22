/**
 * POST /api/doc-chase/[id]/send-next
 *
 * Force-sends the next scheduled message in a doc chase sequence immediately,
 * bypassing the scheduled_for date. Intended for broker-initiated testing.
 *
 * - email: sends via Resend
 * - sms: sends via Twilio (requires client_phone)
 * - phone_script: marks as sent without sending (surfaces in UI as a script to read)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAction, retainStandard } from "@/lib/logAction";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership and fetch request details
  const { data: req } = await supabase
    .from("doc_chase_requests")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (req.status === "received" || req.status === "cancelled") {
    return NextResponse.json({ error: "Chase is already resolved" }, { status: 400 });
  }

  // Get active sequence
  const { data: seq } = await supabase
    .from("doc_chase_sequences")
    .select("id")
    .eq("request_id", id)
    .eq("sequence_status", "active")
    .maybeSingle();

  if (!seq) {
    return NextResponse.json({ error: "No active sequence found" }, { status: 400 });
  }

  // Find the next scheduled message
  const { data: messages } = await supabase
    .from("doc_chase_messages")
    .select("*")
    .eq("sequence_id", seq.id)
    .eq("status", "scheduled")
    .order("touch_number", { ascending: true })
    .limit(1);

  const msg = messages?.[0];
  if (!msg) {
    return NextResponse.json({ error: "No scheduled messages remaining" }, { status: 400 });
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

  const nowIso = new Date().toISOString();
  const channel: string = msg.channel ?? "email";

  try {
    if (channel === "phone_script") {
      await supabase
        .from("doc_chase_messages")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", msg.id);

      await supabase
        .from("doc_chase_requests")
        .update({ escalation_level: "phone_script", escalation_updated_at: nowIso })
        .eq("id", id);
    } else if (channel === "sms") {
      if (!req.client_phone) {
        return NextResponse.json({ error: "No phone number on record" }, { status: 400 });
      }
      const { sendSMS } = await import("@/lib/twilio/client");
      await sendSMS(req.client_phone, msg.body);

      await supabase
        .from("doc_chase_messages")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", msg.id);

      await supabase
        .from("doc_chase_requests")
        .update({ escalation_level: "sms", escalation_updated_at: nowIso })
        .eq("id", id);
    } else {
      // email
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from,
          to: req.client_email,
          subject: msg.subject,
          text: msg.body,
          ...(replyTo ? { reply_to: replyTo } : {}),
        });
      }

      await supabase
        .from("doc_chase_messages")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", msg.id);
    }

    void logAction({
      broker_id: user.id,
      policy_id: req.policy_id ?? null,
      action_type: "doc_chase_email",
      trigger_reason: `Force-sent doc chase touch ${msg.touch_number} to ${req.client_name} (${channel}) — manual trigger by broker.`,
      payload: {
        subject: msg.subject ?? null,
        body: msg.body,
        recipient_email: req.client_email,
        recipient_name: req.client_name,
        channel,
        template_used: `doc_chase_touch_${msg.touch_number}`,
      },
      metadata: {
        doc_chase_request_id: req.id,
        sequence_id: seq.id,
        touch_number: msg.touch_number,
        document_type: req.document_type,
        force_sent: true,
      },
      outcome: "sent",
      retain_until: retainStandard(),
    });

    // Close sequence if all messages are now done
    const { data: allMsgs } = await supabase
      .from("doc_chase_messages")
      .select("status")
      .eq("sequence_id", seq.id);

    const allDone = (allMsgs ?? []).every(
      (m) => m.status === "sent" || m.status === "cancelled"
    );
    const anySent = (allMsgs ?? []).some((m) => m.status === "sent");
    if (allDone && anySent) {
      await supabase
        .from("doc_chase_sequences")
        .update({ sequence_status: "completed", completed_at: nowIso })
        .eq("id", seq.id);
    }

    return NextResponse.json({ sent: true, touch_number: msg.touch_number, channel });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
