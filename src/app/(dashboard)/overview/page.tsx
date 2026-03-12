import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { HealthLabel } from "@/types/renewals";
import {
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
    <div className="flex flex-col h-full antialiased" style={{ background: "var(--background)", color: "var(--text-primary)" }}>

      {/* ── Top header ── */}
      <header className="h-[56px] shrink-0 flex items-center justify-between px-6" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Overview</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/renewals/upload"
            className="h-8 px-4 rounded-[6px] text-[13px] font-medium flex items-center gap-2 transition-colors hover:opacity-80"
            style={{ background: "#FAFAFA", color: "#0C0C0C" }}
          >
            <Plus size={13} />
            Import Policies
          </Link>
        </div>
      </header>

      {/* ── Daily briefing (client component, AI-generated) ── */}
      <DailyBriefing />

      {/* ── Post-import banner (client component, localStorage-driven) ── */}
      <ImportBanner />

      {/* ── Stats bar ── */}
      <div className="shrink-0 px-12 py-11" style={{ borderBottom: "1px solid #1C1C1C" }}>
        <div className="flex">
          {(
            [
              {
                label: "Book Value",
                value: formatBookValue(bookValue),
                sub: bookValue > 0 ? "total premium" : null,
                href: "/renewals",
              },
              {
                label: "Active Policies",
                value: activeCount.toLocaleString(),
                sub: null,
                href: "/renewals",
              },
              {
                label: "Upcoming Renewals",
                value: upcomingCount.toString(),
                danger: upcomingCount > 0,
                sub: "next 60 days",
                href: "/renewals?filter=upcoming",
              },
              {
                label: "Stalled Renewals",
                value: stalledCount.toString(),
                warning: stalledCount > 0,
                dim: stalledCount === 0,
                sub: stalledCount > 0 ? "need attention" : null,
                href: stalledCount > 0 ? "/renewals?filter=stalled" : undefined,
              },
            ] as Array<{
              label: string;
              value: string;
              sub?: string | null;
              danger?: boolean;
              warning?: boolean;
              dim?: boolean;
              href?: string;
            }>
          ).map((stat, i, arr) => {
            const valueColor = stat.danger
              ? "#FF4444"
              : stat.warning
              ? "#888888"
              : stat.dim
              ? "#333333"
              : "#FAFAFA";

            const inner = (
              <>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#555555" }}>
                  {stat.label}
                </span>
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-5xl tracking-tight leading-none"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontWeight: 700,
                      color: valueColor,
                    }}
                  >
                    {stat.value}
                  </span>
                  {stat.sub && (
                    <span className="text-[12px]" style={{ color: "#333333" }}>
                      {stat.sub}
                    </span>
                  )}
                </div>
              </>
            );

            const wrapperClass = [
              "flex flex-col gap-2.5",
              stat.href ? "cursor-pointer" : "",
              i !== 0 ? "pl-12" : "",
              i !== arr.length - 1 ? "pr-12" : "",
            ].join(" ");

            const wrapperStyle = i !== 0 ? { borderLeft: "1px solid #1C1C1C" } : {};

            return stat.href ? (
              <Link
                key={stat.label}
                href={stat.href}
                className={`${wrapperClass} hover:opacity-80 transition-opacity`}
                style={wrapperStyle}
              >
                {inner}
              </Link>
            ) : (
              <div key={stat.label} className={wrapperClass} style={wrapperStyle}>
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
          <div className="px-6 py-3 flex items-center justify-between sticky top-0 z-10" style={{ background: "var(--background)", borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-4">
              <span className="text-[13px] font-medium uppercase tracking-[0.06em]" style={{ color: "#555555" }}>
                Active Renewals
              </span>
              {urgentPolicies.length > 0 && (
                <span className="text-[12px]" style={{ color: "#333333" }}>
                  {urgentPolicies.length}
                </span>
              )}
            </div>
            <Link
              href="/renewals"
              className="text-[12px] flex items-center gap-1 transition-colors"
              style={{ color: "#333333" }}
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>

          <div className="pb-20">
            {urgentPolicies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <CheckCircle2 size={28} className="mb-3 opacity-20" style={{ color: "#FAFAFA" }} />
                <p className="text-[13px]" style={{ color: "#333333" }}>No urgent renewals right now</p>
              </div>
            ) : (
              <PriorityRenewalsTable policies={urgentPolicies} />
            )}
          </div>
        </div>

        {/* ── Activity panel ── */}
        <div className="w-[300px] shrink-0 overflow-y-auto flex flex-col" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>

          <div className="px-5 py-4 sticky top-0 z-10 flex items-center justify-between" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <span className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "#555555" }}>Activity</span>
            <div className="w-1.5 h-1.5 rounded-full animate-hollis-pulse" style={{ background: "#FAFAFA" }} />
          </div>

          <div className="p-5 space-y-8">

            {/* Top insight */}
            <div className="p-4 rounded-lg" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] mb-3" style={{ color: "#555555" }}>
                Priority
              </div>
              {topInsight && topDays !== null ? (
                <>
                  <p className="text-[13px] leading-[1.65]" style={{ color: "#555555" }}>
                    <span className="font-medium" style={{ color: "#FAFAFA" }}>{topInsight.client_name}</span>
                    {`'s policy expires in `}
                    <span style={{ color: topDays <= 30 ? "#FF4444" : "#888888" }}>{topDays} days</span>.
                  </p>
                  <Link
                    href={`/renewals/${topInsight.id}`}
                    className="mt-4 text-[12px] flex items-center gap-1 transition-colors"
                    style={{ color: "#555555" }}
                  >
                    View Policy
                    <ArrowRight size={11} />
                  </Link>
                </>
              ) : (
                <p className="text-[13px] leading-[1.65]" style={{ color: "#333333" }}>
                  No urgent renewals right now.
                </p>
              )}
            </div>

            {/* Activity Log */}
            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] mb-4" style={{ color: "#333333" }}>
                Recent
              </h4>
              {recentLogs.length === 0 ? (
                <p className="text-[13px]" style={{ color: "#333333" }}>No activity yet.</p>
              ) : (
                <div>
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="py-3"
                      style={{ borderBottom: "1px solid #1C1C1C" }}
                    >
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-[13px] font-medium" style={{ color: "#FAFAFA" }}>
                          {CHANNEL_LABEL[log.channel] ?? "Outreach Sent"}
                        </span>
                        <span className="text-[11px] whitespace-nowrap shrink-0 tabular-nums" style={{ color: "#333333" }}>
                          {timeAgo(log.sent_at)}
                        </span>
                      </div>
                      <span className="text-[12px]" style={{ color: "#555555" }}>
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
