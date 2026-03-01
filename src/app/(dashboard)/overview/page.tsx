import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { HealthLabel } from "@/types/renewals";
import {
  Zap,
  Plus,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { ImportBanner } from "./_components/ImportBanner";
import { DailyBriefing } from "@/components/briefing/DailyBriefing";
import { PriorityRenewalsTable } from "./_components/PriorityRenewalsTable";

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBookValue(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface PolicyRow {
  id: string;
  policy_name?: string | null;
  client_name: string;
  carrier?: string | null;
  expiration_date: string;
  campaign_stage?: string | null;
  health_label?: HealthLabel | null;
  health_score?: number | null;
}

interface LogRow {
  id: string;
  channel: string;
  sent_at: string;
  policies: { client_name: string }[] | { client_name: string } | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().split("T")[0];
  const in60 = addDays(60);

  const [activePoliciesRes, upcomingCountRes, stalledCountRes, workflowsRes, logsRes] =
    await Promise.all([
      // All active policies — for count + premium sum
      supabase
        .from("policies")
        .select("premium")
        .eq("user_id", user.id)
        .eq("status", "active"),

      // Count expiring within 60 days
      supabase
        .from("policies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("expiration_date", today)
        .lte("expiration_date", in60),

      // Count stalled policies (health_label = 'stalled')
      supabase
        .from("policies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("health_label", "stalled"),

      // Most urgent 10 for workflows table — include health fields
      supabase
        .from("policies")
        .select("id, policy_name, client_name, carrier, expiration_date, campaign_stage, health_label, health_score")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("expiration_date", today)
        .order("expiration_date")
        .limit(10),

      // Recent activity from send_logs
      supabase
        .from("send_logs")
        .select("id, channel, sent_at, policies(client_name)")
        .eq("user_id", user.id)
        .order("sent_at", { ascending: false })
        .limit(6),
    ]);

  const activePolicies = activePoliciesRes.data ?? [];
  const activeCount = activePolicies.length;
  const bookValue = activePolicies.reduce(
    (sum, p) => sum + (Number(p.premium) || 0),
    0
  );
  const upcomingCount = upcomingCountRes.count ?? 0;
  const stalledCount = stalledCountRes.count ?? 0;
  const urgentPolicies = (workflowsRes.data ?? []) as PolicyRow[];
  const recentLogs = (logsRes.data ?? []) as LogRow[];

  const topInsight = urgentPolicies[0] ?? null;
  const topDays = topInsight ? daysUntil(topInsight.expiration_date) : null;

  const CHANNEL_LABEL: Record<string, string> = {
    email: "Renewal Email Sent",
    sms: "SMS Reminder Sent",
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d12] text-[#f5f5f7] antialiased select-none">

      {/* ── Top header ── */}
      <header className="h-[56px] shrink-0 border-b border-[#1e1e2a] flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          <span className="text-[#5e5e64]">Workspace</span>
          <span className="text-[#2a2a35]">/</span>
          <span className="text-[#f5f5f7]">Overview</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/renewals/upload"
            className="h-8 bg-[#00d4aa] text-black px-3.5 rounded text-[13px] font-bold hover:bg-[#00bfa0] transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(0,212,170,0.35),0_0_6px_rgba(0,212,170,0.2)]"
          >
            <Plus size={14} strokeWidth={3} />
            New Policy
          </Link>
        </div>
      </header>

      {/* ── Daily briefing (client component, AI-generated) ── */}
      <DailyBriefing />

      {/* ── Post-import banner (client component, localStorage-driven) ── */}
      <ImportBanner />

      {/* ── Stats bar ── */}
      <div className="shrink-0 px-12 py-11 border-b border-[#252530]">
        <div className="flex">
          {(
            [
              {
                label: "Book Value",
                value: formatBookValue(bookValue),
                sub: bookValue > 0 ? "total premium" : null,
              },
              {
                label: "Active Policies",
                value: activeCount.toLocaleString(),
                sub: null,
              },
              {
                label: "Upcoming Renewals",
                value: upcomingCount.toString(),
                red: upcomingCount > 0,
                sub: "next 60 days",
              },
              {
                label: "Stalled Renewals",
                value: stalledCount.toString(),
                purple: stalledCount > 0,
                sub: stalledCount > 0 ? "need attention" : null,
                href: stalledCount > 0 ? "/renewals?filter=stalled" : undefined,
              },
              {
                label: "AI Accuracy",
                value: "99.2%",
                sub: "+0.4%",
              },
            ] as Array<{
              label: string;
              value: string;
              sub?: string | null;
              red?: boolean;
              purple?: boolean;
              href?: string;
            }>
          ).map((stat, i, arr) => {
            const valueColor = stat.red
              ? "text-[#ff4d4d]"
              : stat.purple && stalledCount > 0
              ? "text-purple-400"
              : "text-white";

            const inner = (
              <>
                <span className="text-[12px] font-bold text-zinc-600 uppercase tracking-[0.12em]">
                  {stat.label}
                </span>
                <div className="flex items-baseline gap-3">
                  <span
                    className={`text-5xl font-bold tracking-tight leading-none ${valueColor}`}
                  >
                    {stat.value}
                  </span>
                  {stat.sub && (
                    <span className="text-[13px] font-medium text-[#3a3a42]">
                      {stat.sub}
                    </span>
                  )}
                </div>
              </>
            );

            const wrapperClass = [
              "flex flex-col gap-2.5",
              i !== 0 ? "border-l border-[#1e1e2a] pl-12" : "",
              i !== arr.length - 1 ? "pr-12" : "",
            ].join(" ");

            return stat.href ? (
              <Link
                key={stat.label}
                href={stat.href}
                className={`${wrapperClass} hover:opacity-80 transition-opacity`}
              >
                {inner}
              </Link>
            ) : (
              <div key={stat.label} className={wrapperClass}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Two-column content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Priority Workflows */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="px-6 py-3 flex items-center justify-between sticky top-0 z-10 bg-[#0d0d12] border-b border-[#1e1e2a]">
            <div className="flex items-center gap-4">
              <span className="text-[14px] font-semibold text-zinc-500">
                Priority Renewals
              </span>
              {urgentPolicies.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#00d4aa]/[0.1] text-[12px] font-bold text-[#00d4aa]">
                  {urgentPolicies.length}
                </span>
              )}
            </div>
            <Link
              href="/renewals"
              className="text-[12px] text-[#505057] hover:text-[#00d4aa] transition-colors flex items-center gap-1"
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>

          <div className="pb-20">
            {urgentPolicies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <CheckCircle2 size={28} className="text-[#00d4aa] mb-3 opacity-50" />
                <p className="text-[14px] text-[#505057]">No urgent renewals right now</p>
                <p className="text-[12px] text-[#3a3a42] mt-1">All active policies are more than 60 days out</p>
              </div>
            ) : (
              <PriorityRenewalsTable policies={urgentPolicies} />
            )}
          </div>
        </div>

        {/* ── Assistant panel ── */}
        <div className="w-[360px] shrink-0 bg-[#111118] border-l border-[#1e1e2a] overflow-y-auto flex flex-col">

          <div className="px-5 py-4 border-b border-[#1e1e2a] flex items-center justify-between sticky top-0 bg-[#111118] z-10">
            <span className="text-[14px] font-semibold text-zinc-500">Assistant</span>
            <div className="w-2 h-2 rounded-full bg-[#00d4aa] shadow-[0_0_8px_rgba(0,212,170,0.8)]" />
          </div>

          <div className="p-5 space-y-9">

            {/* Hollis Insight card */}
            <div className="p-5 bg-[#1a1a24] border border-[#1e1e2a] rounded-lg">
              <div className="flex items-center gap-2.5 mb-4">
                <Zap size={15} className="text-[#00d4aa]" />
                <span className="text-[13px] font-bold text-[#f5f5f7] uppercase tracking-widest">
                  Hollis Insight
                </span>
              </div>
              {topInsight && topDays !== null ? (
                <>
                  <p className="text-[14px] text-zinc-500 leading-[1.65]">
                    <span className="text-[#f5f5f7] font-medium">{topInsight.client_name}</span>
                    {`'s policy expires in `}
                    <span className="text-[#00d4aa] font-semibold">{topDays} days</span>.
                    {topDays <= 14
                      ? " Call script is ready — reach out today."
                      : topDays <= 30
                      ? " SMS reminder due soon."
                      : " Start renewal outreach."}
                  </p>
                  <Link
                    href={`/renewals/${topInsight.id}`}
                    className="mt-5 text-[13px] font-semibold text-zinc-500 hover:text-[#00d4aa] transition-colors flex items-center gap-1.5 group/btn"
                  >
                    View Policy
                    <ArrowRight
                      size={13}
                      className="group-hover/btn:translate-x-0.5 transition-transform"
                    />
                  </Link>
                </>
              ) : (
                <p className="text-[14px] text-zinc-500 leading-[1.65]">
                  No urgent renewals right now.{" "}
                  <span className="text-[#00d4aa] font-semibold">Import policies</span> to start tracking campaigns.
                </p>
              )}
            </div>

            {/* Activity Log */}
            <div>
              <h4 className="text-[12px] font-bold text-[#2a2a35] uppercase tracking-widest mb-6">
                Activity Log
              </h4>
              {recentLogs.length === 0 ? (
                <p className="text-[13px] text-[#3a3a42]">No activity yet.</p>
              ) : (
                <div className="space-y-0">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="relative pl-4 border-l border-[#1e1e2a] pb-5 border-b border-[#1e1e2a]/50 last:pb-0 last:border-b-0 [&:not(:first-child)]:pt-5"
                    >
                      <div className="absolute top-1.5 -left-[3.5px] w-[6px] h-[6px] rounded-full bg-[#2a2a35]" />
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-[14px] font-semibold text-zinc-200">
                          {CHANNEL_LABEL[log.channel] ?? "Outreach Sent"}
                        </span>
                        <span className="text-[11px] text-zinc-600 font-medium tracking-tight uppercase whitespace-nowrap shrink-0">
                          {timeAgo(log.sent_at)}
                        </span>
                      </div>
                      <span className="text-[12px] text-zinc-600 font-medium">
                        {(Array.isArray(log.policies)
                          ? log.policies[0]?.client_name
                          : log.policies?.client_name) ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
