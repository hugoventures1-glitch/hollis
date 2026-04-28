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
import { logAction, retainStandard } from "@/lib/logAction";

interface RequestRow {
  id: string;
  user_id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  document_type: string;
  policy_id: string | null;
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
    // Always close the run record, even when there's nothing to do
    if (runId) {
      await supabase
        .from("cron_job_runs")
        .update({ status: "complete", finished_at: new Date().toISOString(), processed: 0, sent: 0, failed: 0 })
        .eq("id", runId);
    }
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
          user_id,
          client_name,
          client_email,
          client_phone,
          document_type,
          policy_id,
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

  const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
  const nowIso = new Date().toISOString();

  // Build sender name + reply_to + signature cache for all unique broker IDs in this batch
  const uniqueUserIds = [...new Set(active.map((m) => m.doc_chase_sequences.doc_chase_requests.user_id))];
  const senderNameCache = new Map<string, string>();
  const replyToCache = new Map<string, string | undefined>();
  const signatureCache = new Map<string, string | null>();
  if (uniqueUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("agent_profiles")
      .select("user_id, email_from_name, signal_token, email_signature")
      .in("user_id", uniqueUserIds);
    for (const p of profiles ?? []) {
      senderNameCache.set(
        p.user_id,
        p.email_from_name ? `${p.email_from_name} <${baseFrom}>` : baseFrom
      );
      replyToCache.set(
        p.user_id,
        p.signal_token ? `${p.signal_token}@ildaexi.resend.app` : undefined
      );
      signatureCache.set(p.user_id, p.email_signature ?? null);
    }
  }

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

        void logAction({
          broker_id: req.user_id,
          policy_id: req.policy_id ?? null,
          action_type: "doc_chase_escalated",
          trigger_reason: `Document chase for ${req.document_type} from ${req.client_name} escalated to phone script (touch ${msg.touch_number} of sequence).`,
          payload: {
            body: msg.body,
            recipient_name: req.client_name,
            channel: "phone_script",
            template_used: `doc_chase_touch_${msg.touch_number}`,
          },
          metadata: {
            doc_chase_request_id: req.id,
            sequence_id: msg.sequence_id,
            touch_number: msg.touch_number,
            document_type: req.document_type,
          },
          outcome: "escalated",
          retain_until: retainStandard(),
        });

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

        void logAction({
          broker_id: req.user_id,
          policy_id: req.policy_id ?? null,
          action_type: "doc_chase_sms",
          trigger_reason: `Document chase SMS sent to ${req.client_name} requesting ${req.document_type} (touch ${msg.touch_number} of sequence).`,
          payload: {
            body: msg.body,
            recipient_name: req.client_name,
            channel: "sms",
            template_used: `doc_chase_touch_${msg.touch_number}`,
          },
          metadata: {
            doc_chase_request_id: req.id,
            sequence_id: msg.sequence_id,
            touch_number: msg.touch_number,
            document_type: req.document_type,
          },
          outcome: "sent",
          retain_until: retainStandard(),
        });

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
      const emailSig = signatureCache.get(req.user_id) ?? null;
      const sigSuffix = emailSig?.trim()
        ? `\n\n---\n\n${emailSig.trim()}`
        : "";
      const bodyWithSig = msg.body + sigSuffix;
      if (!resendKey) {
        console.log(
          `[cron/doc-chase] RESEND_API_KEY not set — would send touch ${msg.touch_number} to ${req.client_email}`
        );
      } else {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        const replyTo = replyToCache.get(req.user_id);
        await resend.emails.send({
          from: senderNameCache.get(req.user_id) ?? baseFrom,
          to: req.client_email,
          subject: msg.subject,
          text: bodyWithSig,
          ...(replyTo ? { reply_to: replyTo } : {}),
        });
      }

      await supabase
        .from("doc_chase_messages")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", msg.id);

      void logAction({
        broker_id: req.user_id,
        policy_id: req.policy_id ?? null,
        action_type: "doc_chase_email",
        trigger_reason: `Document chase email sent to ${req.client_name} requesting ${req.document_type} (touch ${msg.touch_number} of sequence).`,
        payload: {
          subject: msg.subject,
          body: msg.body,
          recipient_email: req.client_email,
          recipient_name: req.client_name,
          channel: "email",
          template_used: `doc_chase_touch_${msg.touch_number}`,
        },
        metadata: {
          doc_chase_request_id: req.id,
          sequence_id: msg.sequence_id,
          touch_number: msg.touch_number,
          document_type: req.document_type,
        },
        outcome: "sent",
        retain_until: retainStandard(),
      });

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
