"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/components/actions/MicroToast";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HollisAction {
  id: string;
  broker_id: string;
  client_id: string | null;
  policy_id: string | null;
  action_type: string;
  tier: string | null;
  trigger_reason: string;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  outcome: string;
  retain_until: string;
  archived: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  clients: { name: string } | null;
  policies: { policy_name: string; client_name: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<string, string> = {
  renewal_email:              "Campaign draft",
  renewal_sms:                "SMS follow-up",
  renewal_intent_classified:  "Intent classified",
  renewal_stage_transition:   "Stage updated",
  renewal_halted:             "Sequence halted",
  approval_queued:            "Client reply",
  escalation:                 "Escalated to broker",
  silence_detected:           "Silence detected",
  doc_chase_email:            "Document chase · email",
  doc_chase_sms:              "Document chase · SMS",
  doc_chase_escalated:        "Doc chase escalated",
  coi_generated:              "COI generated",
  policy_check:               "Policy check run",
};

const TEMPLATE_LABELS: Record<string, string> = {
  email_90:         "90-day email",
  email_60:         "60-day email",
  sms_30:           "30-day SMS",
  script_14:        "14-day call script",
  submission_60:    "submission",
  recommendation_30:"recommendation",
};

const INTENT_LABELS: Record<string, string> = {
  renewal_with_changes:  "renewal with changes",
  confirm_renewal:       "confirmed renewal",
  soft_query:            "query",
  out_of_office:         "out of office",
  request_callback:      "callback request",
  document_received:     "document received",
  active_claim_mentioned:"claim mentioned",
  cancel_policy:         "cancellation",
  legal_dispute:         "legal dispute",
  complaint:             "complaint",
  unknown:               "unclassified",
};

const TIER_LABELS: Record<string, string> = {
  "1": "Tier 1 · Autonomous",
  "2": "Tier 2 · Approval",
  "3": "Tier 3 · Escalated",
};

const FILTER_GROUPS: { id: string; label: string; types: string[] }[] = [
  { id: "all",          label: "All",          types: [] },
  { id: "renewals",     label: "Renewals",     types: ["renewal_email","renewal_sms","renewal_intent_classified","renewal_stage_transition","renewal_halted","approval_queued","escalation","silence_detected"] },
  { id: "doc_chase",    label: "Doc Chase",    types: ["doc_chase_email","doc_chase_sms","doc_chase_escalated"] },
  { id: "coi",          label: "COI",          types: ["coi_generated"] },
  { id: "policy_check", label: "Policy Check", types: ["policy_check"] },
];

function actionLabel(a: HollisAction): string {
  const base = ACTION_TYPE_LABELS[a.action_type] ?? a.action_type;
  const p = a.payload as Record<string, unknown> | null;
  const m = a.metadata as Record<string, unknown> | null;

  if (a.action_type === "renewal_email" || a.action_type === "renewal_sms") {
    // Distinguish: campaign threshold draft vs autonomous send
    const tmpl = (p?.template_used as string | undefined) ?? (m?.touchpoint_type as string | undefined);
    const tmplLabel = tmpl ? (TEMPLATE_LABELS[tmpl] ?? tmpl) : null;
    if (a.tier === "2") {
      return tmplLabel ? `Draft prepared · ${tmplLabel}` : "Draft prepared · deadline";
    }
    if (a.tier === "1") {
      return tmplLabel ? `Sent · ${tmplLabel}` : base;
    }
    return a.tier ? `${base} · ${TIER_LABELS[a.tier] ?? `Tier ${a.tier}`}` : base;
  }
  if (a.action_type === "approval_queued") {
    // Inbound client reply that was drafted and queued for review
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
    return prev && next ? `${base} · ${prev} → ${next}` : base;
  }
  return base;
}

function isLive(a: HollisAction): boolean {
  return Date.now() - new Date(a.created_at).getTime() < 60_000;
}

function isEscalated(a: HollisAction): boolean {
  return a.outcome === "escalated" || a.tier === "3";
}

function circleStyle(a: HollisAction): { fill: string; border: string } {
  if (isEscalated(a) || a.outcome === "failed") return { fill: "#7f1d1d", border: "#ef4444" };
  if (a.outcome === "queued")  return { fill: "#3f3f46", border: "#71717a" };
  return { fill: "#1a4a2e", border: "#00d4aa" };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true });
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

// ── Timeline circle ────────────────────────────────────────────────────────────

function Circle({ action }: { action: HollisAction }) {
  const { fill, border } = circleStyle(action);
  if (isLive(action)) {
    return (
      <span className="relative flex items-center justify-center shrink-0" style={{ width: 8, height: 8 }}>
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#00d4aa" }} />
        <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: "#00d4aa" }} />
      </span>
    );
  }
  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: 8, height: 8, background: fill, border: `1.5px solid ${border}` }}
    />
  );
}

