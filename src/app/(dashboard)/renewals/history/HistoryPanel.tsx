"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Mail, MessageSquare, CheckCircle2, AlertTriangle, Clock, Zap,
  FileSearch, FileCheck, FileX, Shield, Brain, ArrowRight, PauseCircle,
  StickyNote, Upload, Star, AlertCircle, Inbox, Flag, Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActionRow {
  id: string;
  source: "action";
  created_at: string;
  action_type: string;
  tier: string | null;
  trigger_reason: string;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  outcome: string;
  client_id: string | null;
  policy_id: string | null;
  clients?: { name: string } | null;
  policies: { policy_name: string; client_name: string } | null;
}

interface AuditEventRow {
  id: string;
  source: "event";
  created_at: string;
  event_type: string;
  channel: string | null;
  content_snapshot: string | null;
  recipient: string | null;
  metadata: Record<string, unknown>;
  policy_id: string | null;
  policies: { policy_name: string; client_name: string } | null;
}

type FeedRow = ActionRow | AuditEventRow;

// ── Icon map ───────────────────────────────────────────────────────────────────

type IconComp = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const ICON_MAP: Record<string, IconComp> = {
  // hollis_actions
  renewal_email:             Mail,
  renewal_sms:               MessageSquare,
  renewal_intent_classified: Brain,
  renewal_stage_transition:  ArrowRight,
  renewal_halted:            PauseCircle,
  approval_queued:           Clock,
  escalation:                AlertTriangle,
  silence_detected:          AlertCircle,
  doc_chase_email:           FileSearch,
  doc_chase_sms:             MessageSquare,
  doc_chase_escalated:       FileX,
  coi_generated:             Shield,
  policy_check:              Shield,
  // renewal_audit_log
  email_sent:                Mail,
  sms_sent:                  MessageSquare,
  questionnaire_sent:        Upload,
  questionnaire_responded:   CheckCircle2,
  insurer_terms_logged:      Star,
  submission_sent:           Upload,
  recommendation_sent:       Star,
  client_confirmed:          CheckCircle2,
  final_notice_sent:         AlertCircle,
  lapse_recorded:            AlertCircle,
  doc_requested:             FileSearch,
  doc_received:              FileCheck,
  note_added:                StickyNote,
  signal_received:           Inbox,
  tier_1_action:             Zap,
  tier_2_drafted:            Clock,
  tier_3_escalated:          AlertTriangle,
  sequence_halted:           PauseCircle,
  flag_set:                  Flag,
  escalation_resolved:       CheckCircle2,
};

function getRowIcon(row: FeedRow): IconComp {
  const key = row.source === "action" ? row.action_type : row.event_type;
  return ICON_MAP[key] ?? Activity;
}

// ── Color states ───────────────────────────────────────────────────────────────

type ColorState = "success" | "pending" | "error" | "default";

function getColorState(row: FeedRow): ColorState {
  if (row.source === "action") {
    if (row.outcome === "sent") return "success";
    if (row.outcome === "queued") return "pending";
    if (row.outcome === "escalated" || row.outcome === "failed") return "error";
    return "default";
  }
  const t = row.event_type;
  if (["client_confirmed","doc_received","escalation_resolved","tier_1_action","questionnaire_responded"].includes(t)) return "success";
  if (["tier_2_drafted"].includes(t)) return "pending";
  if (["tier_3_escalated","lapse_recorded","final_notice_sent","sequence_halted"].includes(t)) return "error";
  return "default";
}

const COLOR_STYLES: Record<ColorState, { bg: string; color: string }> = {
  success: { bg: "rgba(0,212,170,0.12)",  color: "var(--accent)" },
  pending: { bg: "rgba(251,191,36,0.08)", color: "rgb(251,191,36)" },
  error:   { bg: "rgba(239,68,68,0.08)",  color: "var(--danger)" },
  default: { bg: "var(--surface)",        color: "var(--text-secondary)" },
};

// ── Labels ─────────────────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<string, string> = {
  renewal_email:             "Campaign draft",
  renewal_sms:               "SMS follow-up",
  renewal_intent_classified: "Intent classified",
  renewal_stage_transition:  "Stage updated",
  renewal_halted:            "Sequence halted",
  approval_queued:           "Client reply",
  escalation:                "Escalated to broker",
  silence_detected:          "Silence detected",
  doc_chase_email:           "Document chase · email",
  doc_chase_sms:             "Document chase · SMS",
  doc_chase_escalated:       "Doc chase escalated",
  coi_generated:             "COI generated",
  policy_check:              "Policy check run",
};

