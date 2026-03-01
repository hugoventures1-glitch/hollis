/**
 * POST /api/doc-chase
 * Creates a new doc_chase_request + a 4-touch sequence immediately.
 * Claude Haiku drafts all 4 emails in one call; messages are stored as 'scheduled'.
 *
 * GET /api/doc-chase
 * Lists all doc_chase_requests for the authenticated user, ordered by created_at desc.
 * Each row is enriched with: sequence summary, touches_sent, touches_total, last_contact.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { draftDocumentChaseSequence } from "@/lib/doc-chase/generate";
import type { CreateDocChaseBody } from "@/types/doc-chase";

// Touch schedule: offsets in days from now
const TOUCH_DELAYS_DAYS = [0, 5, 10, 20];

// ── POST — create request + sequence ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateDocChaseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    client_name,
    client_email,
    client_phone,
    document_type,
    policy_id,
    notes,
    agent_name,
    agent_email,
  } = body;

  if (!client_name?.trim()) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }
  if (!client_email?.trim()) {
    return NextResponse.json({ error: "client_email is required" }, { status: 400 });
  }
  if (!document_type?.trim()) {
    return NextResponse.json({ error: "document_type is required" }, { status: 400 });
  }

  // If policy_id provided, verify it belongs to this user and pull agent info
  let resolvedAgentName = agent_name?.trim() || "";
  let resolvedAgentEmail = agent_email?.trim() || "";

  if (policy_id) {
    const { data: policy } = await supabase
      .from("policies")
      .select("id, agent_name, agent_email")
      .eq("id", policy_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }
    if (!resolvedAgentName && policy.agent_name) resolvedAgentName = policy.agent_name;
    if (!resolvedAgentEmail && policy.agent_email) resolvedAgentEmail = policy.agent_email;
  }

  // Fallback: try first policy with agent info if still missing
  if (!resolvedAgentEmail) {
    const { data: anyPolicy } = await supabase
      .from("policies")
      .select("agent_name, agent_email")
      .eq("user_id", user.id)
      .not("agent_email", "is", null)
      .limit(1)
      .maybeSingle();
    if (anyPolicy) {
      if (!resolvedAgentName) resolvedAgentName = anyPolicy.agent_name ?? "";
      if (!resolvedAgentEmail) resolvedAgentEmail = anyPolicy.agent_email ?? "";
    }
  }

  // Draft all 4 touches with Claude Haiku (touch 3 may be SMS, touch 4 is phone script)
  let touches: Awaited<ReturnType<typeof draftDocumentChaseSequence>>;
  try {
    touches = await draftDocumentChaseSequence(
      client_name.trim(),
      document_type.trim(),
      resolvedAgentName || "Your Agent",
      resolvedAgentEmail || (process.env.RESEND_FROM_EMAIL ?? "agent@hollis.ai"),
      notes ?? null,
      client_phone?.trim() || null
    );
  } catch (err) {
    console.error("[doc-chase] Draft sequence failed:", err);
    return NextResponse.json(
      { error: "Failed to draft email sequence" },
      { status: 500 }
    );
  }

  // Insert the request record
  const { data: req, error: reqErr } = await supabase
    .from("doc_chase_requests")
    .insert({
      user_id: user.id,
      client_name: client_name.trim(),
      client_email: client_email.trim().toLowerCase(),
      client_phone: client_phone?.trim() || null,
      document_type: document_type.trim(),
      policy_id: policy_id || null,
      notes: notes?.trim() || null,
      status: "active",
      escalation_level: "email",
    })
    .select()
    .single();

  if (reqErr || !req) {
    return NextResponse.json(
      { error: reqErr?.message ?? "Failed to create request" },
      { status: 500 }
    );
  }

  // Insert the sequence record
  const { data: seq, error: seqErr } = await supabase
    .from("doc_chase_sequences")
    .insert({
      user_id: user.id,
      request_id: req.id,
      sequence_status: "active",
    })
    .select()
    .single();

  if (seqErr || !seq) {
    // Roll back the request
    await supabase.from("doc_chase_requests").delete().eq("id", req.id);
    return NextResponse.json(
      { error: seqErr?.message ?? "Failed to create sequence" },
      { status: 500 }
    );
  }

  // Insert all 4 messages
  const now = new Date();
  const messageInserts = touches.map((touch, i) => {
    const scheduledFor = new Date(
      now.getTime() + TOUCH_DELAYS_DAYS[i] * 86_400_000
    );
    return {
      sequence_id: seq.id,
      touch_number: i + 1,
      scheduled_for: scheduledFor.toISOString(),
      status: "scheduled",
      subject: touch.subject ?? "",
      body: touch.body,
      channel: touch.channel,
      phone_script: touch.channel === "phone_script" ? touch.phone_script ?? null : null,
    };
  });

  const { error: msgErr } = await supabase
    .from("doc_chase_messages")
    .insert(messageInserts);

  if (msgErr) {
    // Roll back both sequence and request
    await supabase.from("doc_chase_sequences").delete().eq("id", seq.id);
    await supabase.from("doc_chase_requests").delete().eq("id", req.id);
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { request_id: req.id, sequence_id: seq.id, touches_scheduled: 4 },
    { status: 201 }
  );
}

// ── GET — list all requests ───────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Fetch all requests
    const { data: requests, error: reqErr } = await supabase
      .from("doc_chase_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (reqErr) {
      return NextResponse.json({ error: reqErr.message }, { status: 500 });
    }

    const rows = requests ?? [];

    if (rows.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    // Fetch all sequences for these requests
    const requestIds = rows.map((r) => r.id);
    const { data: sequences } = await supabase
      .from("doc_chase_sequences")
      .select("id, request_id, sequence_status, created_at, completed_at")
      .in("request_id", requestIds);

    const seqByRequestId = new Map(
      (sequences ?? []).map((s) => [s.request_id, s])
    );

    // Fetch all messages for those sequences
    const sequenceIds = (sequences ?? []).map((s) => s.id);
    const { data: messages } =
      sequenceIds.length > 0
        ? await supabase
            .from("doc_chase_messages")
            .select("sequence_id, touch_number, status, sent_at")
            .in("sequence_id", sequenceIds)
        : { data: [] };

    // Group messages by sequence_id
    const msgsBySeqId = new Map<string, typeof messages>();
    for (const msg of messages ?? []) {
      const arr = msgsBySeqId.get(msg.sequence_id) ?? [];
      arr.push(msg);
      msgsBySeqId.set(msg.sequence_id, arr);
    }

    // Enrich each request
    const enriched = rows.map((r) => {
      const seq = seqByRequestId.get(r.id) ?? null;
      const msgs = seq ? (msgsBySeqId.get(seq.id) ?? []) : [];

      const touchesSent = msgs.filter((m) => m.status === "sent").length;
      const touchesTotal = msgs.length > 0 ? msgs.length : 4;

      const sentMsgs = msgs
        .filter((m) => m.sent_at)
        .sort(
          (a, b) =>
            new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime()
        );
      const lastContact = sentMsgs[0]?.sent_at ?? null;

      return {
        ...r,
        sequence: seq
          ? {
              id: seq.id,
              sequence_status: seq.sequence_status,
              created_at: seq.created_at,
            }
          : null,
        touches_sent: touchesSent,
        touches_total: touchesTotal,
        last_contact: lastContact,
      };
    });

    return NextResponse.json({ requests: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
