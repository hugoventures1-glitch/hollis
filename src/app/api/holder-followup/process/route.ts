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
 * Race-safety: messages are atomically claimed (status → 'processing') before
 * any external send. Stale claims (> 10 min) are reset to 'scheduled' at startup.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface SequenceRow {
  id: string;
  holder_name: string;
  holder_email: string;
  user_id: string;
  sequence_status: string;
}

interface MessageRow {
  id: string;
  sequence_id: string;
  touch_number: number;
  subject: string;
  body: string;
  holder_followup_sequences: SequenceRow;
}

const STALE_CLAIM_MINUTES = 10;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();

  // Open a durable run record
  const { data: runRow } = await supabase
    .from("cron_job_runs")
    .insert({ job_name: "holder-followup", status: "running" })
    .select("id")
    .single();
  const runId: string | null = runRow?.id ?? null;

  // Reset stale claims from crashed or timed-out previous runs
  await supabase
    .from("holder_followup_messages")
    .update({ status: "scheduled", processing_started_at: null })
    .eq("status", "processing")
    .lt("processing_started_at", staleThreshold);

  // Atomically claim all due messages in one update
  const { data: claimedIds, error: claimErr } = await supabase
    .from("holder_followup_messages")
    .update({ status: "processing", processing_started_at: now })
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .select("id");

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  const ids = (claimedIds ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, processed: 0, message: "No messages due" });
  }

  // Re-fetch claimed messages with sequence joins
  const { data: fetchedMsgs, error: fetchErr } = await supabase
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
    .in("id", ids);

  if (fetchErr) {
    await supabase
      .from("holder_followup_messages")
      .update({ status: "scheduled", processing_started_at: null })
      .in("id", ids);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const allMessages = (fetchedMsgs ?? []) as unknown as MessageRow[];

  // Filter to only messages whose sequence is still active
  const active = allMessages.filter(
    (m) => m.holder_followup_sequences.sequence_status === "active"
  );

  // Release claims for inactive sequences
  const inactiveIds = allMessages.filter(m => !active.includes(m)).map(m => m.id);
  if (inactiveIds.length) {
    await supabase
      .from("holder_followup_messages")
      .update({ status: "scheduled", processing_started_at: null })
      .in("id", inactiveIds);
  }

  if (active.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, processed: 0, message: "No active messages due" });
  }

  let sent = 0;
  let failed = 0;
  const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";

  // Build sender name cache for all unique broker IDs in this batch
  const uniqueUserIds = [...new Set(active.map((m) => m.holder_followup_sequences.user_id))];
  const senderNameCache = new Map<string, string>();
  if (uniqueUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("agent_profiles")
      .select("user_id, email_from_name")
      .in("user_id", uniqueUserIds);
    for (const p of profiles ?? []) {
      senderNameCache.set(
        p.user_id,
        p.email_from_name ? `${p.email_from_name} <${baseFrom}>` : baseFrom
      );
    }
  }

  for (const msg of active) {
    const seq = msg.holder_followup_sequences;

    // Throttle: skip if we already sent to this holder for this sequence within 48 h
    const windowStart = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentSends } = await supabase
      .from("holder_followup_messages")
      .select("id")
      .eq("sequence_id", msg.sequence_id)
      .eq("status", "sent")
      .gte("sent_at", windowStart)
      .limit(1);

    if (recentSends?.length) {
      await supabase
        .from("holder_followup_messages")
        .update({ status: "scheduled", processing_started_at: null })
        .eq("id", msg.id);
      continue;
    }

    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.log(
          `[holder-followup/process] RESEND_API_KEY not set — would send touch ${msg.touch_number} to ${seq.holder_email}`
        );
      } else {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: senderNameCache.get(seq.user_id) ?? baseFrom,
          to: seq.holder_email,
          subject: msg.subject,
          text: msg.body,
        });
      }

      await supabase
        .from("holder_followup_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);

      sent++;
    } catch (err) {
      console.error(`[holder-followup/process] Failed to send message ${msg.id}:`, err);
      failed++;
      // Release claim so next run can retry
      await supabase
        .from("holder_followup_messages")
        .update({ status: "scheduled", processing_started_at: null })
        .eq("id", msg.id);
    }
  }

  // Mark sequences as completed if all their messages are done
  const seqIds = [...new Set(active.map((m) => m.sequence_id))];
  for (const seqId of seqIds) {
    const { data: allMsgs } = await supabase
      .from("holder_followup_messages")
      .select("status")
      .eq("sequence_id", seqId);

    const msgs = allMsgs ?? [];
    const allDone = msgs.every((m) => m.status === "sent" || m.status === "cancelled");
    const anySent = msgs.some((m) => m.status === "sent");

    if (allDone && anySent) {
      await supabase
        .from("holder_followup_sequences")
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
        processed: active.length,
        sent,
        failed,
        error_summary: failed > 0 ? `${failed} message(s) failed` : null,
      })
      .eq("id", runId);
  }

  return NextResponse.json({ sent, failed, processed: active.length });
}