const TEMPLATE_LABELS: Record<string, string> = {
  email_90:          "90-day email",
  email_60:          "60-day email",
  sms_30:            "30-day SMS",
  script_14:         "14-day call script",
  submission_60:     "submission",
  recommendation_30: "recommendation",
};

const INTENT_LABELS: Record<string, string> = {
  confirmed:                "confirmed renewal",
  coverage_question:        "coverage query",
  price_objection:          "price concern",
  material_change_disclosed:"material change",
  contact_change:           "contact update",
  forwarded_no_intent:      "forwarded email",
  ambiguous_acknowledgement:"acknowledgement",
  prior_comms_reference:    "prior comms reference",
  declined_churn:           "client leaving",
  unclassified:             "unclassified",
  renewal_with_changes:     "renewal with changes",
  confirm_renewal:          "confirmed renewal",
  soft_query:               "query",
  out_of_office:            "out of office",
  request_callback:         "callback request",
  document_received:        "document received",
  document_required:        "document required",
  active_claim_mentioned:   "claim mentioned",
  cancel_policy:            "cancellation",
  legal_dispute:            "legal dispute",
  complaint:                "complaint",
  unknown:                  "unclassified",
};

const TIER_LABELS: Record<string, string> = {
  "1": "Tier 1 · Autonomous",
  "2": "Tier 2 · Approval",
  "3": "Tier 3 · Escalated",
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  email_sent:             "Email sent",
  sms_sent:               "SMS sent",
  questionnaire_sent:     "Questionnaire sent",
  questionnaire_responded:"Questionnaire responded",
  insurer_terms_logged:   "Insurer terms logged",
  submission_sent:        "Submission sent",
  recommendation_sent:    "Recommendation sent",
  client_confirmed:       "Renewal confirmed",
  final_notice_sent:      "Final notice sent",
  lapse_recorded:         "Lapse recorded",
  doc_requested:          "Document requested",
  doc_received:           "Document received",
  note_added:             "Note added",
  signal_received:        "Signal received",
  tier_1_action:          "Automated action",
  tier_2_drafted:         "Draft prepared",
  tier_3_escalated:       "Escalated",
  sequence_halted:        "Sequence paused",
  flag_set:               "Flag set",
  escalation_resolved:    "Escalation resolved",
};


// ── Helpers ────────────────────────────────────────────────────────────────────

function actionLabel(a: ActionRow): string {
  const base = ACTION_TYPE_LABELS[a.action_type] ?? a.action_type;
  const p = a.payload;
  const m = a.metadata;

  if (a.action_type === "renewal_email" || a.action_type === "renewal_sms") {
    const tmpl = (p?.template_used as string | undefined) ?? (m?.touchpoint_type as string | undefined);
    const tmplLabel = tmpl ? (TEMPLATE_LABELS[tmpl] ?? tmpl) : null;
    if (a.tier === "2") return tmplLabel ? `Draft prepared · ${tmplLabel}` : "Draft prepared · deadline";
    if (a.tier === "1") return tmplLabel ? `Email sent · ${tmplLabel}` : base;
    return a.tier ? `${base} · ${TIER_LABELS[a.tier] ?? `Tier ${a.tier}`}` : base;
  }
  if (a.action_type === "approval_queued") {
    const intent = (p?.intent_classification as string | undefined) ?? (m?.intent as string | undefined);
    const intentLabel = intent ? (INTENT_LABELS[intent] ?? intent.replace(/_/g, " ")) : null;
    return intentLabel ? `Draft prepared · ${intentLabel}` : "Draft prepared · client reply";
  }
  if (a.action_type === "renewal_intent_classified") {
    const cls = p?.intent_classification ?? m?.intent_classification;
    return cls ? `${base} · ${cls}` : base;
  }
  if (a.action_type === "renewal_stage_transition") {
    const prev = p?.previous_stage ?? m?.previous_stage;
    const next = p?.new_stage ?? m?.new_stage;
    return prev && next ? `Stage updated · ${prev} → ${next}` : base;
  }
  return base;
}

