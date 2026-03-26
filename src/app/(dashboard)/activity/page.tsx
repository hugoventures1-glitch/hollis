import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import ActivityClient from "./ActivityClient";
import type { AuditRow } from "./ActivityClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity — Hollis" };

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [feedRes, sendCountRes, progressedRes, questionnaireRes, policyCountRes, autonomousRes] =
    await Promise.all([
      // Full audit feed — last 200 entries
      supabase
        .from("renewal_audit_log")
        .select("id, event_type, channel, created_at, policies(client_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),

      // Touchpoints (send_logs) last 30 days
      supabase
        .from("send_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("sent_at", thirtyDaysAgo),

      // Confirmed renewals last 7 days
      supabase
        .from("renewal_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("event_type", "client_confirmed")
        .gte("created_at", sevenDaysAgo),

      // Questionnaire reply rate
      supabase
        .from("renewal_audit_log")
        .select("event_type")
        .eq("user_id", user.id)
        .in("event_type", ["questionnaire_sent", "questionnaire_responded"]),

      // Total active policies (monitoring count)
      supabase
        .from("policies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),

      // Autonomous (Tier 1) actions — all time
      admin
        .from("hollis_actions")
        .select("id", { count: "exact", head: true })
        .eq("broker_id", user.id)
        .eq("tier", "1"),
    ]);

  const feed = (feedRes.data ?? []) as AuditRow[];
  const touchpoints = sendCountRes.count ?? 0;
  const confirmed = progressedRes.count ?? 0;
  const monitoringCount = policyCountRes.count ?? 0;

  const questRows = questionnaireRes.data ?? [];
  const qSent = questRows.filter((r) => r.event_type === "questionnaire_sent").length;
  const qResponded = questRows.filter((r) => r.event_type === "questionnaire_responded").length;
  const replyRate = qSent > 0 ? Math.round((qResponded / qSent) * 100) : null;

  const autonomousActionsTotal = autonomousRes.count ?? 0;

  return (
    <ActivityClient
      feed={feed}
      stats={{
        touchpoints,
        confirmed,
        replyRate,
        totalSent: touchpoints,
        monitoringCount,
        autonomousActionsTotal,
      }}
    />
  );
}
