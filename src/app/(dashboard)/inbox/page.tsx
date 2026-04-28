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
  proposed_action: {
    description: string;
    action_type: string;
    payload: Record<string, unknown>;
  };
  status: "pending" | "approved" | "rejected" | "edited";
  created_at: string;
  policies: {
    id: string;
    client_name: string;
    policy_name: string;
    policy_number: string | null;
    expiration_date: string;
    carrier: string | null;
    campaign_stage: string | null;
  } | null;
}

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: items }, { data: docChaseReplies }] = await Promise.all([
    supabase
      .from("approval_queue")
      .select(
        `
        id,
        policy_id,
        signal_id,
        classified_intent,
        confidence_score,
        raw_signal_snippet,
        proposed_action,
        status,
        created_at,
        policies!inner (
          id,
          client_name,
          policy_name,
          policy_number,
          expiration_date,
          carrier,
          campaign_stage
        )
      `
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .not("policies.campaign_stage", "in", '("confirmed","lapsed","final_notice_sent","complete")')
      .order("created_at", { ascending: false }),

    supabase
      .from("doc_chase_requests")
      .select(
        "id, client_name, client_email, document_type, status, last_client_reply, last_client_reply_at, received_attachment_path, received_attachment_filename, received_attachment_content_type, validation_status, validation_summary, validation_issues, created_at"
      )
      .eq("user_id", user.id)
      .not("last_client_reply", "is", null)
      .order("last_client_reply_at", { ascending: false })
      .limit(50),
  ]);

  // Normalise — all approval_queue items are Tier 2 for now
  const normalised: InboxItem[] = (items ?? []).map((item) => ({
    ...(item as unknown as InboxItem),
    tier: 2,
  }));

  return (
    <InboxClient
      initialItems={normalised}
      docChaseReplies={(docChaseReplies ?? []) as DocChaseReplyItem[]}
    />
  );
}
