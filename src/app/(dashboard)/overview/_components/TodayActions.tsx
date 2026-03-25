import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export async function TodayActions() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Policies needing call today
  const { data: callsNeeded } = await supabase
    .from("policies")
    .select("id, client_name")
    .eq("user_id", user.id)
    .eq("campaign_stage", "script_14_ready");

  // Silent clients
  const { data: silentPolicies } = await supabase
    .from("policies")
    .select("id, client_name, renewal_flags")
    .eq("user_id", user.id)
    .contains("renewal_flags", { silent_client: true });

  // Pending Tier 2
  const { count: pendingCount } = await supabase
    .from("approval_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  const callCount = callsNeeded?.length ?? 0;
  const silentCount = silentPolicies?.length ?? 0;
  const approvalCount = pendingCount ?? 0;

  if (callCount === 0 && silentCount === 0 && approvalCount === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/50">
        No actions needed today
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
      <h3 className="text-sm font-medium text-white/70 mb-3">Today&apos;s Actions</h3>
      {callCount > 0 && (
        <Link href="/renewals?stage=script_14_ready" className="flex items-center justify-between rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/20 transition-colors">
          <span>{callCount} call{callCount !== 1 ? "s" : ""} needed today</span>
          <span>→</span>
        </Link>
      )}
      {silentCount > 0 && (
        <Link href="/renewals?flag=silent_client" className="flex items-center justify-between rounded-md bg-orange-500/10 px-3 py-2 text-sm text-orange-400 hover:bg-orange-500/20 transition-colors">
          <span>{silentCount} client{silentCount !== 1 ? "s" : ""} flagged silent</span>
          <span>→</span>
        </Link>
      )}
      {approvalCount > 0 && (
        <Link href="/inbox" className="flex items-center justify-between rounded-md bg-blue-500/10 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/20 transition-colors">
          <span>{approvalCount} action{approvalCount !== 1 ? "s" : ""} awaiting approval</span>
          <span>→</span>
        </Link>
      )}
    </div>
  );
}