// ── Outcome pill ───────────────────────────────────────────────────────────────

function OutcomePill({ outcome }: { outcome: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    sent:      { bg: "#0d2b1e", text: "#00d4aa", border: "#00d4aa33" },
    queued:    { bg: "#1c1c1c", text: "#71717a", border: "#3f3f46"   },
    escalated: { bg: "#2d0e0e", text: "#ef4444", border: "#ef444433" },
    failed:    { bg: "#2d0e0e", text: "#ef4444", border: "#ef444433" },
    halted:    { bg: "#1c1c1c", text: "#71717a", border: "#3f3f46"   },
    classified:{ bg: "#1c1c1c", text: "#a1a1aa", border: "#3f3f46"   },
  };
  const c = colors[outcome] ?? { bg: "#1c1c1c", text: "#a1a1aa", border: "#3f3f46" };
  return (
    <span
      className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {outcome}
    </span>
  );
}

// ── Tier badge ─────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span style={{ color: "#52525b" }}>—</span>;
  const c =
    tier === "3" ? { bg: "#2d0e0e", text: "#ef4444", border: "#ef444433" } :
    tier === "2" ? { bg: "#1c1c1c", text: "#a1a1aa", border: "#3f3f46"   } :
                   { bg: "#0d2b1e", text: "#00d4aa", border: "#00d4aa33" };
  return (
    <span
      className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {TIER_LABELS[tier] ?? `Tier ${tier}`}
    </span>
  );
}

// ── System log ─────────────────────────────────────────────────────────────────

