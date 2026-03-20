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
import { ImportBanner } from "./_components/ImportBanner";
import { Sparkline } from "./_components/Sparkline";
import { MiniBarChart } from "./_components/MiniBarChart";

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
      style={{ background: "#141414", border: "1px solid #252525", minHeight: 196, ...extraStyle }}
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
          style={{ color: "#666666" }}
        >
          {label}
        </span>
      </div>
      {badge && (
        <span className="text-[11px]" style={{ color: "#666666" }}>
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
        style={{ color: "#666666" }}
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
    upcomingCountRes,
    stalledCountRes,
    logsRes,
    profileRes,
    coiRes,
    reviewRes,
  ] = await Promise.all([
    // All active policies — for count + premium sum + bar chart
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

    // Count stalled
    supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("health_label", "stalled"),

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
      .eq("user_id", user.id)
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
  const upcomingCount  = upcomingCountRes.count ?? 0;
  const stalledCount   = stalledCountRes.count  ?? 0;
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
      style={{ background: "#0C0C0C", color: "#FAFAFA" }}
    >

      {/* ── Top bar ── */}
      <header
        className="h-14 shrink-0 flex items-center justify-between px-6"
        style={{ borderBottom: "1px solid #181818" }}
      >
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "#555555" }}>
          Overview
        </div>

        {/* Overview / Metrics tabs */}
        <div
          className="flex items-center h-8 rounded-lg overflow-hidden"
          style={{ border: "1px solid #222222", background: "#111111" }}
        >
          <Link
            href="/overview"
            className="px-3 h-full flex items-center text-[12px] font-medium"
            style={{ color: "#FAFAFA", background: "#1C1C1C" }}
          >
            Overview
          </Link>
          <Link
            href="/activity"
            className="px-3 h-full flex items-center text-[12px] font-medium transition-colors hover:text-[#9e9e9e]"
            style={{ color: "#444444" }}
          >
            Metrics
          </Link>
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 px-8 pt-8">

        {/* Greeting */}
        <div className="mb-2">
          <h1 className="text-[42px] leading-tight tracking-tight">
            <span style={{ fontWeight: 300 }}>{greeting}, </span>
            <span style={{ fontWeight: 600 }}>{firstName ?? "there"}</span>
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "#666666" }}>
            here&apos;s a quick look at how things are going.
          </p>
        </div>

        {/* Import banner (client component — localStorage-driven) */}
        <ImportBanner />

        {/* ── 4 × 2 card grid ── */}
        <div className="grid grid-cols-4 gap-3 mt-7">

          {/* ─── Row 1 ─────────────────────────────────────── */}

          {/* Card 1 — Daily Insights */}
          <Card>
            <CardHead
              icon={<CalendarDays size={12} style={{ color: "#555555" }} />}
              label="Daily Insights"
              badge={todayBadge}
            />
            <div className="flex-1 flex flex-col gap-1.5">
              {bookValue > 0 && (
                <p className="text-[13px] leading-relaxed" style={{ color: "#888888" }}>
                  Book value{" "}
                  <span style={{ color: "#FAFAFA", fontWeight: 600 }}>{formatBookValue(bookValue)}</span>
                </p>
              )}
              {activeCount > 0 && (
                <p className="text-[13px] leading-relaxed" style={{ color: "#888888" }}>
                  <span style={{ color: "#FAFAFA", fontWeight: 600 }}>{activeCount}</span> active {activeCount === 1 ? "policy" : "policies"}
                </p>
              )}
              {upcomingCount > 0 && (
                <p className="text-[13px] leading-relaxed" style={{ color: "#888888" }}>
                  <span style={{ color: upcomingCount > 5 ? "#FF6B6B" : "#FAFAFA", fontWeight: 600 }}>{upcomingCount}</span> renewing in 60 days
                </p>
              )}
              {activeCount === 0 && bookValue === 0 && (
                <p className="text-[13px]" style={{ color: "#666" }}>No data yet.</p>
              )}
              <p className="text-[13px] mt-1" style={{ color: stalledCount > 0 ? "#FAFAFA" : "#555" }}>
                {summaryStatus}
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center justify-between">
              <Link
                href="/activity"
                className="text-[12px] flex items-center gap-1 transition-opacity hover:opacity-60"
                style={{ color: "#555555" }}
              >
                Go to activity <ArrowRight size={10} />
              </Link>
              {stalledCount > 0 && (
                <Link
                  href="/renewals?filter=stalled"
                  className="text-[12px] transition-opacity hover:opacity-60"
                  style={{ color: "#555555" }}
                >
                  Dismiss
                </Link>
              )}
            </div>
          </Card>

          {/* Card 2 — Book Value (white outline) */}
          <Card style={{ border: "1px solid rgba(250,250,250,0.14)", background: "#161616" }}>
            <CardHead
              icon={<BarChart2 size={12} style={{ color: "#555555" }} />}
              label="Book Value"
            />
            <div className="flex-1 flex flex-col justify-between">
              <p className="text-[12px] leading-[1.6]" style={{ color: "#777777" }}>
                Total premium across your book is{" "}
                <span style={{ fontWeight: 500, color: "#FAFAFA" }}>
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
              icon={<Clock size={12} style={{ color: "#555555" }} />}
              label="Expiring Soon"
            />
            <div className="flex-1">
              {upcomingCount > 0 ? (
                <>
                  <p className="text-[12px]" style={{ color: "#777777" }}>
                    Your current upcoming renewals
                  </p>
                  <p
                    className="text-[42px] font-light leading-none mt-2 tracking-tight"
                    style={{ color: upcomingCount > 5 ? "#FF6B6B" : "#FAFAFA" }}
                  >
                    {upcomingCount}
                    <span
                      className="text-[14px] ml-2"
                      style={{ color: "#666666", fontWeight: 400 }}
                    >
                      {upcomingCount === 1 ? "policy" : "policies"}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-[13px]" style={{ color: "#666666" }}>
                  No renewals in the next 60 days.
                </p>
              )}
            </div>
            <SeeLink label="See renewals" href="/renewals" />
          </Card>

          {/* Card 4 — Certificates */}
          <Card>
            <CardHead
              icon={<FileText size={12} style={{ color: "#555555" }} />}
              label="Certificates"
            />
            <div className="flex-1">
              {coiCount > 0 ? (
                <p className="text-[13px] leading-[1.75]" style={{ color: "#888888" }}>
                  <span style={{ fontWeight: 500, color: "#FAFAFA" }}>
                    {coiCount} new {coiCount === 1 ? "request" : "requests"}
                  </span>
                  {", "}automatically categorised as certificates
                </p>
              ) : (
                <p className="text-[13px] leading-[1.75]" style={{ color: "#666666" }}>
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
              icon={<Shield size={12} style={{ color: "#555555" }} />}
              label="Active Policies"
            />
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-[12px] mb-2" style={{ color: "#777777" }}>
                Policies across your book
              </p>
              <p
                className="text-[44px] font-light leading-none tracking-tight"
                style={{ color: "#FAFAFA" }}
              >
                {activeCount.toLocaleString()}
              </p>
            </div>
            <SeeLink label="See all policies" href="/renewals" />
          </Card>

          {/* Card 6 — Stalled */}
          <Card>
            <CardHead
              icon={<AlertTriangle size={12} style={{ color: "#555555" }} />}
              label="Stalled"
            />
            <div className="flex-1">
              {stalledCount > 0 ? (
                <p className="text-[13px] leading-[1.75]" style={{ color: "#888888" }}>
                  You currently have{" "}
                  <span style={{ fontWeight: 600, color: "#FAFAFA" }}>
                    {stalledCount} stalled
                  </span>{" "}
                  {stalledCount === 1 ? "policy" : "policies"} outstanding
                  in your renewals
                </p>
              ) : (
                <p className="text-[13px]" style={{ color: "#666666" }}>
                  No stalled policies right now.
                </p>
              )}
            </div>
            <SeeLink label="See stalled" href="/renewals?filter=stalled" />
          </Card>

          {/* Card 7 — Review Queue */}
          <Card>
            <CardHead
              icon={<ClipboardCheck size={12} style={{ color: "#555555" }} />}
              label="Review Queue"
            />
            <div className="flex-1 flex items-start gap-3">
              {/* Hollis mark */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "#1C1C1C" }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontWeight: 900,
                    fontSize: 14,
                    color: "#FAFAFA",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  h
                </span>
              </div>
              <p className="text-[13px] leading-[1.75]" style={{ color: "#888888" }}>
                {reviewCount > 0 ? (
                  <>
                    <span style={{ fontWeight: 500, color: "#FAFAFA" }}>
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
              icon={<Activity size={12} style={{ color: "#555555" }} />}
              label="Activity"
            />
            <div className="flex-1 flex flex-col justify-between">
              <p className="text-[12px] leading-[1.6]" style={{ color: "#777777" }}>
                {recentLogs.length > 0 ? (
                  <>
                    Your outreach activity is{" "}
                    <span style={{ fontWeight: 500, color: "#FAFAFA" }}>
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
