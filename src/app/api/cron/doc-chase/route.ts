/**
 * GET /api/cron/doc-chase
 *
 * Daily cron job — sends all document-chase messages whose scheduled_for
 * is <= now() and status = 'scheduled'.
 *
 * Protected by CRON_SECRET header (same pattern as /api/cron/renewals).
 * Runs as service role (admin client) to bypass RLS.
 *
 * Vercel schedule: 0 9 * * * (9 AM UTC daily)
 *
 * After sending each message:
 *   - Marks it as 'sent' with sent_at timestamp.
 *   - If all 4 touches are now sent/cancelled, marks the sequence as 'completed'.
 *
 * Returns: { processed, sent, failed, errors[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RequestRow {
  id: string;
  client_name: string;
  client_email: string;
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
      doc_chase_sequences (
        id,
        sequence_status,
        doc_chase_requests (
          id,
          client_name,
          client_email,
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

  for (const msg of active) {
    const seq = msg.doc_chase_sequences;
    const req = seq.doc_chase_requests;

    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        // Development mode — log instead of send
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

      // Mark message as sent
      await supabase
        .from("doc_chase_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);

      results.sent++;
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);
      console.error(
        `[cron/doc-chase] Failed to send message ${msg.id}:`,
        errMsg
      );
      results.errors.push(
        `${req.client_name} / touch ${msg.touch_number}: ${errMsg}`
      );
      results.failed++;
      // Continue — never abort the entire batch for one failure
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
