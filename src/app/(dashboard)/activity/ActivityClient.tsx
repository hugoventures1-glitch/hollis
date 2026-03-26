"use client";

import { useState, useMemo, useEffect } from "react";
import type { AuditEventType } from "@/types/renewals";
import HistoryPanel from "@/app/(dashboard)/renewals/history/HistoryPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  event_type: AuditEventType;
  channel: string | null;
  created_at: string;
  policies: { client_name: string } | { client_name: string }[] | null;
}

export interface ActivityStats {
  touchpoints: number;
  confirmed: number;
  replyRate: number | null;
  totalSent: number;
  monitoringCount: number;
  autonomousActionsTotal: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EVENT_LABELS: Partial<Record<AuditEventType, string>> = {
  email_sent:              "Email sent",
  sms_sent:                "SMS sent",
  questionnaire_sent:      "Questionnaire sent",
  questionnaire_responded: "Questionnaire received",
  insurer_terms_logged:    "Insurer terms logged",
  submission_sent:         "Submission sent",
  recommendation_sent:     "Recommendation sent",
  client_confirmed:        "Renewal confirmed",
  final_notice_sent:       "Final notice sent",
  lapse_recorded:          "Lapse recorded",
  doc_requested:           "Document requested",
  doc_received:            "Document received",
  note_added:              "Note added",
  signal_received:         "Signal received",
  tier_1_action:           "Automated action",
  tier_2_drafted:          "Draft prepared",
  tier_3_escalated:        "Escalated",
  sequence_halted:         "Sequence paused",
  flag_set:                "Flag set",
};

const EVENT_ICONS: Partial<Record<AuditEventType, string>> = {
  email_sent:              "✉",
  sms_sent:                "◉",
  questionnaire_sent:      "≡",
  questionnaire_responded: "✓",
  insurer_terms_logged:    "◈",
  submission_sent:         "↑",
  recommendation_sent:     "★",
  client_confirmed:        "✓✓",
  final_notice_sent:       "!",
  lapse_recorded:          "○",
  doc_requested:           "⌗",
  doc_received:            "↓",
  note_added:              "—",
  tier_1_action:           "⚡",
  tier_2_drafted:          "✏",
  tier_3_escalated:        "▲",
  sequence_halted:         "‖",
};


// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientName(entry: AuditRow): string | null {
  if (!entry.policies) return null;
  return Array.isArray(entry.policies)
    ? (entry.policies[0]?.client_name ?? null)
    : (entry.policies.client_name ?? null);
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

// ── Session grouping ──────────────────────────────────────────────────────────

interface Session {
  id: string;
  startTime: Date;
  items: AuditRow[];        // most recent first
  label: string;
}

function groupIntoSessions(feed: AuditRow[]): Session[] {
  if (feed.length === 0) return [];
  const sorted = [...feed].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const groups: AuditRow[][] = [];
  let cur: AuditRow[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      (new Date(sorted[i].created_at).getTime() -
        new Date(sorted[i - 1].created_at).getTime()) /
      60_000;
    if (gap > 30) { groups.push(cur); cur = []; }
    cur.push(sorted[i]);
  }
  groups.push(cur);

  return groups
    .map((items): Session => {
      const start = new Date(items[0].created_at);
      const now = new Date();
      const isToday = start.toDateString() === now.toDateString();
      const isYest =
        new Date(now.getTime() - 86_400_000).toDateString() ===
        start.toDateString();
      const dateStr = isToday
        ? "Today"
        : isYest
        ? "Yesterday"
        : start.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
      const timeStr = start.toLocaleTimeString("en-AU", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const n = items.length;
      return {
        id: items[0].id,
        startTime: start,
        items: [...items].reverse(),
        label: `${dateStr} at ${timeStr} — Hollis processed ${n} action${n !== 1 ? "s" : ""}`,
      };
    })
    .reverse(); // most recent session first
}

// ── Log chain of thought ──────────────────────────────────────────────────────

function buildLogLines(items: AuditRow[]): string[] {
  const lines: string[] = [];
  for (const item of [...items].reverse()) {
    const ts = formatTs(item.created_at);
    const client = getClientName(item);
    const c = client ? ` · ${client}` : "";
    switch (item.event_type) {
      case "email_sent":
        lines.push(`[${ts}]  Scanning renewal file${c}...`);
        lines.push(`[${ts}]  Drafting outreach email...`);
        lines.push(`[${ts}]  Email dispatched. Status: Sent.`);
        break;
      case "sms_sent":
        lines.push(`[${ts}]  Composing SMS${c}...`);
        lines.push(`[${ts}]  SMS queued and delivered to carrier.`);
        break;
      case "questionnaire_sent":
        lines.push(`[${ts}]  Building questionnaire${c}...`);
        lines.push(`[${ts}]  Link generated and dispatched.`);
        break;
      case "questionnaire_responded":
        lines.push(`[${ts}]  Response detected${c}.`);
        lines.push(`[${ts}]  Parsing client answers...`);
        lines.push(`[${ts}]  Record updated.`);
        break;
      case "submission_sent":
        lines.push(`[${ts}]  Compiling submission package${c}...`);
        lines.push(`[${ts}]  Submission forwarded to underwriter.`);
        break;
      case "client_confirmed":
        lines.push(`[${ts}]  Acknowledgement received${c}.`);
        lines.push(`[${ts}]  Status updated → Confirmed. ✓`);
        break;
      case "recommendation_sent":
        lines.push(`[${ts}]  Generating renewal recommendation${c}...`);
        lines.push(`[${ts}]  Recommendation dispatched to client.`);
        break;
      case "tier_1_action":
        lines.push(`[${ts}]  Autonomous action triggered${c}.`);
        lines.push(`[${ts}]  Executed without escalation.`);
        break;
      case "tier_2_drafted":
        lines.push(`[${ts}]  Draft staged for review${c}.`);
        break;
      case "tier_3_escalated":
        lines.push(`[${ts}]  Complex case flagged${c}.`);
        lines.push(`[${ts}]  Escalated for manual handling.`);
        break;
      case "doc_requested":
        lines.push(`[${ts}]  Document request issued${c}.`);
        break;
      case "doc_received":
        lines.push(`[${ts}]  Document received${c}. Indexing...`);
        lines.push(`[${ts}]  File stored.`);
        break;
      default:
        lines.push(
          `[${ts}]  ${EVENT_LABELS[item.event_type] ?? item.event_type.replace(/_/g, " ")}${c}.`
        );
    }
  }
  return lines;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BentoStat({
  label,
  value,
  sub,
  lime,
  col2,
}: {
  label: string;
  value: string;
  sub?: string;
  lime?: boolean;
  col2?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 p-4 rounded-xl ${col2 ? "col-span-2" : ""}`}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid #1C1C1C",
      }}
    >
      <span
        className="text-[10px] font-medium uppercase tracking-[0.09em]"
        style={{ color: "#444444" }}
      >
        {label}
      </span>
      <span
        className="text-[38px] leading-none tracking-tight"
        style={{
          fontFamily: "var(--font-playfair)",
          fontWeight: 700,
          color: lime ? "#B8F400" : "#FAFAFA",
          textShadow: lime ? "0 0 24px rgba(184,244,0,0.35)" : "none",
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px]" style={{ color: "#3A3A3A" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function ClientInitial({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex items-center gap-2" title={name}>
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0"
        style={{
          background: "rgba(184,244,0,0.08)",
          border: "1px solid rgba(184,244,0,0.15)",
          color: "#B8F400",
        }}
      >
        {initials}
      </div>
      <span
        className="text-[11px] truncate"
        style={{ color: "#555555" }}
      >
        {name}
      </span>
    </div>
  );
}


function ActivityCard({
  entry,
  isFirst,
  isLast,
}: {
  entry: AuditRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const client = getClientName(entry);
  const label = EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ");
  const icon = EVENT_ICONS[entry.event_type] ?? "·";

  // Line above: absent for first (most recent) event
  const lineAbove = isFirst ? "transparent" : "#1E1E1E";
  // Line below: fades out for last (oldest) event, also fades if it's the only event
  const lineBelow = isLast
    ? "linear-gradient(to bottom, #1E1E1E, transparent)"
    : "#1E1E1E";

  return (
    <div className="flex gap-3">
      {/* Timeline column */}
      <div className="flex flex-col items-center w-4 shrink-0">
        {/* Segment above dot */}
        <div className="w-px" style={{ flex: "1 1 0", minHeight: 14, background: lineAbove }} />
        {/* Dot */}
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: "#1E1E1E", border: "1px solid #3A3A3A" }}
        />
        {/* Segment below dot */}
        <div className="w-px" style={{ flex: "1 1 0", minHeight: 14, background: lineBelow }} />
      </div>

      {/* Card */}
      <div
        className="flex-1 min-w-0 mb-2 flex items-start gap-3 px-3 py-2.5 rounded-lg"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid #1A1A1A",
        }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[10px] shrink-0 mt-0.5"
          style={{ background: "rgba(255,255,255,0.04)", color: "#555555" }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium" style={{ color: "#DDDDDD" }}>
              {label}
            </span>
            <span className="text-[10px] shrink-0 tabular-nums" style={{ color: "#333333" }}>
              {timeAgo(entry.created_at)}
            </span>
          </div>
          {client && (
            <span className="text-[11px]" style={{ color: "#555555" }}>
              {client}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionBlock({
  session,
  expanded,
  showLog,
  onToggle,
  onToggleLog,
}: {
  session: Session;
  expanded: boolean;
  showLog: boolean;
  onToggle: () => void;
  onToggleLog: () => void;
}) {
  const logLines = useMemo(
    () => (showLog ? buildLogLines(session.items) : []),
    [showLog, session.items]
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C1C1C" }}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <span
          className="text-[11px] font-medium"
          style={{ color: "#555555" }}
        >
          {session.label}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-[10px] transition-transform"
            style={{
              color: "#2A2A2A",
              display: "inline-block",
              transform: expanded ? "rotate(180deg)" : "none",
            }}
          >
            ↓
          </span>
        </div>
      </button>

      {/* Expanded items */}
      {expanded && (
        <div style={{ borderTop: "1px solid #1A1A1A" }}>
          <div className="relative pl-8 pr-4 py-3 flex flex-col gap-1">
            {/* Thread */}
            <div
              className="absolute left-[18px] top-0 bottom-0 w-px"
              style={{ background: "#1C1C1C" }}
            />
            {session.items.map((entry) => {
              const client = getClientName(entry);
              const label =
                EVENT_LABELS[entry.event_type] ??
                entry.event_type.replace(/_/g, " ");
              const icon = EVENT_ICONS[entry.event_type] ?? "·";
              return (
                <div
                  key={entry.id}
                  className="relative flex items-center gap-2.5 py-1.5"
                >
                  <div
                    className="absolute -left-[20px] top-[11px] w-1.5 h-1.5 rounded-full"
                    style={{ background: "#242424", border: "1px solid #333333" }}
                  />
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[9px] shrink-0"
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      color: "#444444",
                    }}
                  >
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                    <span className="text-[12px]" style={{ color: "#CCCCCC" }}>
                      {label}
                    </span>
                    {client && (
                      <span className="text-[11px]" style={{ color: "#3A3A3A" }}>
                        · {client}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[9px] shrink-0 tabular-nums font-mono"
                    style={{ color: "#2A2A2A" }}
                  >
                    {formatTs(entry.created_at)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Log toggle */}
          <div style={{ borderTop: "1px solid #1A1A1A" }}>
            <button
              onClick={onToggleLog}
              className="w-full px-4 py-2 text-left text-[10px] transition-colors font-mono"
              style={{ color: "#2A2A2A" }}
            >
              {showLog ? "↑ hide system log" : "↓ show system log"}
            </button>
            {showLog && (
              <div
                className="px-4 pt-1 pb-4 font-mono text-[10px] leading-[1.8] overflow-x-auto"
                style={{
                  background: "#050505",
                  borderTop: "1px solid #111111",
                }}
              >
                {logLines.map((line, i) => {
                  const isBracket = line.startsWith("[");
                  const tsEnd = line.indexOf("]") + 1;
                  const ts = isBracket ? line.slice(0, tsEnd) : "";
                  const rest = isBracket ? line.slice(tsEnd) : line;
                  const isSuccess =
                    rest.includes("✓") ||
                    rest.includes("Confirmed") ||
                    rest.includes("dispatched") ||
                    rest.includes("delivered") ||
                    rest.includes("stored");
                  return (
                    <div key={i}>
                      {ts && (
                        <span style={{ color: "#3A3A3A" }}>{ts}</span>
                      )}
                      <span
                        style={{
                          color: isSuccess ? "#B8F400" : "#555555",
                          textShadow: isSuccess
                            ? "0 0 8px rgba(184,244,0,0.25)"
                            : "none",
                        }}
                      >
                        {rest}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IdleState({ count }: { count: number }) {
  return (
    <div
      className="p-5 rounded-xl"
      style={{
        border: "1px solid rgba(184,244,0,0.08)",
        background: "rgba(184,244,0,0.015)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-1.5 h-1.5 rounded-full inline-block animate-hollis-pulse"
          style={{ background: "#B8F400", boxShadow: "0 0 8px rgba(184,244,0,0.7)" }}
        />
        <span className="text-[11px]" style={{ color: "#555555" }}>
          Hollis is standing by
        </span>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "#444444" }}>
        Watching{" "}
        <span style={{ color: "#FAFAFA" }}>
          {count} client file{count !== 1 ? "s" : ""}
        </span>{" "}
        for document returns, renewal signals, and insurer responses.
      </p>
      <div
        className="mt-4 pt-4 flex flex-col gap-0.5 font-mono text-[10px] leading-6"
        style={{ borderTop: "1px solid rgba(184,244,0,0.06)", color: "#2A2A2A" }}
      >
        <span>[IDLE]  Listening on inbound queue...</span>
        <span>[SCHED] Next policy audit batch: 3:00 PM</span>
        <span>[WATCH] Email parser active — 0 new signals</span>
        <span>[QUEUE] {count} clients awaiting next action</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityClient({
  feed,
  stats,
}: {
  feed: AuditRow[];
  stats: ActivityStats;
}) {
  const [view, setView] = useState<"live" | "history">("live");

  const sessions = useMemo(() => groupIntoSessions(feed), [feed]);

  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    () => {
      const s = groupIntoSessions(feed);
      return s.length > 0 ? new Set([s[0].id]) : new Set();
    }
  );
  const [showLogs, setShowLogs] = useState<Set<string>>(new Set());

  // Unique clients from feed (for monitoring sidebar)
  const monitoredClients = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of feed) {
      const n = getClientName(e);
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    }
    return out.slice(0, 12);
  }, [feed]);

  const autonomousActionsTotal = stats.autonomousActionsTotal;

  const toggle = (id: string, set: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const monCount = stats.monitoringCount || monitoredClients.length;

  return (
    <div
      className="flex flex-col h-full relative"
      style={{ background: "var(--background)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header
        className="h-[56px] shrink-0 flex items-center justify-between px-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[12px]" style={{ color: "#555555" }}>
          Activity
        </span>

        {/* Live / History toggle */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-md"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid #1C1C1C",
          }}
        >
          {(["live", "history"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-medium transition-all capitalize"
              style={{
                background: view === v ? "rgba(255,255,255,0.07)" : "transparent",
                color: view === v ? "#FAFAFA" : "#444444",
              }}
            >
              {v === "live" && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: "#B8F400",
                    boxShadow: "0 0 6px rgba(184,244,0,0.8)",
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                />
              )}
              {v}
            </button>
          ))}
        </div>
      </header>

      {view === "history" && (
        <div className="absolute inset-0" style={{ top: 57, zIndex: 10, background: "#000" }}>
          <HistoryPanel />
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto"
        aria-hidden={view === "history" || undefined}
        style={{ visibility: view === "history" ? "hidden" : undefined }}
      >
        <div className="max-w-6xl mx-auto px-8 py-10">

          {/* ── Heading ── */}
          <div className="flex items-center gap-3 mb-8">
            <h1
              className="text-[32px] leading-none tracking-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                fontWeight: 900,
                color: "#FAFAFA",
              }}
            >
              Hollis is working.
            </h1>
            <span
              className="w-2 h-2 rounded-full shrink-0 animate-hollis-pulse"
              style={{
                background: "#B8F400",
                boxShadow: "0 0 10px rgba(184,244,0,0.8)",
              }}
            />
          </div>

          {/* ── Bento Grid ── */}
          <div className="grid grid-cols-3 gap-3 mb-10">
            <BentoStat
              label="Autonomous Actions"
              value={autonomousActionsTotal > 0 ? autonomousActionsTotal.toString() : "—"}
              sub="all time"
              lime
            />
            <BentoStat
              label="Touchpoints"
              value={stats.touchpoints.toString()}
              sub="last 30 days"
            />
            <BentoStat
              label="Confirmed"
              value={stats.confirmed.toString()}
              sub="last 7 days"
            />
            <BentoStat
              label="Reply Rate"
              value={stats.replyRate !== null ? `${stats.replyRate}%` : "—"}
              sub="questionnaires"
            />
            <BentoStat
              label="Total Sent"
              value={stats.totalSent.toString()}
              sub="all time"
            />
            <BentoStat
              label="Monitoring"
              value={monCount.toString()}
              sub="active clients"
            />
          </div>

          {/* ── 2-col layout ── */}
          <div
            className="grid gap-8"
            style={{ gridTemplateColumns: "148px 1fr" }}
          >

            {/* Left: monitoring list */}
            <div>
              <p
                className="text-[10px] font-medium uppercase tracking-[0.09em] mb-4"
                style={{ color: "#333333" }}
              >
                Monitoring
              </p>
              <div className="flex flex-col gap-2.5">
                {monitoredClients.length === 0 ? (
                  <p className="text-[11px]" style={{ color: "#2A2A2A" }}>
                    —
                  </p>
                ) : (
                  monitoredClients.map((name) => (
                    <ClientInitial key={name} name={name} />
                  ))
                )}
              </div>
              {stats.monitoringCount > monitoredClients.length && (
                <p className="text-[10px] mt-4" style={{ color: "#2A2A2A" }}>
                  +{stats.monitoringCount - monitoredClients.length} more
                </p>
              )}
            </div>

            {/* Center: feed / sessions */}
            <div className="min-w-0">
              {view === "live" ? (
                <>
                  <p
                    className="text-[10px] font-medium uppercase tracking-[0.09em] mb-5"
                    style={{ color: "#333333" }}
                  >
                    Recent activity
                  </p>
                  {feed.length === 0 ? (
                    <IdleState count={monCount} />
                  ) : (
                    <div className="flex flex-col">
                      {feed.slice(0, 15).map((entry, i, arr) => (
                        <ActivityCard
                          key={entry.id}
                          entry={entry}
                          isFirst={i === 0}
                          isLast={i === arr.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p
                    className="text-[10px] font-medium uppercase tracking-[0.09em] mb-5"
                    style={{ color: "#333333" }}
                  >
                    Work sessions
                  </p>
                  {sessions.length === 0 ? (
                    <IdleState count={monCount} />
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {sessions.map((s) => (
                        <SessionBlock
                          key={s.id}
                          session={s}
                          expanded={expandedSessions.has(s.id)}
                          showLog={showLogs.has(s.id)}
                          onToggle={() =>
                            toggle(s.id, expandedSessions, setExpandedSessions)
                          }
                          onToggleLog={() =>
                            toggle(s.id, showLogs, setShowLogs)
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}