function getRowLabel(row: FeedRow): string {
  if (row.source === "action") return actionLabel(row);
  return AUDIT_EVENT_LABELS[row.event_type] ?? row.event_type.replace(/_/g, " ");
}

function getClientName(row: FeedRow): string {
  if (row.policies?.client_name) return row.policies.client_name;
  if (row.source === "action" && row.clients?.name) return row.clients.name;
  return "Unknown client";
}

function getPolicyName(row: FeedRow): string {
  return row.policies?.policy_name ?? "—";
}

function isEscalatedRow(row: FeedRow): boolean {
  if (row.source === "action") return row.outcome === "escalated" || row.tier === "3";
  return row.event_type === "tier_3_escalated";
}

function isLiveRow(row: FeedRow): boolean {
  return Date.now() - new Date(row.created_at).getTime() < 60_000;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function formatDateHeader(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function padT(n: number) { return String(n).padStart(2, "0"); }

function isoToHMS(iso: string, offsetSec = 0): string {
  const d = new Date(new Date(iso).getTime() + offsetSec * 1000);
  return `${padT(d.getHours())}:${padT(d.getMinutes())}:${padT(d.getSeconds())}`;
}

function formatCurrency(val: unknown): string {
  if (val == null) return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

// ── Outcome pill ───────────────────────────────────────────────────────────────

function OutcomePill({ outcome }: { outcome: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    sent:      { bg: "rgba(0,212,170,0.08)",  text: "var(--accent)",          border: "rgba(0,212,170,0.25)" },
    queued:    { bg: "var(--hover-overlay)",   text: "var(--text-secondary)",  border: "var(--border)" },
    escalated: { bg: "rgba(239,68,68,0.08)",  text: "var(--danger)",          border: "rgba(239,68,68,0.25)" },
    failed:    { bg: "rgba(239,68,68,0.08)",  text: "var(--danger)",          border: "rgba(239,68,68,0.25)" },
    halted:    { bg: "var(--hover-overlay)",   text: "var(--text-secondary)",  border: "var(--border)" },
    classified:{ bg: "var(--hover-overlay)",   text: "var(--text-tertiary)",   border: "var(--border)" },
  };
  const c = colors[outcome] ?? { bg: "var(--hover-overlay)", text: "var(--text-tertiary)", border: "var(--border)" };
  return (
    <span
      className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {outcome}
    </span>
  );
}

// ── Tier badge ─────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span style={{ color: "var(--text-tertiary)" }}>—</span>;
  const c =
    tier === "3" ? { bg: "rgba(239,68,68,0.08)",  text: "var(--danger)",         border: "rgba(239,68,68,0.25)" } :
    tier === "2" ? { bg: "var(--hover-overlay)",   text: "var(--text-secondary)", border: "var(--border)" } :
                   { bg: "rgba(0,212,170,0.08)",   text: "var(--accent)",         border: "rgba(0,212,170,0.25)" };
  return (
    <span
      className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {TIER_LABELS[tier] ?? `Tier ${tier}`}
    </span>
  );
}

// ── System log (action rows only) ──────────────────────────────────────────────

function SystemLog({ action }: { action: ActionRow }) {
  const clientName = (action.policies?.client_name ?? action.clients?.name ?? "UNKNOWN")
    .toUpperCase().replace(/\s+/g, "_");
  const lines: { time: string; label: string; value: string; colour?: string }[] = [
    { time: isoToHMS(action.created_at, 0), label: "INIT",    value: action.action_type.toUpperCase() },
    { time: isoToHMS(action.created_at, 1), label: "CLIENT",  value: clientName },
    {
      time:   isoToHMS(action.created_at, 2),
      label:  "TIER",
      value:  `${action.tier ?? "—"} · ${action.outcome.toUpperCase()}`,
      colour: isEscalatedRow(action) ? "var(--danger)" : undefined,
    },
    { time: isoToHMS(action.created_at, 3), label: "TRIGGER", value: action.trigger_reason.slice(0, 80) },
    {
      time:   isoToHMS(action.created_at, 4),
      label:  action.outcome === "sent" ? "SUCCESS" : action.outcome === "failed" ? "FAILURE" : "STATUS",
      value:  action.outcome.toUpperCase(),
      colour: action.outcome === "sent" ? "var(--accent)" : action.outcome === "failed" ? "var(--danger)" : undefined,
    },
  ];
  return (
    <div
      className="font-mono text-[12px] leading-[1.8]"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 16px" }}
    >
      {lines.map((l, i) => (
        <div key={i} className="flex gap-3">
          <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{l.time}</span>
          <span style={{ color: l.colour ?? "var(--text-secondary)" }}>
            <span style={{ color: l.colour ?? "var(--text-tertiary)" }}>{l.label}:</span>{" "}
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Inspector ──────────────────────────────────────────────────────────────────

function Inspector({ row }: { row: FeedRow | null }) {
  if (!row) {
    return (
      <div className="flex items-center justify-center h-full">
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
          Select an event to inspect.
        </span>
      </div>
    );
  }

  // Minimal panel for audit event rows
  if (row.source === "event") {
    const fields: { label: string; value: React.ReactNode }[] = [
      { label: "Event",     value: AUDIT_EVENT_LABELS[row.event_type] ?? row.event_type.replace(/_/g, " ") },
      { label: "Channel",   value: row.channel ?? "—" },
      { label: "Client",    value: getClientName(row) },
      { label: "Policy",    value: getPolicyName(row) },
      { label: "Timestamp", value: formatAbsoluteTime(row.created_at) },
      { label: "Recipient", value: row.recipient ?? "—" },
    ];
    return (
      <div className="px-6 pt-6 flex flex-col gap-6 overflow-y-auto h-full">
        <div>
          <div
            className="uppercase tracking-widest mb-3"
            style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
          >
            Event Details
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {fields.map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        {row.content_snapshot && (
          <div>
            <div
              className="uppercase tracking-widest mb-3"
              style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
            >
              Content Snapshot
            </div>
            <div
              className="text-[13px] leading-[1.7] whitespace-pre-wrap"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 16px", color: "var(--text-secondary)" }}
            >
              {row.content_snapshot}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full inspector for action rows
  const p = row.payload;
  const m = row.metadata;
  const clientName    = row.policies?.client_name ?? row.clients?.name ?? "—";
  const policyRef     = row.policies?.policy_name ?? "—";
  const carrier       = (m?.carrier as string) ?? "—";
  const daysToExpiry  = m?.days_to_expiry != null ? String(m.days_to_expiry) : "—";
  const premium       = formatCurrency(m?.premium);
  const recipientEmail = (p?.recipient_email as string) ?? "—";
  const recipientName  = (p?.recipient_name  as string) ?? clientName;
  const subject       = p?.subject as string | undefined;
  const body          = p?.body   as string | undefined;
  const channel       = (p?.channel as string)?.toUpperCase() ?? "EMAIL";

  const entityFields: { label: string; value: React.ReactNode }[] = [
    { label: "Recipient",     value: clientName },
    { label: "Contact",       value: recipientEmail },
    { label: "Carrier",       value: carrier },
    { label: "Policy",        value: policyRef },
    { label: "Days to Expiry",value: daysToExpiry },
    { label: "Premium",       value: premium },
    { label: "Tier",          value: <TierBadge tier={row.tier} /> },
    { label: "Outcome",       value: <OutcomePill outcome={row.outcome} /> },
    { label: "Timestamp",     value: formatAbsoluteTime(row.created_at) },
  ];

  return (
    <div className="relative flex flex-col h-full overflow-y-auto">
      {/* Reasoning */}
      <div className="px-6 pt-4 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
        >
          Reasoning
        </div>
        <div
          className="text-[13.5px] leading-[1.7]"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 16px", color: "var(--text-secondary)" }}
        >
          {row.trigger_reason.split(/(\b\d+%|\bTier [123]\b|\bLearning mode\b|\bAutonomous mode\b|\blearning mode\b|\bautonomous mode\b)/g).map((part, i) =>
            /^\d+%$|^Tier [123]$|^[Ll]earning mode$|^[Aa]utonomous mode$/.test(part)
              ? <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>{part}</strong>
              : <span key={i}>{part}</span>
          )}
        </div>
      </div>

      {/* Entity */}
      <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
        >
          Entity
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {entityFields.map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Payload */}
      <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
        >
          Payload
        </div>
        {body ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
            <div
              className="flex items-start justify-between gap-4 px-4 py-3"
              style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}
            >
              <div className="min-w-0">
                {subject && (
                  <div
                    className="font-display text-[14px] truncate mb-0.5"
                    style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                  >
                    {subject}
                  </div>
                )}
                <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {recipientName} · {recipientEmail}
                </div>
              </div>
              <span
                className="shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded font-mono"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                {channel}
              </span>
            </div>
            <div
              className="text-[13px] leading-[1.7] whitespace-pre-wrap"
              style={{ padding: "16px", color: "var(--text-secondary)" }}
            >
              {body}
            </div>
          </div>
        ) : (
          <span className="text-[13px] italic" style={{ color: "var(--text-tertiary)" }}>
            No message payload for this action type.
          </span>
        )}
      </div>

      {/* System Log */}
      <div className="px-6 py-5">
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
        >
          System Log
        </div>
        <SystemLog action={row} />
      </div>
    </div>
  );
}

// ── Event card (left column row) ───────────────────────────────────────────────

const EventCard = React.memo(function EventCard({
  row,
  selected,
  onSelect,
  isFirst,
  isLast,
}: {
  row: FeedRow;
  selected: boolean;
  onSelect: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const IconComp = getRowIcon(row);
  const ic = COLOR_STYLES[getColorState(row)];
  const label = getRowLabel(row);
  const clientName = getClientName(row);
  const live = isLiveRow(row);

  return (
    <div
      onClick={onSelect}
      className="relative flex cursor-pointer transition-colors"
      style={{
        height: 64,
        paddingRight: 16,
        borderLeft: selected ? "2px solid var(--text-primary)" : "2px solid transparent",
        background: selected ? "var(--surface-raised)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--hover-overlay)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Timeline column: line → icon → line, like ActivityCard */}
      <div
        className="flex flex-col items-center shrink-0"
        style={{ width: 44, paddingLeft: 12 }}
      >
        {/* Segment above icon */}
        <div style={{ flex: "1 1 0", width: 1, background: isFirst ? "transparent" : "var(--border)" }} />
        {/* Icon bubble acts as the "dot" */}
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 32, height: 32, background: ic.bg, color: ic.color }}
        >
          <IconComp size={14} strokeWidth={2} />
        </div>
        {/* Segment below icon */}
        <div
          style={{
            flex: "1 1 0",
            width: 1,
            background: isLast
              ? "linear-gradient(to bottom, var(--border), transparent)"
              : "var(--border)",
          }}
        />
      </div>

      {/* Content + time */}
      <div className="flex flex-1 min-w-0 items-center gap-3 pl-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {clientName}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="text-[11.5px] truncate" style={{ color: "var(--text-secondary)" }}>
              {label}
            </span>
            {row.source === "action" && <OutcomePill outcome={row.outcome} />}
          </div>
        </div>

        {/* Time / live ping */}
        <div className="shrink-0 flex items-center justify-end" style={{ width: 44 }}>
          {live ? (
            <span className="relative flex items-center justify-center" style={{ width: 8, height: 8 }}>
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: "var(--accent)" }}
              />
              <span
                className="relative inline-flex rounded-full"
                style={{ width: 8, height: 8, background: "var(--accent)" }}
              />
            </span>
          ) : (
            <span className="text-[11px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {timeAgo(row.created_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Date group ─────────────────────────────────────────────────────────────────

function DateGroup({
  dateKey,
  rows,
  selectedId,
  onSelect,
}: {
  dateKey: string;
  rows: FeedRow[];
  selectedId: string | null;
  onSelect: (r: FeedRow) => void;
}) {
  const issues = rows.filter(isEscalatedRow).length;

  // Render oldest→newest within day (the outer list is newest-first)
  const chronological = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div>
      <div className="px-4 pt-5 pb-2">
        <div
          className="font-display text-[15px] font-black leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          {formatDateHeader(dateKey)}
        </div>
        <div
          className="uppercase tracking-widest mt-0.5"
          style={{ fontSize: 11, color: "var(--text-secondary)", fontVariant: "small-caps" }}
        >
          {rows.length} event{rows.length !== 1 ? "s" : ""}
          {issues > 0 && ` · ${issues} issue${issues !== 1 ? "s" : ""} flagged`}
        </div>
      </div>
      <div>
        {chronological.map((r, i) => (
          <EventCard
            key={r.id}
            row={r}
            selected={selectedId === r.id}
            onSelect={() => onSelect(r)}
            isFirst={i === 0}
            isLast={i === chronological.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Skeleton loading states ────────────────────────────────────────────────────

function EventCardSkeleton({ isFirst, isLast }: { isFirst: boolean; isLast: boolean }) {
  return (
    <div className="relative flex" style={{ height: 64, paddingRight: 16 }}>
      <div className="flex flex-col items-center shrink-0" style={{ width: 44, paddingLeft: 12 }}>
        <div style={{ flex: "1 1 0", width: 1, background: isFirst ? "transparent" : "var(--border)" }} />
        <div
          className="rounded-lg shrink-0 animate-pulse"
          style={{ width: 32, height: 32, background: "var(--surface-raised)" }}
        />
        <div
          style={{
            flex: "1 1 0",
            width: 1,
            background: isLast ? "linear-gradient(to bottom, var(--border), transparent)" : "var(--border)",
          }}
        />
      </div>
      <div className="flex flex-1 min-w-0 items-center gap-3 pl-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="animate-pulse rounded" style={{ height: 13, width: "55%", background: "var(--surface-raised)" }} />
          <div className="animate-pulse rounded" style={{ height: 11, width: "38%", background: "var(--surface-raised)" }} />
        </div>
        <div className="shrink-0 animate-pulse rounded" style={{ width: 28, height: 11, background: "var(--surface-raised)" }} />
      </div>
    </div>
  );
}

function SkeletonGroup({ count = 5 }: { count?: number }) {
  return (
    <div>
      <div className="px-4 pt-5 pb-2 space-y-2">
        <div className="animate-pulse rounded" style={{ height: 15, width: "45%", background: "var(--surface-raised)" }} />
        <div className="animate-pulse rounded" style={{ height: 11, width: "22%", background: "var(--surface-raised)" }} />
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} isFirst={i === 0} isLast={i === count - 1} />
      ))}
    </div>
  );
}

function InspectorSkeleton() {
  return (
    <div className="px-6 pt-6 flex flex-col gap-6 overflow-y-auto h-full">
      {/* Reasoning skeleton */}
      <div>
        <div className="animate-pulse rounded mb-3" style={{ height: 11, width: "18%", background: "var(--surface-raised)" }} />
        <div className="animate-pulse rounded" style={{ height: 72, background: "var(--surface-raised)" }} />
      </div>
      {/* Entity skeleton */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <div className="animate-pulse rounded mb-3" style={{ height: 11, width: "14%", background: "var(--surface-raised)" }} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="animate-pulse rounded" style={{ height: 12, width: "48%", background: "var(--surface-raised)" }} />
              <div className="animate-pulse rounded" style={{ height: 13, width: "70%", background: "var(--surface-raised)" }} />
            </div>
          ))}
        </div>
      </div>
      {/* Payload skeleton */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <div className="animate-pulse rounded mb-3" style={{ height: 11, width: "16%", background: "var(--surface-raised)" }} />
        <div className="animate-pulse rounded" style={{ height: 120, background: "var(--surface-raised)" }} />
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-8 py-12">
      <div className="relative mb-5 flex items-center justify-center" style={{ width: 48, height: 48 }}>
        <span
          className="animate-hollis-pulse absolute rounded-full"
          style={{ width: 32, height: 32, background: "rgba(184,244,0,0.12)", boxShadow: "0 0 20px rgba(184,244,0,0.2)" }}
        />
        <span
          className="relative w-2 h-2 rounded-full"
          style={{ background: "#B8F400", boxShadow: "0 0 8px rgba(184,244,0,0.7)" }}
        />
      </div>
      <div
        className="font-display italic mb-2"
        style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--text-primary)" }}
      >
        Hollis is standing by.
      </div>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: 300 }}>
        Activity will appear here as your renewals, document chasing, and COI workflows run.
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface HistoryPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData?: any[];
  initialHasMore?: boolean;
  initialCursor?: string | null;
}

export default function HistoryPanel({ initialData = [], initialHasMore = false, initialCursor = null }: HistoryPanelProps) {
  const hasServerData = initialData.length > 0;
  const [rows,         setRows]         = useState<FeedRow[]>(initialData as FeedRow[]);
  const [loading,      setLoading]      = useState(!hasServerData);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(initialHasMore);
  const [cursor,       setCursor]       = useState<string | null>(initialCursor);
  const [selected,     setSelected]     = useState<FeedRow | null>(hasServerData ? (initialData[0] as FeedRow) : null);
  const [search,       setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mobileView,   setMobileView]   = useState<"list" | "detail">("list");

  const PAGE_SIZE = 50;
  const loaderRef = useRef<HTMLDivElement>(null);
  // Skip the very first fetch when server already provided initial data
  const skipFirstFetch = useRef(hasServerData);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset + fetch on search change (skip if server data is present and search is empty on first run)
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setCursor(null);
    setSelected(null);

    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/hollis-actions?${params}`)
      .then((r) => r.json())
      .then(({ data, hasMore: more, nextCursor: nc }) => {
        if (!cancelled) {
          const loaded: FeedRow[] = Array.isArray(data) ? data : [];
          setRows(loaded);
          setHasMore(!!more);
          setCursor(nc ?? null);
          if (loaded.length > 0) setSelected(loaded[0]);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [debouncedSearch]);

  // Infinite scroll: fetch next page when sentinel enters view
  const fetchMore = useCallback(() => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), before: cursor });
    if (debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/hollis-actions?${params}`)
      .then((r) => r.json())
      .then(({ data, hasMore: more, nextCursor: nc }) => {
        if (Array.isArray(data)) {
          setRows((prev) => [...prev, ...data]);
          setHasMore(!!more);
          setCursor(nc ?? null);
        }
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [loadingMore, hasMore, cursor, debouncedSearch]);

  // Intersection observer drives infinite scroll
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchMore(); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchMore]);

  // Group rows by calendar day (memoized to avoid re-grouping on unrelated renders)
  const grouped = useMemo(() => {
    const result: { dateKey: string; rows: FeedRow[] }[] = [];
    for (const r of rows) {
      const dk = toDateKey(r.created_at);
      const last = result[result.length - 1];
      if (last && last.dateKey === dk) {
        last.rows.push(r);
      } else {
        result.push({ dateKey: dk, rows: [r] });
      }
    }
    return result;
  }, [rows]);

  function selectRow(r: FeedRow) {
    setSelected(r);
    setMobileView("detail");
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)", color: "var(--text-primary)" }}>

      {/* ── Search bar ── */}
      <div
        className="shrink-0 flex items-center px-4 gap-3"
        style={{ height: 48, borderBottom: "1px solid var(--border)", background: "var(--background)" }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients or policies..."
          className="flex-1 bg-transparent outline-none"
          style={{
            fontSize: 14,
            color: "var(--text-primary)",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="shrink-0 text-[12px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Split panel ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left column */}
        <div
          className={`flex flex-col shrink-0 overflow-y-auto ${mobileView === "detail" ? "hidden md:flex" : "flex"}`}
          style={{ width: "30%", borderRight: "1px solid var(--border)" }}
        >
          {loading ? (
            <>
              <SkeletonGroup count={5} />
              <SkeletonGroup count={4} />
              <SkeletonGroup count={3} />
            </>
          ) : grouped.length === 0 ? (
            !debouncedSearch ? (
              <EmptyState />
            ) : (
              <div className="flex items-center justify-center flex-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                No events found.
              </div>
            )
          ) : (
            <>
              {grouped.map(({ dateKey, rows: grpRows }) => (
                <DateGroup
                  key={dateKey}
                  dateKey={dateKey}
                  rows={grpRows}
                  selectedId={selected?.id ?? null}
                  onSelect={selectRow}
                />
              ))}
              {hasMore && (
                <div ref={loaderRef} className="flex items-center justify-center py-6">
                  {loadingMore && (
                    <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right column (Inspector) */}
        <div
          className={`flex-1 min-w-0 ${mobileView === "list" ? "hidden md:block" : "block"}`}
          style={{ position: "relative" }}
        >
          {mobileView === "detail" && (
            <button
              onClick={() => setMobileView("list")}
              className="md:hidden flex items-center gap-2 px-4 py-3 text-[13px]"
              style={{ color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", width: "100%" }}
            >
              ← Back
            </button>
          )}
          {loading ? <InspectorSkeleton /> : <Inspector row={selected} />}
        </div>
      </div>
    </div>
  );
}
