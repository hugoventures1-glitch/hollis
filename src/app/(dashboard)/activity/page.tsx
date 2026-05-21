import { createClient } from "@/lib/supabase/server";
import HistoryPanel from "@/app/(dashboard)/renewals/history/HistoryPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity — Hollis" };

const PAGE_SIZE = 50;

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <HistoryPanel initialData={[]} initialHasMore={false} initialCursor={null} />;
  }

  const fetchLimit = PAGE_SIZE + 1;

  const [actionsRes, auditRes] = await Promise.all([
    supabase
      .from("hollis_actions")
      .select("*, policies(policy_name, client_name)")
      .eq("broker_id", user.id)
      .order("created_at", { ascending: false })
      .limit(fetchLimit),
    supabase
      .from("renewal_audit_log")
      .select("id, event_type, channel, content_snapshot, recipient, metadata, created_at, policy_id, policies(policy_name, client_name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(fetchLimit),
  ]);

  const actionRows = (actionsRes.data ?? []).map(r => ({ ...r, source: "action" as const }));
  const auditRows  = (auditRes.data  ?? []).map(r => ({ ...r, source: "event"  as const }));

  const merged = [...actionRows, ...auditRows].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  );

  const hasMore    = merged.length > PAGE_SIZE;
  const page       = merged.slice(0, PAGE_SIZE);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextCursor = page.length > 0 ? (page[page.length - 1] as any).created_at as string : null;

  return (
    <HistoryPanel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={page as any[]}
      initialHasMore={hasMore}
      initialCursor={nextCursor}
    />
  );
}
