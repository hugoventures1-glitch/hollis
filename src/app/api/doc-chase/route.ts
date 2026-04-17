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
import { writeAuditLog } from "@/lib/audit/log";

/**
 * Touch cadence adapts to days until policy expiry:
 *   ≤ 7 days  → 0 / 1 / 2 / 4   (near-daily — critical)
 *   ≤ 14 days → 0 / 2 / 4 / 7   (every 2–3 days)
 *   ≤ 30 days → 0 / 3 / 6 / 12  (twice-a-week cadence)
 *   ≤ 60 days → 0 / 5 / 10 / 20 (standard)
 *   > 60 days / no policy → 0 / 7 / 14 / 28 (relaxed)
 */
function computeTouchDelays(daysUntilExpiry: number | null): [number, number, number, number] {
  if (daysUntilExpiry !== null && daysUntilExpiry <= 7)  return [0, 1, 2, 4];
  if (daysUntilExpiry !== null && daysUntilExpiry <= 14) return [0, 2, 4, 7];
  if (daysUntilExpiry !== null && daysUntilExpiry <= 30) return [0, 3, 6, 12];
  if (daysUntilExpiry !== null && daysUntilExpiry <= 60) return [0, 5, 10, 20];
  return [0, 7, 14, 28];
}

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
    touch_delays: rawTouchDelays,
  } = body;

  // Validate custom touch_delays if provided: 4 non-negative integers, each >= previous
  let customTouchDelays: [number, number, number, number] | null = null;
  if (rawTouchDelays !== undefined) {
    if (
      !Array.isArray(rawTouchDelays) ||
      rawTouchDelays.length !== 4 ||
      !rawTouchDelays.every((d: unknown) => typeof d === "number" && Number.isInteger(d) && d >= 0)
    ) {
      return NextResponse.json(
        { error: "touch_delays must be an array of 4 non-negative integers" },
        { status: 400 }
      );
    }
    const [d1, d2, d3, d4] = rawTouchDelays as number[];
    if (d2 < d1 || d3 < d2 || d4 < d3) {
      return NextResponse.json(
        { error: "touch_delays must be non-decreasing" },
        { status: 400 }
      );
    }
    customTouchDelays = [d1, d2, d3, d4];
  }

  if (!client_name?.trim()) {
    return NextResponse.json({ error: "client_name is required" }, { status: 400 });
  }
  if (!client_email?.trim()) {
    return NextResponse.json({ error: "client_email is required" }, { status: 400 });
  }
  if (!document_type?.trim()) {
    return NextResponse.json({ error: "document_type is required" }, { status: 400 });
  }

  // If policy_id provided, verify it belongs to this user and pull agent info + expiry
  let resolvedAgentName = agent_name?.trim() || "";
  let resolvedAgentEmail = agent_email?.trim() || "";
  let daysUntilExpiry: number | null = null;

  if (policy_id) {
    const { data: policy } = await supabase
      .from("policies")
      .select("id, agent_name, agent_email, expiration_date")
      .eq("id", policy_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }
    if (!resolvedAgentName && policy.agent_name) resolvedAgentName = policy.agent_name;
    if (!resolvedAgentEmail && policy.agent_email) resolvedAgentEmail = policy.agent_email;
    if (policy.expiration_date) {
      const exp = new Date(policy.expiration_date + "T00:00:00");
      const nowDate = new Date();
      nowDate.setHours(0, 0, 0, 0);
      daysUntilExpiry = Math.ceil((exp.getTime() - nowDate.getTime()) / 86_400_000);
    }
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
      resolvedAgentEmail || (process.env.FROM_EMAIL ?? "hugo@hollisai.com.au"),
      notes ?? null,
      client_phone?.trim() || null,
      daysUntilExpiry
    );
  } catch (err) {
    console.error("[doc-chase] Draft sequence failed:", err);
    return NextResponse.json(
      { error: "Failed to draft email sequence" },
      { status: 500 }
    );
  }

  const touchDelays = customTouchDelays ?? computeTouchDelays(daysUntilExpiry);

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
      now.getTime() + touchDelays[i] * 86_400_000
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

  // Write to renewal audit log if this doc chase is linked to a policy
  if (policy_id) {
    await writeAuditLog({
      supabase,
      policy_id,
      user_id: user.id,
      event_type: "doc_requested",
      channel: "email",
      recipient: client_email.trim().toLowerCase(),
      content_snapshot: `Document requested: ${document_type.trim()}${notes?.trim() ? ` — ${notes.trim()}` : ""}`,
      metadata: {
        doc_chase_request_id: req.id,
        document_type: document_type.trim(),
        client_name: client_name.trim(),
      },
      actor_type: "agent",
    });
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
