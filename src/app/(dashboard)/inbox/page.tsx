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
    expiration_date: string;
    carrier: string | null;
  } | null;
}

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: items } = await supabase
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

  // Normalise — all approval_queue items are Tier 2 for now
  const normalised: InboxItem[] = (items ?? []).map((item) => ({
    ...(item as unknown as InboxItem),
    tier: 2,
  }));

  return <InboxClient initialItems={normalised} />;
}
