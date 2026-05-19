/**
 * /inbox — Hollis Agent Inbox
 *
 * Tier 2 decisions surface here as "messages from Hollis" awaiting broker action.
 * Tier 3 alerts (coming) will appear as urgent escalations in the same view.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox — Hollis" };

export interface DocChaseReplyItem {
  id: string;
  client_name: string;
  client_email: string;
  document_type: string;
  status: string;
  last_client_reply: string | null;
  last_client_reply_at: string | null;
  received_attachment_path: string | null;
  received_attachment_filename: string | null;
  received_attachment_content_type: string | null;
  validation_status: "pass" | "fail" | "partial" | "unreadable" | null;
  validation_summary: string | null;
  validation_issues: string[] | null;
  draft_reply_subject: string | null;
  draft_reply_body: string | null;
  created_at: string;
}

export interface SentEmail {
  id: string;
  content_snapshot: string | null;
  recipient: string | null;
  created_at: string;
}

export interface InboxItem {
  id: string;
  policy_id: string;
  signal_id: string | null;
  tier: 2 | 3;
  classified_intent: string;
  confidence_score: number;
  raw_signal_snippet: string;
  raw_signal: string | null;
  sender_email: string | null;
  proposed_action: {
    description: string;
    action_type: string;
    payload: Record<string, unknown>;
  };
  status: "pending" | "approved" | "rejected" | "edited";
  doc_chase_request_id: string | null;
  created_at: string;
  policies: {
    id: string;
    client_name: string;
    policy_name: string;
    expiration_date: string;
    carrier: string | null;
    campaign_stage: string | null;
  } | null;
  sent_emails: SentEmail[];
}

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const queueSelect = `
    id,
    policy_id,
    signal_id,
    classified_intent,
    confidence_score,
    raw_signal_snippet,
    proposed_action,
    status,
    doc_chase_request_id,
    tier,
    created_at,
    policies!inner (
      id,
      client_name,
      policy_name,
      expiration_date,
      carrier,
      campaign_stage
    )
  `;

  const [
    { data: regularItems },
    { data: escalationItems },
    { data: suggestionItems },
    { data: docChaseReplies },
  ] = await Promise.all([
    // Regular tier-2 items — filter out finished policies
    supabase
      .from("approval_queue")
      .select(queueSelect)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("tier", 2)
      .neq("classified_intent", "ai_suggestion")
      .not("policies.campaign_stage", "in", '(confirmed,lapsed,final_notice_sent,complete)')
      .order("created_at", { ascending: false }),

    // Tier-3 escalations — always surface regardless of policy stage
    supabase
      .from("approval_queue")
      .select(queueSelect)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("tier", 3)
      .order("created_at", { ascending: false }),

    // AI suggestions — no campaign stage filter
    supabase
      .from("approval_queue")
      .select(queueSelect)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .eq("classified_intent", "ai_suggestion")
      .order("created_at", { ascending: false }),

    supabase
      .from("doc_chase_requests")
      .select(
        "id, client_name, client_email, document_type, status, last_client_reply, last_client_reply_at, received_attachment_path, received_attachment_filename, received_attachment_content_type, validation_status, validation_summary, validation_issues, draft_reply_subject, draft_reply_body, created_at"
      )
      .eq("user_id", user.id)
      .not("last_client_reply", "is", null)
      .in("status", ["pending", "active"])
      .order("last_client_reply_at", { ascending: false })
      .limit(50),
  ]);

  // Collect signal IDs to fetch full raw signals for complete email viewing
  const allQueueItems = [...(regularItems ?? []), ...(escalationItems ?? []), ...(suggestionItems ?? [])];
  const signalIds = allQueueItems
    .map((i) => (i as unknown as { signal_id?: string | null }).signal_id)
    .filter((id): id is string => Boolean(id));

  let signalMap: Record<string, string> = {};
  let senderEmailMap: Record<string, string | null> = {};
  if (signalIds.length > 0) {
    const { data: signals } = await supabase
      .from("inbound_signals")
      .select("id, raw_signal, sender_email")
      .in("id", signalIds);
    signalMap = Object.fromEntries(
      (signals ?? []).map((s) => [s.id as string, s.raw_signal as string])
    );
    senderEmailMap = Object.fromEntries(
      (signals ?? []).map((s) => [s.id as string, (s as unknown as { sender_email?: string | null }).sender_email ?? null])
    );
  }

  // Fetch sent emails from audit log for all relevant policies
  const policyIds = [...new Set(allQueueItems.map((i) => (i as unknown as { policy_id: string }).policy_id))];
  let sentEmailsByPolicy: Record<string, SentEmail[]> = {};
  if (policyIds.length > 0) {
    const { data: auditRows } = await supabase
      .from("renewal_audit_log")
      .select("id, policy_id, content_snapshot, recipient, created_at")
      .in("policy_id", policyIds)
      .eq("event_type", "email_sent")
      .order("created_at", { ascending: true });
    for (const row of auditRows ?? []) {
      const pid = (row as unknown as { policy_id: string }).policy_id;
      if (!sentEmailsByPolicy[pid]) sentEmailsByPolicy[pid] = [];
      sentEmailsByPolicy[pid].push({
        id: row.id as string,
        content_snapshot: (row as unknown as { content_snapshot: string | null }).content_snapshot,
        recipient: (row as unknown as { recipient: string | null }).recipient,
        created_at: row.created_at as string,
      });
    }
  }

  // Preserve actual tier from DB and attach full raw_signal + sender_email
  const normalised: InboxItem[] = allQueueItems.map((item) => {
    const signalId = (item as unknown as { signal_id?: string | null }).signal_id;
    const policyId = (item as unknown as { policy_id: string }).policy_id;
    return {
      ...(item as unknown as InboxItem),
      tier: ((item as unknown as { tier?: number }).tier ?? 2) as 2 | 3,
      raw_signal: signalId ? (signalMap[signalId] ?? null) : null,
      sender_email: signalId ? (senderEmailMap[signalId] ?? null) : null,
      sent_emails: sentEmailsByPolicy[policyId] ?? [],
    };
  });

  return (
    <InboxClient
      initialItems={normalised}
      docChaseReplies={(docChaseReplies ?? []) as DocChaseReplyItem[]}
    />
  );
}
