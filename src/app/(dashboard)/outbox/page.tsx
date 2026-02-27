import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OutboxClient from "./OutboxClient";
import type { Draft, DraftPolicy } from "@/components/outbox/DraftEditDrawer";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("outbox_drafts")
    .select(
      "id, subject, body, policies(client_name, carrier, expiration_date, policy_name)"
    )
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Normalize: PostgREST returns forward FK as object but TS may infer array
  const drafts: Draft[] = (rows ?? []).map((row) => {
    const raw = row.policies;
    const policy: DraftPolicy | null = Array.isArray(raw)
      ? (raw[0] as DraftPolicy) ?? null
      : (raw as DraftPolicy | null);

    return {
      id: row.id,
      subject: row.subject,
      body: row.body,
      policies: policy,
    };
  });

  return <OutboxClient initialDrafts={drafts} />;
}
