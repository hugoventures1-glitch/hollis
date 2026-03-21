import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { AuditEventType } from "@/types/renewals";
import ActivityClient from "./ActivityClient";
import type { AuditRow } from "./ActivityClient";

const TIME_SAVED: Partial<Record<AuditEventType, number>> = {
  email_sent:          3,
  sms_sent:            2,
  questionnaire_sent:  5,
  submission_sent:     10,
  recommendation_sent: 8,
  doc_requested:       3,
  tier_1_action:       5,
  tier_2_drafted:      7,
  note_added:          2,
  final_notice_sent:   4,
};

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity — Hollis" };

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // Start of today in UTC (YYYY-MM-DD) — matches created_at timestamps
  const todayUtc = new Date().toISOString().slice(0, 10);

  const [feedRes, sendCountRes, progressedRes, questionnaireRes, policyCountRes, todayEventsRes] =
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

      // Today's events — unbounded, for accurate time-saved calculation
      supabase
        .from("renewal_audit_log")
        .select("event_type")
        .eq("user_id", user.id)
        .gte("created_at", todayUtc),
    ]);

  const feed = (feedRes.data ?? []) as AuditRow[];
  const touchpoints = sendCountRes.count ?? 0;
  const confirmed = progressedRes.count ?? 0;
  const monitoringCount = policyCountRes.count ?? 0;

  const questRows = questionnaireRes.data ?? [];
  const qSent = questRows.filter((r) => r.event_type === "questionnaire_sent").length;
  const qResponded = questRows.filter((r) => r.event_type === "questionnaire_responded").length;
  const replyRate = qSent > 0 ? Math.round((qResponded / qSent) * 100) : null;

  const timeSavedToday = (todayEventsRes.data ?? []).reduce(
    (sum, row) => sum + (TIME_SAVED[row.event_type as AuditEventType] ?? 0),
    0
  );

  return (
    <ActivityClient
      feed={feed}
      stats={{
        touchpoints,
        confirmed,
        replyRate,
        totalSent: touchpoints,
        monitoringCount,
        timeSavedToday,
      }}
    />
  );
}
