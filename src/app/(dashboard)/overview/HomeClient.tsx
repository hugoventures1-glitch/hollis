"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTour } from "@/components/tour/TourProvider";
import {
  Inbox,
  ArrowRight,
  CheckCircle2,
  Mail,
  MessageSquare,
  Phone,
  AlertCircle,
  Clock,
  FileText,
  Zap,
  RefreshCcw,
  Timer,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface HomeStats {
  emailsSentThisWeek: number;
  confirmedThisWeek: number;
  inboxPending: number;
  monitoringCount: number;
  autonomousActionsThisWeek: number;
  activeDocChase: number;
  timeSavedMinutes: number;
}

interface UrgentRenewal {
  id: string;
  client_name: string;
  expiration_date: string;
  health_score: number | null;
  campaign_stage: string;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  channel: string | null;
  created_at: string;
  policies: { client_name: string } | { client_name: string }[] | null;
}

interface Props {
  greeting: string;
  firstName: string | null;
  today: string;
  stats: HomeStats;
  urgentRenewals: UrgentRenewal[];
  recentActivity: ActivityEvent[];
  automationActive: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - now.getTime()) / 86_400_000);
}

function clientName(policies: ActivityEvent["policies"]): string {
  if (!policies) return "Unknown client";
  if (Array.isArray(policies)) return policies[0]?.client_name ?? "Unknown client";
  return policies.client_name ?? "Unknown client";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimeSaved(minutes: number): string {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const EVENT_META: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  bar: string;
}> = {
  email_sent:       { label: "Email sent",        icon: Mail,          color: "#60A5FA", bg: "rgba(96,165,250,0.10)",  bar: "#60A5FA" },
  sms_sent:         { label: "SMS sent",           icon: MessageSquare, color: "#A78BFA", bg: "rgba(167,139,250,0.10)", bar: "#A78BFA" },
  script_ready:     { label: "Script ready",       icon: Phone,         color: "#34D399", bg: "rgba(52,211,153,0.10)",  bar: "#34D399" },
  client_confirmed: { label: "Client confirmed",   icon: CheckCircle2,  color: "#22C55E", bg: "rgba(34,197,94,0.12)",   bar: "#22C55E" },
  tier2_queued:     { label: "Draft queued",       icon: Clock,         color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  bar: "#F59E0B" },
  tier3_escalation: { label: "Escalation",         icon: AlertCircle,   color: "#F87171", bg: "rgba(248,113,113,0.12)", bar: "#F87171" },
  inbound_received: { label: "Reply received",     icon: Mail,          color: "#60A5FA", bg: "rgba(96,165,250,0.10)",  bar: "#60A5FA" },
  doc_received:     { label: "Document received",  icon: FileText,      color: "#34D399", bg: "rgba(52,211,153,0.10)",  bar: "#34D399" },
};

function eventMeta(type: string) {
  return (
    EVENT_META[type] ?? {
      label: type.replace(/_/g, " "),
      icon: Zap,
      color: "var(--text-secondary)",
      bg: "var(--background)",
      bar: "var(--border)",
    }
  );
}

function healthColor(score: number | null): string {
  if (score === null) return "var(--border)";
  if (score >= 70) return "#22C55E";
  if (score >= 40) return "#F59E0B";
  return "#F87171";
}

// ── Animated counter ───────────────────────────────────────────────────────

function AnimatedNumber({
  value,
  color,
  size = 38,
}: {
  value: number;
  color?: string;
  size?: number;
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const duration = 900;
    const startTime = Date.now();
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * value));
      if (progress < 1) { raf = requestAnimationFrame(tick); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 300,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color: color ?? "var(--text-primary)",
      }}
    >
      {displayed}
    </span>
  );
}

// ── Animated text value (for non-numeric displays) ────────────────────────

function AnimatedText({
  value,
  color,
  size = 38,
}: {
  value: string;
  color?: string;
  size?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 300,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color: color ?? "var(--text-primary)",
        opacity: visible ? 1 : 0,
        transition: "opacity 600ms ease",
      }}
    >
      {value}
    </span>
  );
}

// ── Stagger animation helper ───────────────────────────────────────────────

