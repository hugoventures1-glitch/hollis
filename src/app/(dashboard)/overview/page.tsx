import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Hollis" };

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hour = new Date().getUTCHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const fourteenDaysFromNow = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const admin = createAdminClient();

  const [
    profileRes,
    emailsSentRes,
    confirmedRes,
    inboxCountRes,
    monitoringRes,
    urgentRenewalsRes,
    recentActivityRes,
    autonomousActionsRes,
    docChaseRes,
  ] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("first_name, automation_paused")
      .eq("user_id", user.id)
      .maybeSingle(),

    // Emails sent this week (send_logs)
    supabase
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("sent_at", sevenDaysAgo),

    // Renewals confirmed this week
    supabase
      .from("renewal_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "client_confirmed")
      .gte("created_at", sevenDaysAgo),

    // Inbox pending items
    supabase
      .from("approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending"),

    // Total active policies
    supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("campaign_stage", "in", '("confirmed","lapsed","declined")'),

    // Policies expiring in next 14 days
    supabase
      .from("policies")
      .select("id, client_name, expiration_date, health_score, campaign_stage")
      .eq("user_id", user.id)
      .not("campaign_stage", "in", '("confirmed","lapsed","declined")')
      .lte("expiration_date", fourteenDaysFromNow)
      .gte("expiration_date", new Date().toISOString().split("T")[0])
      .order("expiration_date", { ascending: true })
      .limit(4),

    // Recent activity feed (last 6 events)
    supabase
      .from("renewal_audit_log")
      .select("id, event_type, channel, created_at, policies(client_name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),

    // Autonomous (Tier 1) actions this week
    admin
      .from("hollis_actions")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", user.id)
      .eq("tier", "1")
      .gte("created_at", sevenDaysAgo),

    // Active doc chase requests
    supabase
      .from("doc_chase_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const firstName = profileRes.data?.first_name ?? null;
  const automationPaused = profileRes.data?.automation_paused ?? false;

  return (
    <HomeClient
      greeting={greeting}
      firstName={firstName}
      today={today}
      stats={{
        emailsSentThisWeek: emailsSentRes.count ?? 0,
        confirmedThisWeek: confirmedRes.count ?? 0,
        inboxPending: inboxCountRes.count ?? 0,
        monitoringCount: monitoringRes.count ?? 0,
        autonomousActionsThisWeek: autonomousActionsRes.count ?? 0,
        activeDocChase: docChaseRes.count ?? 0,
        timeSavedMinutes:
          ((emailsSentRes.count ?? 0) * 5) +
          ((autonomousActionsRes.count ?? 0) * 8),
      }}
      urgentRenewals={(urgentRenewalsRes.data ?? []) as {
        id: string;
        client_name: string;
        expiration_date: string;
        health_score: number | null;
        campaign_stage: string;
      }[]}
      recentActivity={(recentActivityRes.data ?? []) as {
        id: string;
        event_type: string;
        channel: string | null;
        created_at: string;
        policies: { client_name: string } | { client_name: string }[] | null;
      }[]}
      automationActive={!automationPaused}
    />
  );
}
