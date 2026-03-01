/**
 * GET /api/cron/doc-chase
 *
 * Daily cron job — sends all document-chase messages whose scheduled_for
 * is <= now() and status = 'scheduled'.
 *
 * - email: send via Resend
 * - sms: send via Twilio (requires client_phone; else mark cancelled)
 * - phone_script: don't send; mark as 'sent' (surfaced), update request escalation
 *
 * Protected by CRON_SECRET. Vercel schedule: 0 9 * * * (9 AM UTC daily)
 *
 * Returns: { processed, sent, failed, errors[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/twilio/client";

interface RequestRow {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  document_type: string;
  status: string;
}

interface SequenceRow {
  id: string;
  sequence_status: string;
  doc_chase_requests: RequestRow;
}

interface MessageRow {
  id: string;
  sequence_id: string;
  touch_number: number;
  subject: string;
  body: string;
  channel: string;
  doc_chase_sequences: SequenceRow;
}

export async function GET(request: NextRequest) {
  // Auth check — must match CRON_SECRET
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Fetch all due scheduled messages with their sequence + request data
  const { data: dueMsgs, error: fetchErr } = await supabase
    .from("doc_chase_messages")
    .select(`
      id,
      sequence_id,
      touch_number,
      subject,
      body,
      channel,
      doc_chase_sequences (
        id,
        sequence_status,
        doc_chase_requests (
          id,
          client_name,
          client_email,
          client_phone,
          document_type,
          status
        )
      )
    `)
    .eq("status", "scheduled")
    .lte("scheduled_for", now);

  if (fetchErr) {
    console.error("[cron/doc-chase] Failed to fetch messages:", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const messages = (dueMsgs ?? []) as unknown as MessageRow[];

  // Skip messages where the sequence is cancelled or the request is received/cancelled
  const active = messages.filter((m) => {
    const seq = m.doc_chase_sequences;
    const req = seq?.doc_chase_requests;
    return (
      seq?.sequence_status === "active" &&
      req?.status !== "received" &&
      req?.status !== "cancelled"
    );
  });

  const results = {
    processed: active.length,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  if (active.length === 0) {
    console.log("[cron/doc-chase] No messages due.");
    return NextResponse.json(results);
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "documents@hollis.ai";
  const nowIso = new Date().toISOString();

  for (const msg of active) {
    const seq = msg.doc_chase_sequences;
    const req = seq.doc_chase_requests;
    const channel = (msg as MessageRow).channel ?? "email";

    try {
      if (channel === "phone_script") {
        // Don't send — surface in UI only. Mark as sent and update request escalation.
        await supabase
          .from("doc_chase_messages")
          .update({ status: "sent", sent_at: nowIso })
          .eq("id", msg.id);

        await supabase
          .from("doc_chase_requests")
          .update({
            escalation_level: "phone_script",
            escalation_updated_at: nowIso,
          })
          .eq("id", req.id);

        results.sent++;
        continue;
      }

      if (channel === "sms") {
        const phone = req.client_phone?.trim();
        if (!phone) {
          console.warn(
            `[cron/doc-chase] Touch ${msg.touch_number} for ${req.client_name} is SMS but client_phone is missing — marking cancelled`
          );
          await supabase
            .from("doc_chase_messages")
            .update({ status: "cancelled" })
            .eq("id", msg.id);
          continue;
        }

        try {
          await sendSMS(phone, msg.body);
        } catch (smsErr) {
          const errMsg = smsErr instanceof Error ? smsErr.message : String(smsErr);
          throw new Error(`SMS failed: ${errMsg}`);
        }

        await supabase
          .from("doc_chase_messages")
          .update({ status: "sent", sent_at: nowIso })
          .eq("id", msg.id);

        await supabase
          .from("doc_chase_requests")
          .update({ escalation_level: "sms", escalation_updated_at: nowIso })
          .eq("id", req.id);

        results.sent++;
        continue;
      }

      // channel === 'email' — send via Resend
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.log(
          `[cron/doc-chase] RESEND_API_KEY not set — would send touch ${msg.touch_number} to ${req.client_email} | Subject: ${msg.subject}`
        );
      } else {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: fromEmail,
          to: req.client_email,
          subject: msg.subject,
          text: msg.body,
        });
      }

      await supabase
        .from("doc_chase_messages")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", msg.id);

      results.sent++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[cron/doc-chase] Failed to send message ${msg.id}:`,
        errMsg
      );
      results.errors.push(
        `${req.client_name} / touch ${msg.touch_number}: ${errMsg}`
      );
      results.failed++;
    }
  }

  // Check which sequences are now fully completed
  const seqIds = [...new Set(active.map((m) => m.sequence_id))];

  for (const seqId of seqIds) {
    const { data: allMsgs } = await supabase
      .from("doc_chase_messages")
      .select("status")
      .eq("sequence_id", seqId);

    const msgs = allMsgs ?? [];
    const allDone = msgs.every(
      (m) => m.status === "sent" || m.status === "cancelled"
    );
    const anySent = msgs.some((m) => m.status === "sent");

    if (allDone && anySent) {
      await supabase
        .from("doc_chase_sequences")
        .update({
          sequence_status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", seqId);
    }
  }

  console.log("[cron/doc-chase] Done:", results);
  return NextResponse.json(results);
}
