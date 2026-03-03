/**
 * GET /api/cron/doc-chase
 *
 * Daily cron job — sends all document-chase messages whose scheduled_for
 * is <= now() and status = 'scheduled'.
 *
 * - email: send via Resend
 * - sms: send via Twilio (requires client_phone; else mark cancelled)
 * - phone_script: don't send; mark as 'sent' (surfaced in UI), update escalation
 *
 * Protected by CRON_SECRET. Vercel schedule: 0 9 * * * (9 AM UTC daily)
 *
 * Race-safety: messages are atomically claimed (status → 'processing') before
 * any external send. Stale claims (> 10 min) are reset to 'scheduled' at startup.
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

const STALE_CLAIM_MINUTES = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();

  // Open a durable run record
  const { data: runRow } = await supabase
    .from("cron_job_runs")
    .insert({ job_name: "doc-chase", status: "running" })
    .select("id")
    .single();
  const runId: string | null = runRow?.id ?? null;

  // Reset stale claims from crashed or timed-out previous runs
  await supabase
    .from("doc_chase_messages")
    .update({ status: "scheduled", processing_started_at: null })
    .eq("status", "processing")
    .lt("processing_started_at", staleThreshold);

  // Atomically claim all due messages in one update
  const { data: claimedIds, error: claimErr } = await supabase
    .from("doc_chase_messages")
    .update({ status: "processing", processing_started_at: now })
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .select("id");

  if (claimErr) {
    console.error("[cron/doc-chase] Failed to claim messages:", claimErr.message);
    if (runId) {
      await supabase
        .from("cron_job_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_summary: claimErr.message })
        .eq("id", runId);
    }
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  const ids = (claimedIds ?? []).map((r) => r.id);
  if (ids.length === 0) {
    console.log("[cron/doc-chase] No messages due.");
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, errors: [] });
  }

  // Re-fetch claimed messages with sequence + request joins
  const { data: fetchedMsgs, error: fetchErr } = await supabase
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
    .in("id", ids);

  if (fetchErr) {
    // Release claims so next run can retry
    await supabase
      .from("doc_chase_messages")
      .update({ status: "scheduled", processing_started_at: null })
      .in("id", ids);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const allMessages = (fetchedMsgs ?? []) as unknown as MessageRow[];

  // Skip messages where the sequence or request is no longer active
  const active = allMessages.filter((m) => {
    const seq = m.doc_chase_sequences;
    const req = seq?.doc_chase_requests;
    return (
      seq?.sequence_status === "active" &&
      req?.status !== "received" &&
      req?.status !== "cancelled"
    );
  });

  // Release claims for messages we won't send (inactive sequences)
  const inactiveIds = allMessages.filter(m => !active.includes(m)).map(m => m.id);
  if (inactiveIds.length) {
    await supabase
      .from("doc_chase_messages")
      .update({ status: "scheduled", processing_started_at: null })
      .in("id", inactiveIds);
  }

  const results = {
    processed: active.length,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  if (active.length === 0) {
    console.log("[cron/doc-chase] No active messages to send.");
    return NextResponse.json(results);
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "documents@hollis.ai";
  const nowIso = new Date().toISOString();

  for (const msg of active) {
    const seq = msg.doc_chase_sequences;
    const req = seq.doc_chase_requests;
    const channel = msg.channel ?? "email";

    // Throttle: skip if we already sent to this contact for this sequence within 48 h
    if (channel === "email" || channel === "sms") {
      const windowStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: recentSends } = await supabase
        .from("doc_chase_messages")
        .select("id")
        .eq("sequence_id", msg.sequence_id)
        .eq("status", "sent")
        .gte("sent_at", windowStart)
        .limit(1);

      if (recentSends?.length) {
        await supabase
          .from("doc_chase_messages")
          .update({ status: "scheduled", processing_started_at: null })
          .eq("id", msg.id);
        continue;
      }
    }

    try {
      if (channel === "phone_script") {
        await supabase
          .from("doc_chase_messages")
          .update({ status: "sent", sent_at: nowIso })
          .eq("id", msg.id);

        await supabase
          .from("doc_chase_requests")
          .update({ escalation_level: "phone_script", escalation_updated_at: nowIso })
          .eq("id", req.id);

        results.sent++;
        continue;
      }

      if (channel === "sms") {
        const phone = req.client_phone?.trim();
        if (!phone) {
          await supabase
            .from("doc_chase_messages")
            .update({ status: "cancelled" })
            .eq("id", msg.id);
          continue;
        }

        await sendSMS(phone, msg.body);

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

      // channel === 'email'
      // Bounce suppression: skip if the address has previously hard-bounced
      const { data: clientRow } = await supabase
        .from("clients")
        .select("email_bounced")
        .eq("email", req.client_email)
        .maybeSingle();
      if (clientRow?.email_bounced) {
        throw new Error("Email address has bounced — send suppressed");
      }

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.log(
          `[cron/doc-chase] RESEND_API_KEY not set — would send touch ${msg.touch_number} to ${req.client_email}`
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
      console.error(`[cron/doc-chase] Failed to send message ${msg.id}:`, errMsg);
      results.errors.push(`${req.client_name} / touch ${msg.touch_number}: ${errMsg}`);
      results.failed++;
      // Release claim so next run can retry
      await supabase
        .from("doc_chase_messages")
        .update({ status: "scheduled", processing_started_at: null })
        .eq("id", msg.id);
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
    const allDone = msgs.every((m) => m.status === "sent" || m.status === "cancelled");
    const anySent = msgs.some((m) => m.status === "sent");

    if (allDone && anySent) {
      await supabase
        .from("doc_chase_sequences")
        .update({ sequence_status: "completed", completed_at: new Date().toISOString() })
        .eq("id", seqId);
    }
  }

  if (runId) {
    await supabase
      .from("cron_job_runs")
      .update({
        status: "complete",
        finished_at: new Date().toISOString(),
        processed: results.processed,
        sent: results.sent,
        failed: results.failed,
        error_summary: results.errors.length ? results.errors.join("; ") : null,
      })
      .eq("id", runId);
  }

  console.log("[cron/doc-chase] Done:", results);
  return NextResponse.json(results);
}
