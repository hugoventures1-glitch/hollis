/**
 * GET /api/clients/[id]/timeline
 *
 * Unified communication history for a client across renewals, doc chases, and COIs.
 * Auth: require session, verify client belongs to user.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type TimelineItem = {
  id: string;
  source: "renewal" | "doc_chase" | "coi";
  channel: "email" | "sms" | "phone_script" | "coi";
  status: string;
  timestamp: string;
  subject?: string;
  description: string;
  link?: string;
};

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch client and verify ownership
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (clientErr || !client)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clientName = client.name ?? "";
  const clientEmail = (client.email ?? "").trim().toLowerCase();

  // Run all three queries in parallel
  const [renewalLogs, docChaseMsgs, coiCerts] = await Promise.all([
    fetchRenewalLogs(supabase, user.id, clientName, clientEmail),
    fetchDocChaseMessages(supabase, user.id, clientName, clientEmail),
    fetchCOISends(supabase, user.id, clientName, clientEmail),
  ]);

  // Map to timeline format
  const items: TimelineItem[] = [];

  for (const log of renewalLogs) {
    items.push({
      id: log.id,
      source: "renewal",
      channel: log.channel === "sms" ? "sms" : "email",
      status: log.status,
      timestamp: log.sent_at,
      subject: undefined,
      description: `Renewal ${log.channel} · ${log.policy_name ?? "Policy"}`,
      link: log.policy_id ? `/renewals/${log.policy_id}` : undefined,
    });
  }

  for (const msg of docChaseMsgs) {
    const ch =
      msg.channel === "sms"
        ? "sms"
        : msg.channel === "phone_script"
          ? "phone_script"
          : "email";
    items.push({
      id: msg.id,
      source: "doc_chase",
      channel: ch,
      status: msg.status,
      timestamp: msg.sent_at ?? msg.scheduled_for,
      subject: msg.subject || undefined,
      description: `Doc chase touch ${msg.touch_number} · ${msg.document_type ?? "Document"}`,
      link: "/documents",
    });
  }

  for (const cert of coiCerts) {
    items.push({
      id: cert.id,
      source: "coi",
      channel: "coi",
      status: cert.status,
      timestamp: cert.sent_at!,
      description: `COI sent · ${cert.holder_name ?? "Certificate"}`,
      link: `/certificates/${cert.id}`,
    });
  }

  // Sort by timestamp ascending (oldest first), limit 50
  items.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return NextResponse.json({ items: items.slice(0, 50) });
}

async function fetchRenewalLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clientName: string,
  clientEmail: string
) {
  const { data: policies } = await supabase
    .from("policies")
    .select("id, policy_name, client_name")
    .eq("user_id", userId);
  const matchingPolicies = (policies ?? []).filter(
    (p) =>
      p.client_name?.toLowerCase().includes(clientName.toLowerCase()) ||
      clientName.toLowerCase().includes((p.client_name ?? "").toLowerCase())
  );
  const policyIds = matchingPolicies.map((p) => p.id);
  const policyByName = new Map(matchingPolicies.map((p) => [p.id, p.policy_name]));

  const seenIds = new Set<string>();
  const results: Array<{
    id: string;
    channel: string;
    status: string;
    recipient: string;
    sent_at: string;
    policy_id: string | null;
    policy_name: string | null;
  }> = [];

  if (clientEmail) {
    const { data: byRecipient } = await supabase
      .from("send_logs")
      .select("id, channel, status, recipient, sent_at, policy_id")
      .eq("user_id", userId)
      .ilike("recipient", clientEmail)
      .order("sent_at", { ascending: false })
      .limit(50);
    for (const row of byRecipient ?? []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push({
          ...row,
          policy_name: row.policy_id ? policyByName.get(row.policy_id) ?? null : null,
        });
      }
    }
  }

  if (policyIds.length > 0) {
    const { data: byPolicy } = await supabase
      .from("send_logs")
      .select("id, channel, status, recipient, sent_at, policy_id")
      .eq("user_id", userId)
      .in("policy_id", policyIds)
      .order("sent_at", { ascending: false })
      .limit(50);
    for (const row of byPolicy ?? []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push({
          ...row,
          policy_name: row.policy_id ? policyByName.get(row.policy_id) ?? null : null,
        });
      }
    }
  }

  results.sort(
    (a, b) =>
      new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
  );
  return results.slice(0, 50);
}

async function fetchDocChaseMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clientName: string,
  clientEmail: string
) {
  const { data: reqs } = await supabase
    .from("doc_chase_requests")
    .select("id, client_name, client_email, document_type")
    .eq("user_id", userId);

  const matchReqIds = (reqs ?? [])
    .filter(
      (r) =>
        (clientEmail &&
          r.client_email?.toLowerCase().trim() === clientEmail) ||
        (clientName &&
          (r.client_name?.toLowerCase().includes(clientName.toLowerCase()) ||
            clientName.toLowerCase().includes((r.client_name ?? "").toLowerCase())))
    )
    .map((r) => r.id);

  if (matchReqIds.length === 0) return [];

  const { data: seqs } = await supabase
    .from("doc_chase_sequences")
    .select("id, request_id")
    .in("request_id", matchReqIds);

  if (!seqs?.length) return [];

  const reqDocType = new Map(
    (reqs ?? [])
      .filter((r) => matchReqIds.includes(r.id))
      .map((r) => [r.id, r.document_type])
  );
  const seqToReq = new Map(seqs.map((s) => [s.id, s.request_id]));

  const seqIds = seqs.map((s) => s.id);

  const { data: msgs } = await supabase
    .from("doc_chase_messages")
    .select("id, sequence_id, touch_number, channel, status, sent_at, scheduled_for, subject")
    .in("sequence_id", seqIds)
    .in("status", ["sent", "scheduled"]);

  return (msgs ?? []).map((m) => {
    const reqId = seqToReq.get(m.sequence_id);
    return {
      id: m.id,
      touch_number: m.touch_number,
      channel: (m.channel as string) ?? "email",
      status: m.status,
      sent_at: m.sent_at,
      scheduled_for: m.scheduled_for,
      subject: m.subject,
      document_type: reqId ? reqDocType.get(reqId) ?? "Document" : "Document",
      request_id: reqId,
    };
  });
}

async function fetchCOISends(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clientName: string,
  clientEmail: string
) {
  if (!clientEmail && !clientName) return [];

  const seenIds = new Set<string>();
  const results: Array<{
    id: string;
    certificate_number: string | null;
    holder_name: string | null;
    sent_to_email: string | null;
    sent_at: string | null;
    status: string;
  }> = [];

  const baseQuery = () =>
    supabase
      .from("certificates")
      .select("id, certificate_number, holder_name, sent_to_email, sent_at, status")
      .eq("user_id", userId)
      .not("sent_at", "is", null);

  if (clientEmail) {
    const { data } = await baseQuery()
      .ilike("sent_to_email", clientEmail)
      .order("sent_at", { ascending: false })
      .limit(50);
    for (const row of data ?? []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push(row);
      }
    }
  }

  if (clientName.trim()) {
    const { data } = await baseQuery()
      .ilike("insured_name", `%${clientName.trim()}%`)
      .order("sent_at", { ascending: false })
      .limit(50);
    for (const row of data ?? []) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push(row);
      }
    }
  }

  results.sort(
    (a, b) =>
      new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime()
  );
  return results.slice(0, 50);
}
