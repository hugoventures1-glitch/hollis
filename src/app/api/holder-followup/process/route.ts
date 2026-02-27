/**
 * POST /api/holder-followup/process
 *
 * Hourly cron job — sends all holder follow-up messages whose
 * scheduled_for is <= now() and status = 'scheduled'.
 *
 * Protected by CRON_SECRET header (same pattern as /api/cron/renewals).
 * Runs as service role (admin client) to bypass RLS.
 *
 * Vercel schedule: 0 * * * * (every hour)
 *
 * If RESEND_API_KEY is not configured, logs the send attempt and continues.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface SequenceRow {
  id: string;
  holder_name: string;
  holder_email: string;
  user_id: string;
}

interface MessageRow {
  id: string;
  sequence_id: string;
  touch_number: number;
  subject: string;
  body: string;
  holder_followup_sequences: SequenceRow;
}

export async function POST(request: NextRequest) {
  // Auth check — must match CRON_SECRET
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Fetch all due messages — join sequence for holder email
  const { data: dueMsgs, error: fetchErr } = await supabase
    .from("holder_followup_messages")
    .select(`
      id,
      sequence_id,
      touch_number,
      subject,
      body,
      holder_followup_sequences (
        id,
        holder_name,
        holder_email,
        user_id,
        sequence_status
      )
    `)
    .eq("status", "scheduled")
    .lte("scheduled_for", now);

  if (fetchErr) {
    console.error("[holder-followup/process] Failed to fetch messages:", fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const messages = (dueMsgs ?? []) as unknown as MessageRow[];

  // Filter out messages whose sequence has been cancelled
  const active = messages.filter(
    (m) =>
      (m.holder_followup_sequences as unknown as { sequence_status: string })
        .sequence_status === "active"
  );

  if (active.length === 0) {
    return NextResponse.json({ sent: 0, message: "No messages due" });
  }

  let sent = 0;
  let failed = 0;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ?? "followups@hollis.ai";

  for (const msg of active) {
    const seq = msg.holder_followup_sequences;

    // Attempt send via Resend
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.log(
          `[holder-followup/process] RESEND_API_KEY not set — would send touch ${msg.touch_number} to ${seq.holder_email} | Subject: ${msg.subject}`
        );
      } else {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: fromEmail,
          to: seq.holder_email,
          subject: msg.subject,
          text: msg.body,
        });
      }

      // Mark as sent
      await supabase
        .from("holder_followup_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);

      sent++;
    } catch (err) {
      console.error(
        `[holder-followup/process] Failed to send message ${msg.id}:`,
        err
      );
      failed++;
      // Don't throw — continue processing other messages
    }
  }

  // After sending, check which sequences are now fully completed
  // Get unique sequence IDs that had activity
  const seqIds = [...new Set(active.map((m) => m.sequence_id))];

  for (const seqId of seqIds) {
    const { data: allMsgs } = await supabase
      .from("holder_followup_messages")
      .select("status")
      .eq("sequence_id", seqId);

    const msgs = allMsgs ?? [];
    const allDone = msgs.every(
      (m) => m.status === "sent" || m.status === "cancelled"
    );
    const anySent = msgs.some((m) => m.status === "sent");

    if (allDone && anySent) {
      await supabase
        .from("holder_followup_sequences")
        .update({
          sequence_status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", seqId);
    }
  }

  return NextResponse.json({ sent, failed, processed: active.length });
}