function SystemLog({ action }: { action: HollisAction }) {
  const clientName = (action.policies?.client_name ?? action.clients?.name ?? "UNKNOWN").toUpperCase().replace(/\s+/g, "_");
  const lines: { time: string; label: string; value: string; colour?: string }[] = [
    { time: isoToHMS(action.created_at, 0), label: "INIT",    value: action.action_type.toUpperCase() },
    { time: isoToHMS(action.created_at, 1), label: "CLIENT",  value: clientName },
    { time: isoToHMS(action.created_at, 2), label: "TIER",    value: `${action.tier ?? "—"} · ${action.outcome.toUpperCase()}`,
      colour: isEscalated(action) ? "#ef4444" : undefined },
    { time: isoToHMS(action.created_at, 3), label: "TRIGGER", value: action.trigger_reason.slice(0, 80) },
    {
      time: isoToHMS(action.created_at, 4),
      label: action.outcome === "sent" ? "SUCCESS" : action.outcome === "failed" ? "FAILURE" : "STATUS",
      value: action.outcome.toUpperCase(),
      colour: action.outcome === "sent" ? "#00d4aa" : action.outcome === "failed" ? "#ef4444" : undefined,
    },
  ];

  return (
    <div
      className="font-mono text-[12px] leading-[1.8]"
      style={{ background: "#000", border: "1px solid #27272a", borderRadius: 4, padding: "12px 16px" }}
    >
      {lines.map((l, i) => (
        <div key={i} className="flex gap-3">
          <span style={{ color: "#3f3f46", flexShrink: 0 }}>{l.time}</span>
          <span style={{ color: l.colour ?? "#71717a" }}>
            <span style={{ color: l.colour ?? "#52525b" }}>{l.label}:</span>{" "}
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Inspector ──────────────────────────────────────────────────────────────────

function Inspector({
  action,
  onArchive,
}: {
  action: HollisAction | null;
  onArchive: (id: string) => void;
}) {
  const { toast } = useToast();

  if (!action) {
    return (
      <div className="flex items-center justify-center h-full">
        <span style={{ color: "#52525b", fontSize: 13 }}>Select an action to inspect.</span>
      </div>
    );
  }

  const p = action.payload as Record<string, unknown> | null;
  const m = action.metadata as Record<string, unknown> | null;
  const clientName     = action.policies?.client_name ?? action.clients?.name ?? "—";
  const policyRef      = action.policies?.policy_name ?? "—";
  const carrier        = (m?.carrier as string) ?? "—";
  const daysToExpiry   = m?.days_to_expiry != null ? String(m.days_to_expiry) : "—";
  const premium        = formatCurrency(m?.premium);
  const recipientEmail = (p?.recipient_email as string) ?? "—";
  const recipientName  = (p?.recipient_name  as string) ?? clientName;
  const subject        = p?.subject as string | undefined;
  const body           = p?.body   as string | undefined;
  const channel        = (p?.channel as string)?.toUpperCase() ?? "EMAIL";

  const entityFields: { label: string; value: React.ReactNode }[] = [
    { label: "Recipient",     value: clientName },
    { label: "Contact",       value: recipientEmail },
    { label: "Carrier",       value: carrier },
    { label: "Policy",        value: policyRef },
    { label: "Days to Expiry",value: daysToExpiry },
    { label: "Premium",       value: premium },
    { label: "Tier",          value: <TierBadge tier={action.tier} /> },
    { label: "Outcome",       value: <OutcomePill outcome={action.outcome} /> },
  ];

  return (
    <div className="relative flex flex-col h-full overflow-y-auto">
      {/* Top-right buttons */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        {action.archived ? (
          <span className="text-[12px]" style={{ color: "#52525b" }}>Archived</span>
        ) : (
          <button
            onClick={() => onArchive(action.id)}
            className="h-7 px-3 text-[12px] transition-colors rounded"
            style={{ border: "1px solid #3f3f46", color: "#a1a1aa", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#71717a")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#3f3f46")}
          >
            Archive
          </button>
        )}
      </div>

      {/* Section A — Reasoning */}
      <div className="px-6 pt-4 pb-5" style={{ borderBottom: "1px solid #27272a" }}>
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "#71717a", fontVariant: "small-caps" }}
        >
          Reasoning
        </div>
        <div
          className="font-mono text-[13px] leading-[1.6]"
          style={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 4, padding: "12px 16px", color: "#d4d4d8" }}
        >
          {action.trigger_reason}
        </div>
      </div>

      {/* Section B — Entity */}
      <div className="px-6 py-5" style={{ borderBottom: "1px solid #27272a" }}>
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "#71717a", fontVariant: "small-caps" }}
        >
          Entity
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {entityFields.map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: "#71717a", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#e4e4e7" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section C — Payload */}
      <div className="px-6 py-5" style={{ borderBottom: "1px solid #27272a" }}>
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "#71717a", fontVariant: "small-caps" }}
        >
          Payload
        </div>
        {body ? (
          <div
            style={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 4, overflow: "hidden" }}
          >
            {/* Header bar */}
            <div
              className="flex items-start justify-between gap-4 px-4 py-3"
              style={{ background: "#18181b", borderBottom: "1px solid #27272a" }}
            >
              <div className="min-w-0">
                {subject && (
                  <div
                    className="font-display text-[14px] text-white truncate mb-0.5"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {subject}
                  </div>
                )}
                <div className="text-[12px]" style={{ color: "#71717a" }}>
                  {recipientName} · {recipientEmail}
                </div>
              </div>
              <span
                className="shrink-0 text-[10px] uppercase tracking-wider px-2 py-1 rounded font-mono"
                style={{ border: "1px solid #3f3f46", color: "#a1a1aa" }}
              >
                {channel}
              </span>
            </div>
            {/* Body */}
            <div
              className="text-[13px] leading-[1.7] whitespace-pre-wrap"
              style={{ padding: "16px", color: "#d4d4d8" }}
            >
              {body}
            </div>
          </div>
        ) : (
          <span className="text-[13px] italic" style={{ color: "#52525b" }}>
            No message payload for this action type.
          </span>
        )}
      </div>

      {/* Section D — System Log */}
      <div className="px-6 py-5">
        <div
          className="uppercase tracking-widest mb-3"
          style={{ fontSize: 11, color: "#71717a", fontVariant: "small-caps" }}
        >
          System Log
        </div>
        <SystemLog action={action} />
      </div>
    </div>
  );
}

// ── Left column event row ──────────────────────────────────────────────────────

function EventRow({
  action,
  selected,
  onClick,
}: {
  action: HollisAction;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="relative flex items-center gap-3 cursor-pointer transition-colors"
      style={{
        height: 56,
        paddingLeft: 16,
        paddingRight: 16,
        borderLeft: selected ? "2px solid #ffffff" : "2px solid transparent",
        background: selected ? "#18181b" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "rgba(24,24,27,0.5)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Timeline circle (the vertical line is drawn via the parent) */}
      <Circle action={action} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate" style={{ color: "#fafafa" }}>
          {action.policies?.client_name ?? action.clients?.name ?? "Unknown client"}
        </div>
        <div className="text-[12px] truncate" style={{ color: "#71717a" }}>
          {actionLabel(action)}
        </div>
      </div>

      {/* Timestamp */}
      <div className="shrink-0 text-[11px]" style={{ color: "#52525b" }}>
        {formatTime(action.created_at)}
      </div>
    </div>
  );
}

// ── Date group ─────────────────────────────────────────────────────────────────

function DateGroup({
  dateKey,
  actions,
  selectedId,
  onSelect,
}: {
  dateKey: string;
  actions: HollisAction[];
  selectedId: string | null;
  onSelect: (a: HollisAction) => void;
}) {
  const issues = actions.filter(isEscalated).length;

  return (
    <div>
      {/* Date header */}
      <div className="px-4 pt-5 pb-2">
        <div
          className="font-display text-[16px] font-black leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "#fafafa" }}
        >
          {formatDateHeader(dateKey)}
        </div>
        <div
          className="uppercase tracking-widest mt-0.5"
          style={{ fontSize: 11, color: "#71717a", fontVariant: "small-caps" }}
        >
          {actions.length} action{actions.length !== 1 ? "s" : ""} taken
          {issues > 0 && ` · ${issues} issue${issues !== 1 ? "s" : ""} flagged`}
        </div>
      </div>

      {/* Rows wrapped in a relative container for the vertical timeline thread */}
      <div className="relative">
        {/* Continuous vertical line */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: 20, width: 1, background: "#27272a" }}
        />
        {actions.map((a) => (
          <EventRow
            key={a.id}
            action={a}
            selected={selectedId === a.id}
            onClick={() => onSelect(a)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HistoryPanel() {
  const { toast } = useToast();

  const [actions,    setActions]    = useState<HollisAction[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<HollisAction | null>(null);
  const [filterGroup,setFilterGroup]= useState("all");
  const [search,     setSearch]     = useState("");

  // Infinite scroll
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 50;
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/hollis-actions")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setActions(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setPage((p) => p + 1); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);

  const handleArchive = useCallback(async (id: string) => {
    const res = await fetch(`/api/hollis-actions/${id}/archive`, { method: "PATCH" });
    if (res.ok) {
      setActions((prev) => prev.map((a) => a.id === id ? { ...a, archived: true } : a));
      setSelected((prev) => prev?.id === id ? { ...prev, archived: true } : prev);
      toast("Action archived.", "success");
    } else {
      toast("Failed to archive action.", "error");
    }
  }, [toast]);

  // ── Filter + search ──
  const filtered = actions.filter((a) => {
    if (filterGroup !== "all") {
      const grp = FILTER_GROUPS.find((g) => g.id === filterGroup);
      if (grp && !grp.types.includes(a.action_type)) return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const clientMatch  = (a.policies?.client_name ?? a.clients?.name ?? "").toLowerCase().includes(q);
      const policyMatch  = (a.policies?.policy_name ?? "").toLowerCase().includes(q);
      if (!clientMatch && !policyMatch) return false;
    }
    return true;
  });

  // ── Group by date ──
  const grouped: { dateKey: string; actions: HollisAction[] }[] = [];
  for (const a of filtered) {
    const dk = toDateKey(a.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.dateKey === dk) {
      last.actions.push(a);
    } else {
      grouped.push({ dateKey: dk, actions: [a] });
    }
  }

  // Paginate groups (flatten first, then slice)
  const visibleActions = filtered.slice(0, page * PAGE_SIZE);
  const visibleGrouped: { dateKey: string; actions: HollisAction[] }[] = [];
  for (const a of visibleActions) {
    const dk = toDateKey(a.created_at);
    const last = visibleGrouped[visibleGrouped.length - 1];
    if (last && last.dateKey === dk) {
      last.actions.push(a);
    } else {
      visibleGrouped.push({ dateKey: dk, actions: [a] });
    }
  }

  const hasMore = visibleActions.length < filtered.length;

  // ── Mobile: show inspector or list ──
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  function selectAction(a: HollisAction) {
    setSelected(a);
    setMobileView("detail");
  }

  // ── Empty state ──
  if (!loading && actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div
          className="font-display italic text-[20px] mb-3"
          style={{ fontFamily: "var(--font-display)", color: "#71717a" }}
        >
          Hollis hasn&apos;t taken any automated actions yet.
        </div>
        <div style={{ fontSize: 13, color: "#52525b", lineHeight: 1.6, maxWidth: 380 }}>
          Actions will appear here as your renewals, document chasing, and COI workflows run.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#000", color: "#fafafa" }}>

      {/* ── Filter bar ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4"
        style={{ height: 48, borderBottom: "1px solid #27272a", background: "#000" }}
      >
        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {FILTER_GROUPS.map((g) => {
            const active = filterGroup === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setFilterGroup(g.id)}
                className="px-3 py-1 text-[12px] rounded transition-colors"
                style={{
                  background: active ? "#27272a" : "transparent",
                  color:      active ? "#fafafa"  : "#71717a",
                  border:     "none",
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients or policies..."
          className="bg-transparent outline-none text-[13px]"
          style={{
            color: "#a1a1aa",
            width: 240,
            borderBottom: "1px solid #3f3f46",
            paddingBottom: 2,
          }}
        />
      </div>

      {/* ── Split panel ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left column ── */}
        <div
          className={`flex flex-col shrink-0 overflow-y-auto ${mobileView === "detail" ? "hidden md:flex" : "flex"}`}
          style={{ width: "30%", borderRight: "1px solid #27272a" }}
        >
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            </div>
          ) : visibleGrouped.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-[13px]" style={{ color: "#52525b" }}>
              No actions match your filter.
            </div>
          ) : (
            <>
              {visibleGrouped.map(({ dateKey, actions: grpActions }) => (
                <DateGroup
                  key={dateKey}
                  dateKey={dateKey}
                  actions={grpActions}
                  selectedId={selected?.id ?? null}
                  onSelect={selectAction}
                />
              ))}
              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={loaderRef} className="flex items-center justify-center py-6">
                  <div className="w-4 h-4 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right column ── */}
        <div
          className={`flex-1 min-w-0 ${mobileView === "list" ? "hidden md:block" : "block"}`}
          style={{ position: "relative" }}
        >
          {/* Mobile back button */}
          {mobileView === "detail" && (
            <button
              onClick={() => setMobileView("list")}
              className="md:hidden flex items-center gap-2 px-4 py-3 text-[13px]"
              style={{ color: "#71717a", borderBottom: "1px solid #27272a", width: "100%" }}
            >
              ← Back
            </button>
          )}
          <Inspector action={selected} onArchive={handleArchive} />
        </div>
      </div>
    </div>
  );
}
