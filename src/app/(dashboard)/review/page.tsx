/**
 * /review — Tier 2 Approval Queue
 *
 * Surfaces all pending Tier 2 decisions for the authenticated broker.
 * Each card shows: client, policy, agent's intent read, confidence, signal snippet,
 * and proposed action — with Approve / Reject / Edit & Approve buttons.
 *
 * Every decision triggers PATCH /api/agent/review/[id] which:
 *   - Marks the queue item resolved
 *   - Writes to parser_outcomes (learning layer)
 *   - Appends to renewal_audit_log
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ReviewQueueClient from "./ReviewQueueClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch pending approval queue items with policy details
  const { data: items } = await supabase
    .from("approval_queue")
    .select(
      `
      id,
      policy_id,
      classified_intent,
      confidence_score,
      raw_signal_snippet,
      proposed_action,
      status,
      created_at,
      policies (
        id,
        client_name,
        policy_name,
        expiration_date,
        carrier
      )
    `
    )
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <ReviewQueueClient initialItems={(items ?? []) as unknown as QueueItemWithPolicy[]} />
  );
}

export interface QueueItemWithPolicy {
  id: string;
  policy_id: string;
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
    expiration_date: string;
    carrier: string | null;
  } | null;
}
