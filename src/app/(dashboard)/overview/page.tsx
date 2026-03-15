import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Search,
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
import { FeedInput } from "./_components/FeedInput";

export const dynamic = "force-dynamic";

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

// ── SVG mini bar chart (Book Value card) ─────────────────────────────────────

function MiniBarChart() {
  const bars = [
    0.30, 0.55, 0.40, 0.70, 0.48, 0.82, 0.44, 0.76,
    0.53, 0.88, 0.65, 0.42, 0.92, 0.75,
  ];
  return (
    <svg viewBox="0 0 140 38" width="100%" height="38" preserveAspectRatio="none">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 10 + 1}
          y={(1 - h) * 38}
          width={7}
          height={h * 38}
          rx={1.5}
          fill={
            i === bars.length - 1
              ? "rgba(250,250,250,0.80)"
              : i >= bars.length - 3
              ? "rgba(250,250,250,0.38)"
              : "rgba(250,250,250,0.16)"
          }
        />
      ))}
    </svg>
  );
}

// ── SVG sparkline (Activity card) ────────────────────────────────────────────

function Sparkline() {
  const pts = [3, 7, 5, 12, 8, 18, 14, 10, 22, 16, 20, 15];
  const max = Math.max(...pts);
  const W = 100, H = 34;
  const points = pts
    .map((p, i) => `${(i / (pts.length - 1)) * W},${H - (p / max) * H}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(250,250,250,0.40)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Card primitives ───────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl p-5 flex flex-col ${className}`}
      style={{ background: "#111111", border: "1px solid #1E1E1E", minHeight: 172 }}
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
        <span className="text-[11px]" style={{ color: "#555555" }}>
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
        style={{ color: "#555555" }}
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

  const today = new Date().toISOString().split("T")[0];
  const in60 = addDays(60);

  const [
    activePoliciesRes,
    upcomingCountRes,
    stalledCountRes,
    logsRes,
    profileRes,
    coiRes,
    reviewRes,
  ] = await Promise.all([
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

    // Count stalled
    supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("health_label", "stalled"),

    // Recent send logs — for activity level
    supabase
      .from("send_logs")
      .select("id, sent_at")
      .eq("user_id", user.id)
      .order("sent_at", { ascending: false })
      .limit(30),

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
  const lastName       = profileRes.data?.last_name  ?? null;
  const coiCount       = coiRes.count    ?? 0;
  const reviewCount    = reviewRes.count ?? 0;

  // Header avatar initials
  const initials =
    [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() || "H";

  // Summary card text
  const summaryParts: string[] = [];
  if (bookValue > 0)     summaryParts.push(`Book value ${formatBookValue(bookValue)}`);
  if (activeCount > 0)   summaryParts.push(`${activeCount} active policies`);
  if (upcomingCount > 0) summaryParts.push(`${upcomingCount} renewing in 60 days`);
  const summaryText   = summaryParts.length ? summaryParts.join(", ") + "." : "No data yet.";
  const summaryStatus =
    stalledCount > 0
      ? `${stalledCount} stalled ${stalledCount === 1 ? "policy" : "policies"} need attention.`
      : upcomingCount > 0
      ? "Keep an eye on upcoming renewals."
      : "Things are looking good.";

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
          <Search size={14} />
          Find anything
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold select-none"
          style={{ background: "#1C1C1C", color: "#888888" }}
        >
          {initials}
        </div>
      </header>

      {/* ── Scrollable body ── */}
      <div className="flex-1 px-8 pt-8">

        {/* Greeting + controls */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-[26px] leading-tight tracking-tight">
              <span style={{ fontWeight: 300 }}>{greeting} </span>
              <span style={{ fontWeight: 600 }}>{firstName ?? "there"}</span>
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "#666666" }}>
              here&apos;s a quick look at how things are going.
            </p>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 mt-1">
            {/* Grid / List toggle */}
            <div
              className="flex items-center h-8 rounded-lg overflow-hidden"
              style={{ border: "1px solid #222222", background: "#111111" }}
            >
              <button
                className="w-8 h-full flex items-center justify-center"
                style={{ color: "#FAFAFA", background: "#1C1C1C" }}
                aria-label="Grid view"
              >
                <svg viewBox="0 0 14 14" width="13" height="13" fill="currentColor">
                  <rect x="0" y="0" width="6" height="6" rx="1.2" />
                  <rect x="8" y="0" width="6" height="6" rx="1.2" />
                  <rect x="0" y="8" width="6" height="6" rx="1.2" />
                  <rect x="8" y="8" width="6" height="6" rx="1.2" />
                </svg>
              </button>
              <button
                className="w-8 h-full flex items-center justify-center"
                style={{ color: "#3A3A3A" }}
                aria-label="List view"
              >
                <svg
                  viewBox="0 0 14 12"
                  width="13"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <line x1="0" y1="2"  x2="14" y2="2"  />
                  <line x1="0" y1="6"  x2="14" y2="6"  />
                  <line x1="0" y1="10" x2="14" y2="10" />
                </svg>
              </button>
            </div>

            {/* Time filter */}
            <button
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium"
              style={{ background: "#111111", border: "1px solid #222222", color: "#888888" }}
            >
              <svg
                viewBox="0 0 12 12"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="1" y="1" width="10" height="10" rx="2" />
                <line x1="1" y1="4.5" x2="11" y2="4.5" />
                <line x1="4" y1="1"   x2="4"  y2="4.5" />
                <line x1="8" y1="1"   x2="8"  y2="4.5" />
              </svg>
              60 days
              <svg
                viewBox="0 0 10 6"
                width="9"
                height="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <polyline points="1,1 5,5 9,1" />
              </svg>
            </button>

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
          </div>
        </div>

        {/* Import banner (client component — localStorage-driven) */}
        <ImportBanner />

        {/* ── 4 × 2 card grid ── */}
        <div className="grid grid-cols-4 gap-3 mt-7">

          {/* ─── Row 1 ─────────────────────────────────────── */}

          {/* Card 1 — Weekly Summary */}
          <Card>
            <CardHead
              icon={<CalendarDays size={12} style={{ color: "#555555" }} />}
              label="Weekly Summary"
              badge="Just now"
            />
            <div className="flex-1">
              <p className="text-[13px] leading-[1.75]" style={{ color: "#888888" }}>
                {summaryText}{" "}
                <span style={{ color: stalledCount > 0 ? "#FAFAFA" : "#888888" }}>
                  {summaryStatus}
                </span>
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

          {/* Card 2 — Book Value */}
          <Card>
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
                <MiniBarChart />
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
                <Sparkline />
              </div>
            </div>
            <SeeLink label="See activity" href="/activity" />
          </Card>

        </div>

        {/* ── Feed input section ── */}
        <div className="mt-10">
          <FeedInput />
        </div>

      </div>
    </div>
  );
}