function Stagger({
  children,
  delay = 0,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        animation: `hollis-card-in 480ms cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
  style = {},
  hover = false,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  hover?: boolean;
  onClick?: () => void;
  [key: string]: unknown;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      {...(Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-"))))}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        transition: "box-shadow 200ms ease, transform 200ms ease",
        transform: hover && hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover && hovered ? "0 6px 24px rgba(0,0,0,0.07)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Animated gradient orbs ────────────────────────────────────────────────

interface Orb {
  rgb: string;
  opacity: number;
  size: string;
  x: string;
  y: string;
  anim: 1 | 2 | 3 | 4;
  dur: number;
  delay: number;
}

function GradientOrbs({ orbs }: { orbs: Orb[] }) {
  return (
    <>
      {orbs.map((orb, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, rgba(${orb.rgb},${orb.opacity}) 0%, transparent 68%)`,
            filter: "blur(36px)",
            animation: `hollis-drift-${orb.anim} ${orb.dur}s ease-in-out ${orb.delay}s infinite`,
          }}
        />
      ))}
    </>
  );
}

// ── Metric tile ───────────────────────────────────────────────────────────

function MetricTile({
  label,
  sublabel,
  value,
  valueDisplay,
  color,
  orbRgb,
  icon: Icon,
  delay,
}: {
  label: string;
  sublabel: string;
  value: number;
  valueDisplay?: string;
  color: string;
  orbRgb: string;
  icon: React.ElementType;
  delay: number;
}) {
  return (
    <Stagger delay={delay}>
      <Card
        style={{
          padding: "22px 24px 20px",
          position: "relative",
          overflow: "hidden",
          borderTop: `2px solid ${color}`,
        }}
      >
        <GradientOrbs orbs={[
          { rgb: orbRgb, opacity: 0.28, size: "75%", x: "92%",  y: "-18%", anim: 1, dur: 18, delay: 0 },
          { rgb: orbRgb, opacity: 0.16, size: "60%", x: "3%",   y: "88%",  anim: 3, dur: 24, delay: 7 },
        ]} />

        <p
          className="text-[10px] tracking-[0.14em] uppercase mb-4 relative"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </p>

        <div className="relative mb-2">
          {valueDisplay !== undefined ? (
            <AnimatedText value={valueDisplay} color={color} size={44} />
          ) : (
            <AnimatedNumber value={value} color={color} size={44} />
          )}
        </div>

        <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
          {sublabel}
        </p>

        <Icon
          size={34}
          strokeWidth={1}
          className="absolute bottom-4 right-4 opacity-[0.07]"
          style={{ color }}
        />
      </Card>
    </Stagger>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function HomeClient({
  greeting,
  firstName,
  today,
  stats,
  urgentRenewals,
  recentActivity,
  automationActive,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const { signalReady } = useTour();

  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true);
      signalReady();
    }, 30);
    return () => clearTimeout(t);
  }, [signalReady]);

  if (!mounted) {
    return <div className="h-full" style={{ background: "var(--background)" }} />;
  }

  const totalAttention = stats.inboxPending + urgentRenewals.length;
  const timeSavedDisplay = formatTimeSaved(stats.timeSavedMinutes);

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ background: "var(--background)", padding: "20px 20px 20px 20px" }}
    >
      {/* ══════════════════════════════════════════════════════
          ROW 1 — Hero card + Automation status
      ══════════════════════════════════════════════════════ */}
      <div className="flex gap-4 shrink-0 mb-4">

        {/* Hero welcome card */}
        <Stagger delay={0} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Card
            style={{
              padding: "32px 36px",
              position: "relative",
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            <GradientOrbs orbs={[
              { rgb: "96,165,250",  opacity: 0.26, size: "42%", x: "85%",  y: "-18%", anim: 1, dur: 22, delay: 0  },
              { rgb: "167,139,250", opacity: 0.20, size: "38%", x: "-4%",  y: "108%", anim: 2, dur: 28, delay: 5  },
              { rgb: "52,211,153",  opacity: 0.14, size: "30%", x: "52%",  y: "112%", anim: 3, dur: 18, delay: 10 },
            ]} />

            <p
              className="text-[10px] tracking-[0.2em] uppercase mb-5 relative"
              style={{ color: "var(--text-secondary)" }}
            >
              {today}
            </p>

            <h1
              className="leading-none tracking-tight mb-4 relative"
              style={{ fontSize: 46 }}
            >
              <span style={{ fontWeight: 300, color: "var(--text-primary)" }}>
                {greeting}
              </span>
              {firstName && (
                <>
                  <span style={{ fontWeight: 300, color: "var(--text-primary)" }}>,&nbsp;</span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                    {firstName}
                  </span>
                </>
              )}
              {!firstName && (
                <span style={{ fontWeight: 300, color: "var(--text-primary)" }}>.</span>
              )}
            </h1>

            {/* Status / attention line */}
            <p
              className="text-[13px] leading-relaxed relative mb-4"
              style={{ color: "var(--text-secondary)", maxWidth: 480 }}
            >
              {totalAttention > 0
                ? [
                    stats.inboxPending > 0 &&
                      `${stats.inboxPending} item${stats.inboxPending !== 1 ? "s" : ""} in your inbox`,
                    urgentRenewals.length > 0 &&
                      `${urgentRenewals.length} renewal${urgentRenewals.length !== 1 ? "s" : ""} expiring within 14 days`,
                  ]
                    .filter(Boolean)
                    .join(" · ") + "."
                : "Everything looks clear. Hollis is on it."}
            </p>

            {/* Time saved callout */}
            {stats.timeSavedMinutes > 0 && (
              <div
                className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(167,139,250,0.10)",
                  border: "1px solid rgba(167,139,250,0.20)",
                }}
              >
                <Timer size={12} style={{ color: "#A78BFA" }} strokeWidth={2} />
                <span className="text-[11px] font-medium" style={{ color: "#A78BFA" }}>
                  Hollis saved you {timeSavedDisplay} this week
                </span>
              </div>
            )}
          </Card>
        </Stagger>

        {/* Automation status */}
        <Stagger delay={60} style={{ width: 280, shrink: 0 } as React.CSSProperties}>
          <Card
            data-tour="automation-status"
            style={{
              padding: "28px 28px",
              height: "100%",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <GradientOrbs orbs={automationActive ? [
              { rgb: "34,197,94",  opacity: 0.28, size: "68%", x: "88%", y: "-22%", anim: 2, dur: 16, delay: 0 },
              { rgb: "52,211,153", opacity: 0.18, size: "55%", x: "-8%", y: "92%",  anim: 4, dur: 24, delay: 6 },
            ] : [
              { rgb: "148,163,184", opacity: 0.14, size: "68%", x: "88%", y: "-22%", anim: 3, dur: 28, delay: 2 },
              { rgb: "100,116,139", opacity: 0.10, size: "52%", x: "12%", y: "98%",  anim: 1, dur: 22, delay: 8 },
            ]} />
            <div className="flex items-start justify-between mb-4">
              <div>
                <p
                  className="text-[11px] tracking-[0.14em] uppercase mb-2"
                  style={{ color: automationActive ? "#22C55E" : "var(--text-secondary)" }}
                >
                  Automation
                </p>
                <p
                  className="text-[22px] font-semibold tracking-tight leading-none"
                  style={{ color: "var(--text-primary)" }}
                >
                  {automationActive ? "Active" : "Paused"}
                </p>
              </div>

              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: automationActive
                    ? "rgba(34,197,94,0.15)"
                    : "var(--background)",
                }}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full"
                  style={{
                    background: automationActive ? "#22C55E" : "var(--border)",
                    animation: automationActive
                      ? "hollis-pulse-green 2s ease-in-out infinite"
                      : "none",
                  }}
                />
              </div>
            </div>

            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {automationActive
                ? "Hollis is handling renewals autonomously."
                : "Manual review mode. Automation is paused."}
            </p>

            {automationActive && (
              <div className="mt-5 flex items-center gap-2">
                <div
                  className="h-0.5 flex-1 rounded-full overflow-hidden"
                  style={{ background: "rgba(34,197,94,0.15)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      background: "#22C55E",
                      width: "100%",
                      animation: "hollis-bar-grow 1.2s cubic-bezier(0.16,1,0.3,1) 200ms both",
                      ["--bar-width" as string]: "100%",
                    }}
                  />
                </div>
                <span className="text-[10px]" style={{ color: "#22C55E" }}>live</span>
              </div>
            )}

            {/* Actions this week */}
            {stats.autonomousActionsThisWeek > 0 && (
              <div
                className="mt-4 pt-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                    {stats.autonomousActionsThisWeek}
                  </span>{" "}
                  autonomous action{stats.autonomousActionsThisWeek !== 1 ? "s" : ""} this week
                </p>
              </div>
            )}
          </Card>
        </Stagger>
      </div>

      {/* ══════════════════════════════════════════════════════
          ROW 2 — 4 metric tiles
      ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-4 gap-4 shrink-0 mb-4" data-tour="metric-tiles">
        <MetricTile
          label="Active Renewals"
          sublabel="currently in pipeline"
          value={stats.monitoringCount}
          color="#60A5FA"
          orbRgb="96,165,250"
          icon={RefreshCcw}
          delay={100}
        />
        <MetricTile
          label="Docs Being Chased"
          sublabel="outstanding requests"
          value={stats.activeDocChase}
          color="#F59E0B"
          orbRgb="251,191,36"
          icon={FileText}
          delay={140}
        />
        <MetricTile
          label="Confirmed"
          sublabel="renewals this week"
          value={stats.confirmedThisWeek}
          color="#22C55E"
          orbRgb="34,197,94"
          icon={CheckCircle2}
          delay={180}
        />
        <MetricTile
          label="Time Saved"
          sublabel="by Hollis this week"
          value={stats.timeSavedMinutes}
          valueDisplay={timeSavedDisplay}
          color="#A78BFA"
          orbRgb="167,139,250"
          icon={Timer}
          delay={220}
        />
      </div>

      {/* ══════════════════════════════════════════════════════
          ROW 3 — Activity feed + right column
      ══════════════════════════════════════════════════════ */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Activity feed */}
        <Stagger delay={260} className="flex-1 min-w-0 flex flex-col" style={{ minHeight: 0 }}>
          <Card
            className="flex flex-col"
            style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            <GradientOrbs orbs={[
              { rgb: "96,165,250",  opacity: 0.16, size: "32%", x: "96%", y: "4%",  anim: 1, dur: 26, delay: 3  },
              { rgb: "129,140,248", opacity: 0.14, size: "28%", x: "-2%", y: "76%", anim: 3, dur: 32, delay: 9  },
              { rgb: "52,211,153",  opacity: 0.10, size: "22%", x: "60%", y: "96%", anim: 4, dur: 20, delay: 15 },
            ]} />
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <p
                className="text-[10px] tracking-[0.14em] uppercase"
                style={{ color: "var(--text-secondary)" }}
              >
                Recent activity
              </p>
              <Link
                href="/activity"
                className="flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")
                }
              >
                View all
                <ArrowRight size={11} />
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    No activity yet.
                  </p>
                </div>
              ) : (
                recentActivity.map((event, i) => {
                  const meta = eventMeta(event.event_type);
                  const Icon = meta.icon;
                  const isLast = i === recentActivity.length - 1;

                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-4 px-6"
                      style={{
                        paddingTop: 14,
                        paddingBottom: 14,
                        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                        animation: `hollis-row-in 360ms cubic-bezier(0.16,1,0.3,1) ${280 + i * 55}ms both`,
                        position: "relative",
                      }}
                    >
                      {/* Coloured left bar */}
                      <div
                        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full"
                        style={{ background: meta.bar, opacity: 0.6 }}
                      />

                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: meta.bg }}
                      >
                        <Icon size={14} style={{ color: meta.color }} strokeWidth={1.8} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[13px] font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {clientName(event.policies)}
                        </p>
                        <p
                          className="text-[11px] mt-0.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {meta.label}
                        </p>
                      </div>

                      <p
                        className="text-[11px] shrink-0 tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {relativeTime(event.created_at)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </Stagger>

        {/* Right column */}
        <div className="flex flex-col gap-4 shrink-0" style={{ width: 288 }}>

          {/* Expiring soon */}
          <Stagger delay={300} className="flex-1 min-h-0 flex flex-col">
            <Card
              data-tour="expiring-soon"
              className="flex flex-col"
              style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            >
              <GradientOrbs orbs={[
                { rgb: "245,158,11",  opacity: 0.24, size: "65%", x: "96%", y: "-12%", anim: 2, dur: 20, delay: 1 },
                { rgb: "248,113,113", opacity: 0.18, size: "52%", x: "-4%", y: "92%",  anim: 1, dur: 26, delay: 7 },
              ]} />
              <div
                className="flex items-center justify-between px-5 py-4 shrink-0"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <p
                  className="text-[10px] tracking-[0.14em] uppercase"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Expiring soon
                </p>
                {urgentRenewals.length > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: "rgba(245,158,11,0.12)",
                      color: "#F59E0B",
                    }}
                  >
                    {urgentRenewals.length} within 14d
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {urgentRenewals.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      No urgent renewals.
                    </p>
                  </div>
                ) : (
                  urgentRenewals.map((r, i) => {
                    const days = daysUntil(r.expiration_date);
                    const isLast = i === urgentRenewals.length - 1;
                    const urgentColor = days <= 7 ? "#F87171" : "#F59E0B";

                    return (
                      <Link
                        href={`/renewals/${r.id}`}
                        key={r.id}
                        className="flex items-center gap-3 px-5 cursor-pointer"
                        style={{
                          paddingTop: 13,
                          paddingBottom: 13,
                          borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
                          animation: `hollis-row-in 360ms cubic-bezier(0.16,1,0.3,1) ${320 + i * 60}ms both`,
                          transition: "background 150ms ease",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLElement).style.background = "var(--background)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLElement).style.background = "transparent")
                        }
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: healthColor(r.health_score) }}
                        />
                        <p
                          className="text-[12px] font-medium flex-1 truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {r.client_name}
                        </p>
                        <span
                          className="text-[11px] shrink-0 font-medium tabular-nums px-1.5 py-0.5 rounded"
                          style={{
                            color: urgentColor,
                            background:
                              days <= 7
                                ? "rgba(248,113,113,0.10)"
                                : "rgba(245,158,11,0.10)",
                          }}
                        >
                          {days}d
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </Card>
          </Stagger>

          {/* Inbox + Doc chase card */}
          <Stagger delay={360}>
            <Card style={{ overflow: "hidden", position: "relative" }}>
              <GradientOrbs orbs={[
                { rgb: "99,102,241",  opacity: 0.20, size: "80%", x: "92%", y: "-5%", anim: 4, dur: 22, delay: 4 },
                { rgb: "148,163,184", opacity: 0.14, size: "62%", x: "12%", y: "96%", anim: 2, dur: 18, delay: 0 },
              ]} />

              {/* Inbox row */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <Inbox size={12} strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Inbox
                  </span>
                </div>
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color:
                      stats.inboxPending > 0 ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {stats.inboxPending > 0 ? `${stats.inboxPending} pending` : "All clear"}
                </span>
              </div>

              {/* Doc chase row */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <FileText size={12} strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Doc chase
                  </span>
                </div>
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color:
                      stats.activeDocChase > 0 ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {stats.activeDocChase > 0 ? `${stats.activeDocChase} active` : "None active"}
                </span>
              </div>

              {/* Emails row */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <Mail size={12} strokeWidth={1.8} style={{ color: "var(--text-secondary)" }} />
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Emails sent
                  </span>
                </div>
                <span
                  className="text-[11px] font-medium tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {stats.emailsSentThisWeek} this week
                </span>
              </div>

              <Link
                href="/inbox"
                className="flex items-center justify-center gap-2 px-5 py-4 w-full cursor-pointer relative"
                style={{
                  color: "var(--text-primary)",
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "var(--background)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "transparent")
                }
              >
                <span className="text-[13px] font-medium tracking-tight">Go to inbox</span>
                {stats.inboxPending > 0 && (
                  <span
                    className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.18)" }}
                  >
                    {stats.inboxPending}
                  </span>
                )}
                <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Card>
          </Stagger>
        </div>
      </div>
    </div>
  );
}
