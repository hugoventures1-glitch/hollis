import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart2,
  Clock,
  FileText,
  Shield,
  AlertTriangle,
  ClipboardCheck,
  Activity,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { Suspense } from "react";
import { ImportBanner } from "./_components/ImportBanner";
import { LoginTracker } from "@/components/analytics/LoginTracker";
import { Sparkline } from "./_components/Sparkline";
import { MiniBarChart } from "./_components/MiniBarChart";
import { TodayActions } from "./_components/TodayActions";
import { DailyBriefing } from "@/components/briefing/DailyBriefing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview — Hollis" };

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBookValue(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

// ── Card primitives ───────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
  style: extraStyle,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl p-6 flex flex-col ${className}`}
      style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", minHeight: 196, ...extraStyle }}
    >
      {children}
    </div>
  );
}

function CardHead({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className="text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          {label}
        </span>
      </div>
      {badge && (
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function SeeLink({ label, href }: { label: string; href: string }) {
  return (
    <div className="mt-auto pt-4">
      <Link
        href={href}
        className="text-[12px] flex items-center gap-1 w-fit transition-opacity hover:opacity-60"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label} <ArrowRight size={10} />
      </Link>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Time-based greeting (UTC — close enough for most users)
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";

  // Today's badge for Daily Insights card
  const todayBadge = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const today = new Date().toISOString().split("T")[0];
  const in60  = addDays(60);

  const [
    activePoliciesRes,
    logsRes,
    profileRes,
    coiRes,
    reviewRes,
  ] = await Promise.all([
    // All active policies — for count + premium sum + upcoming/stalled counts + bar chart
    supabase
      .from("policies")
      .select("premium, expiration_date, health_label")
      .eq("user_id", user.id)
      .eq("status", "active"),

    // Recent send logs — for activity sparkline (60 limit covers 12 days)
    supabase
      .from("send_logs")
      .select("id, sent_at")
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(60),

    // User profile — for first name
    supabase
      .from("agent_profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle(),

    // Pending COI / certificate requests
    supabase
      .from("coi_requests")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", user.id)
      .in("status", ["pending", "ready_for_approval", "needs_review"]),

    // Pending items in agent approval queue
    supabase
      .from("approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending"),
  ]);

  const activePolicies = activePoliciesRes.data ?? [];
  const activeCount    = activePolicies.length;
  const bookValue      = activePolicies.reduce((s, p) => s + (Number(p.premium) || 0), 0);
  const upcomingCount  = activePolicies.filter(p => p.expiration_date >= today && p.expiration_date <= in60).length;
  const stalledCount   = activePolicies.filter(p => p.health_label === "stalled").length;
  const recentLogs     = logsRes.data            ?? [];
  const firstName      = profileRes.data?.first_name ?? null;
  const coiCount       = coiRes.count    ?? 0;
  const reviewCount    = reviewRes.count ?? 0;

  // ── Real sparkline: sends per day for last 12 days ───────────────────────
  const sparklineData: number[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (11 - i));
    const dateStr = d.toISOString().split("T")[0];
    return recentLogs.filter((l) => l.sent_at?.startsWith(dateStr)).length;
  });

  // ── Real bar chart: premium distribution across active policies ───────────
  const premiums = activePolicies
    .map((p) => Number(p.premium) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const barCount = 14;
  const bookValueBars: number[] = Array.from({ length: barCount }, (_, i) => {
    if (!premiums.length) return 0.2;
    const step  = Math.ceil(premiums.length / barCount);
    const slice = premiums.slice(i * step, i * step + step);
    if (!slice.length) return 0.1;
    return Math.max(...slice) / premiums[premiums.length - 1];
  });

  const summaryStatus =
    stalledCount > 0
      ? `${stalledCount} stalled ${stalledCount === 1 ? "policy" : "policies"} need attention.`
      : upcomingCount > 0
      ? "Keep an eye on upcoming renewals."
      : "Nothing needs attention today.";

  const activityLevel =
    recentLogs.length > 15 ? "high" : recentLogs.length > 6 ? "steady" : "light";

  return (
    <div
      className="flex flex-col h-full antialiased overflow-y-auto"
      style={{ background: "var(--background)", color: "var(--text-primary)" }}
    >
      <Suspense><LoginTracker /></Suspense>

      {/* ── Scrollable body ── */}
      <div className="flex-1 px-8 pt-10">

        {/* Greeting */}
        <div className="mb-2">
          <h1 className="text-[42px] leading-tight tracking-tight">
            <span style={{ fontWeight: 300 }}>{greeting}, </span>
            <span style={{ fontWeight: 600 }}>{firstName ?? "there"}</span>
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            here&apos;s a quick look at how things are going.
          </p>
        </div>

        {/* Import banner (client component — localStorage-driven) */}
        <ImportBanner />

        {/* Morning briefing */}
        <DailyBriefing />

        {/* Today's Actions */}
        <div className="mt-6">
          <TodayActions />
        </div>

        {/* ── 4 × 2 card grid ── */}
        <div className="grid grid-cols-4 gap-3 mt-7">

          {/* ─── Row 1 ─────────────────────────────────────── */}

          {/* Card 1 — Daily Insights */}
          <Card>
            <CardHead
              icon={<CalendarDays size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Daily Insights"
              badge={todayBadge}
            />
            <div className="flex-1 flex flex-col gap-1.5">
              {bookValue > 0 && (
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Book value{" "}
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{formatBookValue(bookValue)}</span>
                </p>
              )}
              {activeCount > 0 && (
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{activeCount}</span> active {activeCount === 1 ? "policy" : "policies"}
                </p>
              )}
              {upcomingCount > 0 && (
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: upcomingCount > 5 ? "#FF6B6B" : "var(--text-primary)", fontWeight: 600 }}>{upcomingCount}</span> renewing in 60 days
                </p>
              )}
              {activeCount === 0 && bookValue === 0 && (
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>No data yet.</p>
              )}
              <p className="text-[13px] mt-1" style={{ color: stalledCount > 0 ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                {summaryStatus}
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between">
              <Link
                href="/activity"
                className="text-[12px] flex items-center gap-1 transition-opacity hover:opacity-60"
                style={{ color: "var(--text-tertiary)" }}
              >
                Go to activity <ArrowRight size={10} />
              </Link>
              {stalledCount > 0 && (
                <Link
                  href="/renewals?filter=stalled"
                  className="text-[12px] transition-opacity hover:opacity-60"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Dismiss
                </Link>
              )}
            </div>
          </Card>

          {/* Card 2 — Book Value (white outline) */}
          <Card style={{ border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
            <CardHead
              icon={<BarChart2 size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Book Value"
            />
            <div className="flex-1 flex flex-col justify-between">
              <p className="text-[12px] leading-[1.6]" style={{ color: "var(--text-secondary)" }}>
                Total premium across your book is{" "}
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                  {formatBookValue(bookValue)}
                </span>
              </p>
              <div className="mt-3">
                <MiniBarChart bars={bookValueBars} />
              </div>
            </div>
            <SeeLink label="See detailed view" href="/renewals" />
          </Card>

          {/* Card 3 — Expiring Soon */}
          <Card>
            <CardHead
              icon={<Clock size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Expiring Soon"
            />
            <div className="flex-1">
              {upcomingCount > 0 ? (
                <>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    Your current upcoming renewals
                  </p>
                  <p
                    className="text-[42px] font-light leading-none mt-2 tracking-tight"
                    style={{ color: upcomingCount > 5 ? "#FF6B6B" : "var(--text-primary)" }}
                  >
                    {upcomingCount}
                    <span
                      className="text-[14px] ml-2"
                      style={{ color: "var(--text-tertiary)", fontWeight: 400 }}
                    >
                      {upcomingCount === 1 ? "policy" : "policies"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  No renewals in the next 60 days.
                </p>
              )}
            </div>
            <SeeLink label="See renewals" href="/renewals" />
          </Card>

          {/* Card 4 — Certificates */}
          <Card>
            <CardHead
              icon={<FileText size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Certificates"
            />
            <div className="flex-1">
              {coiCount > 0 ? (
                <p className="text-[13px] leading-[1.75]" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                    {coiCount} new {coiCount === 1 ? "request" : "requests"}
                  </span>
                  {", "}automatically categorised as certificates
                </p>
              ) : (
                <p className="text-[13px] leading-[1.75]" style={{ color: "var(--text-tertiary)" }}>
                  No pending certificate requests.
                </p>
              )}
            </div>
            <SeeLink label="Show certificates" href="/certificates" />
          </Card>

          {/* ─── Row 2 ─────────────────────────────────────── */}

          {/* Card 5 — Active Policies */}
          <Card>
            <CardHead
              icon={<Shield size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Active Policies"
            />
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
                Policies across your book
              </p>
              <p
                className="text-[44px] font-light leading-none tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {activeCount.toLocaleString()}
              </p>
            </div>
            <SeeLink label="See all policies" href="/renewals" />
          </Card>

          {/* Card 6 — Stalled */}
          <Card>
            <CardHead
              icon={<AlertTriangle size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Stalled"
            />
            <div className="flex-1">
              {stalledCount > 0 ? (
                <p className="text-[13px] leading-[1.75]" style={{ color: "var(--text-secondary)" }}>
                  You currently have{" "}
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {stalledCount} stalled
                  </span>{" "}
                  {stalledCount === 1 ? "policy" : "policies"} outstanding
                  in your renewals
                </p>
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  No stalled policies right now.
                </p>
              )}
            </div>
            <SeeLink label="See stalled" href="/renewals?filter=stalled" />
          </Card>

          {/* Card 7 — Review Queue */}
          <Card>
            <CardHead
              icon={<ClipboardCheck size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Review Queue"
            />
            <div className="flex-1 flex items-start gap-3">
              {/* Hollis mark */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "var(--border)" }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontWeight: 900,
                    fontSize: 14,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  h
                </span>
              </div>
              <p className="text-[13px] leading-[1.75]" style={{ color: "var(--text-secondary)" }}>
                {reviewCount > 0 ? (
                  <>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {reviewCount} pending
                    </span>{" "}
                    {reviewCount === 1 ? "item" : "items"} awaiting your approval
                  </>
                ) : (
                  "No items pending review."
                )}
              </p>
            </div>
            <SeeLink label="See review queue" href="/review" />
          </Card>

          {/* Card 8 — Activity */}
          <Card>
            <CardHead
              icon={<Activity size={12} style={{ color: "var(--text-tertiary)" }} />}
              label="Activity"
            />
            <div className="flex-1 flex flex-col justify-between">
              <p className="text-[12px] leading-[1.6]" style={{ color: "var(--text-secondary)" }}>
                {recentLogs.length > 0 ? (
                  <>
                    Your outreach activity is{" "}
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {activityLevel}
                    </span>{" "}
                    this period
                  </>
                ) : (
                  "No activity recorded yet."
                )}
              </p>
              <div className="mt-3">
                <Sparkline pts={sparklineData} />
              </div>
            </div>
            <SeeLink label="See activity" href="/activity" />
          </Card>

        </div>
      </div>
    </div>
  );
}
