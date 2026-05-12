"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Loader2,
  ChevronLeft,
  ArrowUpRight,
  Send,
  FileText,
  Paperclip,
  ExternalLink,
  Download,
  Maximize2,
  X,
} from "lucide-react";
import { LEARNING_MODE_THRESHOLD } from "@/lib/agent/tier-constants";
import type { InboxItem, DocChaseReplyItem } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

function intentLabel(intent: string): string {
  return intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseDescription(desc: string): { title: string; flagPills: string[] } {
  const flaggedSplit = desc.split(/\.\s+(?=Flagged:)/);
  const title = flaggedSplit[0].replace(/\.$/, "").trim();
  if (flaggedSplit.length < 2) return { title, flagPills: [] };
  const flagPills = flaggedSplit[1]
    .split(/\.\s+/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);
  return { title, flagPills };
}

function isDocChaseReply(i: InboxItem): boolean {
  return !!i.doc_chase_request_id || i.proposed_action?.action_type === "close_doc_chase";
}

function isTodoItem(i: InboxItem): boolean {
  const TODO_INTENTS = ["confirm_renewal", "soft_query"];
  return (
    !isDocChaseReply(i) &&
    (i.proposed_action?.action_type === "broker_change_required" ||
      TODO_INTENTS.includes(i.classified_intent))
  );
}

type ItemType = "decision" | "escalation" | "todo" | "docchase";

function deriveType(item: InboxItem): ItemType {
  if (isDocChaseReply(item)) return "docchase";
  if (isTodoItem(item))      return "todo";
  if (item.tier === 3)       return "escalation";
  return "decision";
}

function confidenceColors(score: number) {
  if (score >= 0.85)
    return { bg: "rgba(22,163,74,0.10)",  fg: "#4ade80", bd: "rgba(22,163,74,0.20)"  };
  if (score >= 0.60)
    return { bg: "rgba(245,158,11,0.10)", fg: "#fbbf24", bd: "rgba(245,158,11,0.20)" };
  return   { bg: "rgba(220,38,38,0.10)",  fg: "#f87171", bd: "rgba(220,38,38,0.20)"  };
}

// ── Type pill ─────────────────────────────────────────────────────────────────

const PILL: Record<ItemType, { bg: string; fg: string; label: string }> = {
  decision:   { bg: "color-mix(in oklch, oklch(0.60 0.12 245) 18%, var(--background))", fg: "oklch(0.42 0.13 245)", label: "Decision"   },
  escalation: { bg: "rgba(220,38,38,0.10)",                                              fg: "#f87171",             label: "Escalation" },
  docchase:   { bg: "color-mix(in oklch, oklch(0.60 0.10 150) 18%, var(--background))", fg: "oklch(0.40 0.10 150)", label: "Doc chase"  },
  todo:       { bg: "color-mix(in oklch, oklch(0.70 0.12 75)  22%, var(--background))", fg: "oklch(0.42 0.10 65)",  label: "To-do"      },
};

function TypePill({ type }: { type: ItemType }) {
  const s = PILL[type];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 999,
        background: s.bg, color: s.fg,
        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function FlagPill({ text }: { text: string }) {
  // "Flagged: X" → strip the "Flagged: " prefix for display
  const label = text.replace(/^Flagged:\s*/i, "");
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "3px 10px", borderRadius: 999,
        background: "rgba(245,158,11,0.10)",
        color: "oklch(0.50 0.13 75)",
        border: "1px solid rgba(245,158,11,0.22)",
        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}



// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
      <span
        style={{
          fontSize: 10.5, fontWeight: 600,
          letterSpacing: "0.1em", textTransform: "uppercase",
          color: color ?? "var(--text-tertiary)", whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

type Filter = "all" | "decision" | "todo" | "docchase";

function FilterTab({
  active, label, count, onClick,
}: {
  active: boolean; label: string; count: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "10px 0",
        background: "transparent", border: "none",
        borderBottom: `1.5px solid ${active ? "var(--text-primary)" : "transparent"}`,
        marginBottom: -1,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        transition: "color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      )}
    </button>
  );
}

interface DisplayRow {
  id:           string;
  kind:         "inbox" | "docchase";
  type:         ItemType;
  isLearningMode: boolean;
  client:       string;
  headline:     string;
  flagPills:    string[];
  expiryDays:   number | null;
  timeAgoStr:   string;
  hasAttachment: boolean;
  inboxItem?:   InboxItem;
  dcItem?:      DocChaseReplyItem;
}

function toDisplayRow(item: InboxItem): DisplayRow {
  const rawDesc = item.proposed_action?.description ?? intentLabel(item.classified_intent);
  const { title, flagPills } = parseDescription(rawDesc);
  const flagReason = item.proposed_action?.payload?.flag_reason as string | undefined;
  const isLearning = typeof flagReason === "string" && flagReason.toLowerCase().includes("learning");
  return {
    id:           item.id,
    kind:         "inbox",
    type:         deriveType(item),
    isLearningMode: isLearning,
    client:       item.policies?.client_name ?? "Unknown Client",
    headline:     title,
    flagPills,
    expiryDays:   item.policies ? daysUntil(item.policies.expiration_date) : null,
    timeAgoStr:   timeAgo(item.created_at),
    hasAttachment: typeof item.proposed_action?.payload?.attachment_path === "string",
    inboxItem:    item,
  };
}

function dcToDisplayRow(item: DocChaseReplyItem): DisplayRow {
  return {
    id:           item.id,
    kind:         "docchase",
    type:         "docchase",
    isLearningMode: false,
    client:       item.client_name,
    headline:     item.document_type,
    flagPills:    [],
    expiryDays:   null,
    timeAgoStr:   timeAgo(item.last_client_reply_at ?? item.created_at),
    hasAttachment: Boolean(item.received_attachment_path),
    dcItem:       item,
  };
}

function ListRow({
  row, onOpen, unread,
}: {
  row: DisplayRow; onOpen: (r: DisplayRow) => void; unread: boolean;
}) {
  const isUrgent = row.expiryDays !== null && row.expiryDays <= 7;
  const isEscalation = row.type === "escalation";
  return (
    <button
      onClick={() => onOpen(row)}
      style={{
        width: "100%", textAlign: "left", border: "none",
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, auto) auto auto",
        columnGap: 12, alignItems: "center",
        padding: "13px 32px 13px 25px",
        background: isEscalation ? "rgba(220,38,38,0.04)" : "transparent",
        borderTop: "1px solid var(--border-subtle)",
        borderLeft: isEscalation ? "3px solid var(--danger)" : "3px solid transparent",
        cursor: "pointer", transition: "background 100ms",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isEscalation ? "rgba(220,38,38,0.08)" : "var(--surface)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isEscalation ? "rgba(220,38,38,0.04)" : "transparent"; }}
    >
      {/* Unread dot */}
      <div style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: unread ? "#3b82f6" : "transparent", marginRight: 2 }} />

      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          style={{
            fontSize: 13.5, fontWeight: unread ? 700 : 600, color: unread ? "var(--text-primary)" : "var(--text-secondary)",
            letterSpacing: "-0.005em", whiteSpace: "nowrap", flexShrink: 0,
            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {row.client}
        </span>
        <span
          style={{
            fontSize: 13.5, color: unread ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: unread ? 600 : 400,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: "-0.003em", flex: 1, minWidth: 0,
          }}
        >
          {row.headline}
        </span>
      </div>

      {/* Expiry — sits between headline end and pills */}
      {row.expiryDays !== null && (
        <span
          style={{
            color: isUrgent ? "var(--danger)" : "var(--text-tertiary)",
            fontWeight: isUrgent ? 600 : 500,
            fontSize: 12, fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap", textAlign: "right",
          }}
        >
          {row.expiryDays}d to expiry
        </span>
      )}
      {row.expiryDays === null && <span />}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {row.hasAttachment && <Paperclip size={12} style={{ color: "var(--text-tertiary)" }} />}
        <TypePill type={row.type} />
      </div>

      <span
        style={{
          fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)",
          minWidth: 32, textAlign: "right",
        }}
      >
        {row.timeAgoStr}
      </span>
    </button>
  );
}

function ListView({
  allItems,
  docChaseReplies,
  onOpen,
  readIds,
  onRead,
}: {
  allItems: InboxItem[];
  docChaseReplies: DocChaseReplyItem[];
  onOpen: (r: DisplayRow) => void;
  readIds: Set<string>;
  onRead: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const allRows: DisplayRow[] = [
    ...allItems.map(toDisplayRow),
    ...docChaseReplies.map(dcToDisplayRow),
  ]
    .sort((a, b) => {
      const aTime = a.inboxItem?.created_at ?? a.dcItem?.created_at ?? "";
      const bTime = b.inboxItem?.created_at ?? b.dcItem?.created_at ?? "";
      return bTime.localeCompare(aTime);
    });

  const filtered =
    filter === "all"      ? allRows :
    filter === "decision" ? allRows.filter((r) => r.type === "decision" || r.type === "escalation") :
                            allRows.filter((r) => r.type === filter);

  const counts = {
    all:      allRows.length,
    decision: allRows.filter((r) => r.type === "decision" || r.type === "escalation").length,
    todo:     allRows.filter((r) => r.type === "todo").length,
    docchase: allRows.filter((r) => r.type === "docchase").length,
  };

  function handleOpen(row: DisplayRow) {
    onRead(row.id);
    onOpen(row);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "28px 32px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.022em" }}>
            Inbox
          </h1>
          <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            From Hollis ·{" "}
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
          <FilterTab active={filter === "all"}      label="All"       count={counts.all}      onClick={() => setFilter("all")} />
          <FilterTab active={filter === "decision"} label="Decisions" count={counts.decision} onClick={() => setFilter("decision")} />
          <FilterTab active={filter === "todo"}     label="To-Dos"    count={counts.todo}     onClick={() => setFilter("todo")} />
          <FilterTab active={filter === "docchase"} label="Doc Chase" count={counts.docchase} onClick={() => setFilter("docchase")} />
        </div>
      </header>

      <div style={{ flex: 1, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "60px 32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Nothing here — Hollis is watching the rest in the background.
          </div>
        ) : (
          filtered.map((row) => (
            <ListRow
              key={row.id}
              row={row}
              onOpen={handleOpen}
              unread={!readIds.has(row.id)}
            />
          ))
        )}
        <div style={{ padding: "40px 32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
          That&apos;s everything. Hollis is watching the rest in the background.
        </div>
      </div>
    </div>
  );
}

// ── Detail shell ──────────────────────────────────────────────────────────────

function LearningStatusBadge({ approved, threshold }: { approved: number; threshold: number }) {
  const pct = Math.min(approved / threshold, 1);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 999,
        background: "rgba(59,130,246,0.10)",
        color: "#3b82f6",
        border: "1px solid rgba(59,130,246,0.22)",
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ width: 28, height: 4, borderRadius: 999, background: "rgba(59,130,246,0.15)", overflow: "hidden", flexShrink: 0 }}>
        <span style={{ display: "block", height: "100%", width: `${pct * 100}%`, borderRadius: 999, background: "#3b82f6", transition: "width 300ms ease" }} />
      </span>
      {approved} of {threshold} approvals
    </span>
  );
}

function DetailHeader({ row, onBack, learningApproved, learningThreshold }: { row: DisplayRow; onBack: () => void; learningApproved?: number; learningThreshold?: number }) {
  const isUrgent = row.expiryDays !== null && row.expiryDays <= 7;
  const policyRef = row.inboxItem?.policies?.policy_name?.match(/\bPOL-\d{4}-\d{4}\b/i)?.[0] ?? null;

  return (
    <header style={{ padding: "14px 28px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 14, flexShrink: 0, height: 56 }}>
      <button
        onClick={onBack}
        style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px 6px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
      >
        <ChevronLeft size={14} />
        Inbox
      </button>

      <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
      <TypePill type={row.type} />

      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {row.client}
      </span>

      {policyRef && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {policyRef}
        </span>
      )}

      {row.isLearningMode && learningApproved !== undefined && (
        <LearningStatusBadge approved={learningApproved} threshold={learningThreshold ?? 20} />
      )}

      <span style={{ flex: 1 }} />

      {row.expiryDays !== null && (
        <span style={{ fontSize: 12, fontWeight: 500, color: isUrgent ? "var(--danger)" : "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {row.expiryDays}d to expiry
        </span>
      )}

      {row.inboxItem?.policies && (
        <Link
          href={`/renewals/${row.inboxItem.policies.id}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, textDecoration: "none" }}
        >
          Open policy <ArrowUpRight size={11} />
        </Link>
      )}
    </header>
  );
}

function DetailShell({
  row, onBack, children, actionBar,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; onBack: () => void; children: React.ReactNode; actionBar?: React.ReactNode;
  learningApproved?: number; learningThreshold?: number;
}) {
  const policy = row.inboxItem?.policies;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <DetailHeader row={row} onBack={onBack} learningApproved={learningApproved} learningThreshold={learningThreshold} />

      <div style={{ padding: "32px 28px 8px", flexShrink: 0, maxWidth: 820, margin: "0 auto", width: "100%" }}>
        {policy && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
              {policy.policy_name}
            </span>
            {policy.carrier && (
              <>
                <span style={{ color: "var(--text-tertiary)" }}>·</span>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{policy.carrier}</span>
              </>
            )}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.022em", lineHeight: 1.3 }}>
          {row.headline}
        </h1>
        {row.flagPills.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {row.flagPills.map((pill, i) => <FlagPill key={i} text={pill} />)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 24 }}>
          {children}
        </div>
      </div>

      {actionBar && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 28px", flexShrink: 0 }}>
          <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            {actionBar}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline attachment card (clickable preview) ─────────────────────────────────

interface AttachmentCardProps {
  filename: string | null;
  mimeType: string | null;
  signedUrl: string | null;
  loading: boolean;
  error: string | null;
  onOpenFullscreen: () => void;
  size?: "sm" | "md";
}

function AttachmentCard({ filename, mimeType, signedUrl, loading, error, onOpenFullscreen, size = "md" }: AttachmentCardProps) {
  const isPdf   = mimeType?.startsWith("application/pdf") ?? false;
  const isImage = mimeType?.startsWith("image/") ?? false;
  const iconSize = size === "sm" ? 11 : 12;
  const cardPadding = size === "sm" ? "6px 10px" : "8px 12px";
  const iconBoxSize = size === "sm" ? 18 : 22;
  const fontSize = size === "sm" ? 11.5 : 12.5;

  return (
    <div
      onClick={signedUrl ? onOpenFullscreen : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: cardPadding,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        fontSize,
        color: "var(--text-secondary)",
        cursor: signedUrl ? "pointer" : "default",
        transition: "border-color 120ms, box-shadow 120ms",
        marginTop: 4,
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        if (!signedUrl) return;
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      <span style={{
        width: iconBoxSize, height: iconBoxSize, borderRadius: 5,
        background: "var(--surface)",
        color: "var(--text-tertiary)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <FileText size={iconSize} />
      </span>
      <span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{filename ?? "Attachment"}</span>
        {mimeType && (
          <>
            <span style={{ color: "var(--text-tertiary)", margin: "0 5px" }}>·</span>
            <span style={{ color: "var(--text-tertiary)" }}>{isPdf ? "PDF" : isImage ? "Image" : "File"}</span>
          </>
        )}
      </span>
      {loading && <Loader2 size={iconSize - 1} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />}
      {error   && <span style={{ fontSize: 10.5, color: "#f87171" }}>{error}</span>}
      {signedUrl && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 2, color: "var(--accent)", fontSize: size === "sm" ? 10.5 : 11 }}>
          <Maximize2 size={iconSize - 1} />
          View
        </span>
      )}
    </div>
  );
}

// ── Client bubble (right) ─────────────────────────────────────────────────────

interface ClientBubbleProps {
  name: string;
  text: string;
  attachmentCard?: import("react").ReactNode;
}

function ClientBubble({ name, text, attachmentCard }: ClientBubbleProps) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, background: "var(--border)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, border: "1px solid var(--border-subtle)" }}>
        {name[0].toUpperCase()}
      </div>
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, padding: "0 4px", flexDirection: "row-reverse" }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{name}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, letterSpacing: "-0.003em", padding: "10px 14px", borderRadius: 12, borderTopRightRadius: 4, background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
          {text}
        </div>
        {attachmentCard}
      </div>
    </div>
  );
}

// ── Decision / escalation detail ──────────────────────────────────────────────

function DecisionDetail({
  row, item, onBack, busy, sent, sentAction,
  isEditing, editedBody, errorMsg,
  onApprove, onReject, onEdit, onEditedBodyChange, onConfirmEdit, onCancelEdit,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; item: InboxItem; onBack: () => void;
  busy: boolean; sent: boolean; sentAction: "approved" | "rejected" | "edited" | null;
  isEditing: boolean; editedBody: string; errorMsg: string | null;
  onApprove: () => void; onReject: () => void; onEdit: () => void;
  onEditedBodyChange: (v: string) => void; onConfirmEdit: () => void; onCancelEdit: () => void;
  learningApproved?: number; learningThreshold?: number;
}) {
  const conf = confidenceColors(item.confidence_score);
  const draftBody    = typeof item.proposed_action?.payload?.body    === "string" ? item.proposed_action.payload.body    : null;
  const draftSubject = typeof item.proposed_action?.payload?.subject === "string" ? item.proposed_action.payload.subject : intentLabel(item.classified_intent);
  const recipientEmail = typeof item.proposed_action?.payload?.to   === "string" ? item.proposed_action.payload.to      : item.policies?.client_name ?? "client";

  // ── Attachment state ──────────────────────────────────────────────────────────
  const attachmentPath     = typeof item.proposed_action?.payload?.attachment_path         === "string" ? item.proposed_action.payload.attachment_path         : null;
  const attachmentFilename = typeof item.proposed_action?.payload?.attachment_filename     === "string" ? item.proposed_action.payload.attachment_filename     : null;
  const attachmentMime     = typeof item.proposed_action?.payload?.attachment_content_type === "string" ? item.proposed_action.payload.attachment_content_type : null;
  const hasAttachment = Boolean(attachmentPath);
  const isPdf   = attachmentMime?.startsWith("application/pdf") ?? false;
  const isImage = attachmentMime?.startsWith("image/") ?? false;

  const [attachSignedUrl, setAttachSignedUrl] = useState<string | null>(null);
  const [attachLoading,   setAttachLoading]   = useState(false);
  const [attachError,     setAttachError]     = useState<string | null>(null);
  const [attachFullscreen, setAttachFullscreen] = useState(false);

  useEffect(() => {
    if (!hasAttachment) return;
    setAttachLoading(true); setAttachError(null);
    fetch(`/api/agent/review/${item.id}/attachment`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load document");
        const d = await r.json();
        setAttachSignedUrl(d.signedUrl);
      })
      .catch(() => setAttachError("Failed to load document"))
      .finally(() => setAttachLoading(false));
  }, [item.id, hasAttachment]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setAttachFullscreen(false); }
    if (attachFullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachFullscreen]);

  const actionBar = sent ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: sentAction === "rejected" ? "rgba(220,38,38,0.12)" : "rgba(26,25,23,0.10)", color: sentAction === "rejected" ? "var(--danger)" : "var(--text-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {sentAction === "rejected" ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
        {sentAction === "rejected" ? "Rejected." : sentAction === "edited" ? "Edits saved & approved." : "Approved."}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
        {sentAction === "rejected"
          ? `No outreach sent to ${item.policies?.client_name ?? "client"}.`
          : `Hollis is dispatching to ${item.policies?.client_name ?? "client"}.`}
      </span>
    </div>
  ) : isEditing ? (
    <>
      <button onClick={onConfirmEdit} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: busy ? 0.5 : 1 }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Save & approve
      </button>
      <button onClick={onCancelEdit} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
        Cancel
      </button>
    </>
  ) : (
    <>
      <button onClick={onApprove} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: busy ? 0.5 : 1 }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Approve & send
      </button>
      <button onClick={onEdit} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      >
        <Pencil size={12} /> Edit draft
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={onReject} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,41,41,0.4)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        <XCircle size={12} /> Reject
      </button>
    </>
  );

  return (
    <DetailShell
      row={row} onBack={onBack} actionBar={actionBar}
      learningApproved={row.isLearningMode ? learningApproved : undefined}
      learningThreshold={row.isLearningMode ? learningThreshold : undefined}
    >
      {item.tier === 3 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(220,38,38,0.07)",
          border: "1px solid rgba(220,38,38,0.22)",
        }}>
          <span style={{ color: "var(--danger)", fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>Tier 3 escalation — manual intervention required.</span>
            <span style={{ fontSize: 13, color: "rgba(220,38,38,0.75)", marginLeft: 6 }}>
              Hollis will not act on this automatically. Review and resolve it yourself.
            </span>
          </div>
        </div>
      )}
      {(item.signal_id !== null && item.raw_signal_snippet) && (
        <>
          <SectionDivider label="Conversation" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {item.raw_signal_snippet && (
              <ClientBubble
                name={item.policies?.client_name ?? "Client"}
                text={item.raw_signal_snippet}
                attachmentCard={hasAttachment ? (
                  <AttachmentCard
                    filename={attachmentFilename}
                    mimeType={attachmentMime}
                    signedUrl={attachSignedUrl}
                    loading={attachLoading}
                    error={attachError}
                    onOpenFullscreen={() => setAttachFullscreen(true)}
                    size="sm"
                  />
                ) : undefined}
              />
            )}
            {item.proposed_action?.description && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "2px 12px", color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.6 }}>
                <span style={{ marginTop: 3, flexShrink: 0 }}>✦</span>
                <span style={{ flex: 1 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Hollis</span>
                  <span style={{ margin: "0 6px" }}>·</span>
                  <span>{item.proposed_action.description}</span>
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <SectionDivider label="Hollis reasoning" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.65 }}>
        <span style={{ marginTop: 3, flexShrink: 0, color: "var(--text-tertiary)", fontSize: 13 }}>✦</span>
        {item.confidence_score == null ? (
          <div style={{ flex: 1 }}>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Hollis scheduled this outreach.</span>{" "}
            <span>This touchpoint was queued automatically by the renewal campaign — no inbound signal was received.</span>
          </div>
        ) : (
          <>
            <div style={{ flex: 1 }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Hollis reviewed this signal.</span>{" "}
              <span>{intentLabel(item.classified_intent)} detected with {Math.round(item.confidence_score * 100)}% confidence.</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, padding: "2px 8px", borderRadius: 999, background: conf.bg, color: conf.fg, border: `1px solid ${conf.bd}` }}>
              {Math.round(item.confidence_score * 100)}% conf.
            </span>
          </>
        )}
      </div>

      {draftBody && (
        <>
          <SectionDivider label="Outreach to send" color={PILL.decision.fg} />
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", fontSize: 12.5, color: "var(--text-tertiary)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PILL.decision.fg, fontWeight: 600 }}>
                <Send size={11} /> Ready to send
              </span>
              <span>·</span>
              <span>To <span style={{ color: "var(--text-secondary)" }}>{recipientEmail}</span></span>
              <span style={{ flex: 1 }} />
              <span>From Hollis on your behalf</span>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 16, color: "var(--text-primary)", fontWeight: 600, letterSpacing: "-0.01em" }}>
                {draftSubject}
              </div>
              {isEditing ? (
                <textarea
                  value={editedBody}
                  onChange={(e) => onEditedBodyChange(e.target.value)}
                  rows={9}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.65, fontFamily: "inherit", resize: "vertical", outline: "none", width: "100%" }}
                />
              ) : (
                <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap", letterSpacing: "-0.003em" }}>
                  {draftBody}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(204,41,41,0.06)", border: "1px solid rgba(204,41,41,0.2)", fontSize: 13, color: "var(--danger)" }}>
          {errorMsg}
        </div>
      )}

      {/* Fullscreen attachment overlay */}
      {attachFullscreen && attachSignedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{attachmentFilename ?? "Document"}</span>
            </div>
            <div className="flex items-center gap-3">
              <a href={attachSignedUrl} download={attachmentFilename ?? "attachment"} className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <Download size={14} /> Download
              </a>
              <a href={attachSignedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <ExternalLink size={14} /> Open in tab
              </a>
              <button onClick={() => setAttachFullscreen(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer" }}>
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {isPdf ? (
              <iframe src={attachSignedUrl} className="w-full h-full rounded-lg" style={{ border: "none" }} title={attachmentFilename ?? "Document"} />
            ) : isImage ? (
              <div className="w-full h-full flex items-center justify-center">
                <img src={attachSignedUrl} alt={attachmentFilename ?? "Document"} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </DetailShell>
  );
}

// ── Todo detail ───────────────────────────────────────────────────────────────

function TodoDetailView({
  row, item, onBack, busy, done, checked, onToggle, onComplete,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; item: InboxItem; onBack: () => void;
  busy: boolean; done: boolean; checked: Set<number>;
  onToggle: (idx: number) => void; onComplete: () => void;
  learningApproved?: number; learningThreshold?: number;
}) {
  const changes  = (item.proposed_action?.payload?.changes as string[] | undefined) ?? [];
  const allChecked = changes.length > 0 && checked.size === changes.length;

  // ── Attachment state (same pattern as DecisionDetail) ─────────────────────
  const attachmentPath     = typeof item.proposed_action?.payload?.attachment_path         === "string" ? item.proposed_action.payload.attachment_path         : null;
  const attachmentFilename = typeof item.proposed_action?.payload?.attachment_filename     === "string" ? item.proposed_action.payload.attachment_filename     : null;
  const attachmentMime     = typeof item.proposed_action?.payload?.attachment_content_type === "string" ? item.proposed_action.payload.attachment_content_type : null;
  const hasAttachment = Boolean(attachmentPath);

  const [attachSignedUrl,   setAttachSignedUrl]   = useState<string | null>(null);
  const [attachLoading,     setAttachLoading]     = useState(false);
  const [attachError,       setAttachError]       = useState<string | null>(null);
  const [attachFullscreen,  setAttachFullscreen]  = useState(false);

  useEffect(() => {
    if (!hasAttachment) return;
    setAttachLoading(true); setAttachError(null);
    fetch(`/api/agent/review/${item.id}/attachment`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load document");
        const d = await r.json();
        setAttachSignedUrl(d.signedUrl);
      })
      .catch(() => setAttachError("Failed to load document"))
      .finally(() => setAttachLoading(false));
  }, [item.id, hasAttachment]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setAttachFullscreen(false); }
    if (attachFullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachFullscreen]);

  const actionBar = done ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <CheckCircle2 size={14} style={{ color: "var(--text-primary)" }} />
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Done — renewal proceeding.</span>
    </div>
  ) : (
    <>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
        <span style={{ fontFamily: "var(--font-mono)", color: allChecked ? "var(--accent)" : "var(--text-secondary)" }}>
          {checked.size}/{changes.length}
        </span>{" "}done
      </span>
      <span style={{ flex: 1 }} />
      <button
        onClick={onComplete}
        disabled={!allChecked || busy}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: allChecked && !busy ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 500, background: allChecked ? "var(--accent)" : "var(--surface-raised)", color: allChecked ? "var(--text-inverse)" : "var(--text-tertiary)", border: `1px solid ${allChecked ? "var(--accent)" : "var(--border)"}`, transition: "all 140ms", opacity: busy ? 0.5 : 1 }}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Proceed with renewal
      </button>
    </>
  );

  return (
    <DetailShell
      row={row} onBack={onBack} actionBar={actionBar}
      learningApproved={row.isLearningMode ? learningApproved : undefined}
      learningThreshold={row.isLearningMode ? learningThreshold : undefined}
    >
      {(item.signal_id !== null && item.raw_signal_snippet) && (
        <>
          <SectionDivider label="Conversation" />
          <ClientBubble
            name={item.policies?.client_name ?? "Client"}
            text={item.raw_signal_snippet}
            attachmentCard={hasAttachment ? (
              <AttachmentCard
                filename={attachmentFilename}
                mimeType={attachmentMime}
                signedUrl={attachSignedUrl}
                loading={attachLoading}
                error={attachError}
                onOpenFullscreen={() => setAttachFullscreen(true)}
                size="sm"
              />
            ) : undefined}
          />
        </>
      )}

      {changes.length > 0 && (
        <>
          <SectionDivider label="Hollis is waiting on you" color={PILL.todo.fg} />
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, padding: "8px 20px", display: "flex", flexDirection: "column" }}>
            {changes.map((change, idx) => {
              const on = checked.has(idx);
              return (
                <button
                  key={idx}
                  onClick={() => onToggle(idx)}
                  style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", background: "transparent", border: "none", borderTop: idx > 0 ? "1px solid var(--border-subtle)" : "none", cursor: "pointer" }}
                >
                  <div style={{ flexShrink: 0, marginTop: 2, width: 16, height: 16, borderRadius: 4, background: on ? "var(--accent)" : "transparent", border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms" }}>
                    {on && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="var(--text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 14.5, lineHeight: 1.55, color: on ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: on ? "line-through" : "none", letterSpacing: "-0.003em" }}>
                    {change}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </DetailShell>
  );
}

// ── Doc Chase detail panel (preserved from original) ─────────────────────────

function DocChaseDetailPanel({
  item,
  onMarkReceived,
  onReplySent,
  onRejected,
}: {
  item: DocChaseReplyItem;
  onMarkReceived: (id: string) => void;
  onReplySent: (id: string) => void;
  onRejected: (id: string) => void;
}) {
  const [signedUrl,        setSignedUrl]        = useState<string | null>(null);
  const [urlLoading,       setUrlLoading]       = useState(false);
  const [urlError,         setUrlError]         = useState<string | null>(null);
  const [marking,         setMarking]          = useState(false);
  const [marked,           setMarked]           = useState(false);
  const [draftSubject,     setDraftSubject]     = useState(item.draft_reply_subject ?? "");
  const [draftBody,        setDraftBody]        = useState(item.draft_reply_body ?? "");
  const [sending,          setSending]          = useState(false);
  const [replySent,        setReplySent]        = useState(false);
  const [replyError,       setReplyError]       = useState<string | null>(null);
  const [validateError,    setValidateError]    = useState<string | null>(null);
  const [markError,        setMarkError]        = useState<string | null>(null);
  const [fullscreen,       setFullscreen]       = useState(false);
  const [validating,       setValidating]       = useState(false);
  const [validationResult, setValidationResult] = useState<{ verdict: string; summary: string; issues: string[] } | null>(null);
  const [refDocSuggestion, setRefDocSuggestion] = useState<{ clientId: string; storagePath: string; originalFilename: string; suggestedLabel: string } | null>(null);
  const [refDocAdded,      setRefDocAdded]      = useState(false);
  const [refDocBusy,       setRefDocBusy]       = useState(false);
  const [refDocError,      setRefDocError]      = useState<string | null>(null);
  const [isEditing,        setIsEditing]        = useState(false);
  const [rejecting,        setRejecting]        = useState(false);
  const [rejected,         setRejected]         = useState(false);
  const [rejectError,      setRejectError]      = useState<string | null>(null);
  const draftBodyRef = useRef<HTMLTextAreaElement>(null);

  const hasAttachment = Boolean(item.received_attachment_path);
  const isPdf  = item.received_attachment_content_type?.startsWith("application/pdf") ?? false;
  const isImage = item.received_attachment_content_type?.startsWith("image/") ?? false;
  const isReceived = item.status === "received" || marked;
  const hasDraft = Boolean(draftSubject || draftBody);
  const currentValidationStatus = validationResult?.verdict ?? item.validation_status;
  const canValidate = hasAttachment && !currentValidationStatus && !isReceived;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFullscreen(false); }
    if (fullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const fetchSignedUrl = useCallback(async () => {
    if (!hasAttachment) return;
    setUrlLoading(true); setUrlError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}/attachment`);
      if (!res.ok) throw new Error("Could not load document");
      const data = await res.json();
      setSignedUrl(data.signedUrl);
    } catch { setUrlError("Failed to load document"); }
    finally   { setUrlLoading(false); }
  }, [item.id, hasAttachment]);

  useEffect(() => {
    setSignedUrl(null); setUrlError(null); setMarked(false); setReplySent(false);
    setDraftSubject(item.draft_reply_subject ?? "");
    setDraftBody(item.draft_reply_body ?? "");
    setValidationResult(null); setRefDocSuggestion(null); setRefDocAdded(false); setRefDocError(null);
    fetchSignedUrl();
  }, [fetchSignedUrl, item.id, item.draft_reply_subject, item.draft_reply_body]);

  useEffect(() => {
    const el = draftBodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [draftBody]);

  async function handleMarkReceived() {
    setMarking(true); setMarkError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "received" }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to mark received"); }
      setMarked(true); onMarkReceived(item.id);
    } catch (err) { setMarkError(err instanceof Error ? err.message : "Failed to mark received"); }
    finally       { setMarking(false); }
  }

  async function handleSendReply() {
    setSending(true); setReplyError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}/send-reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: draftSubject, body: draftBody }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to send reply"); }
      setReplySent(true);
      await new Promise((r) => setTimeout(r, 900));
      onReplySent(item.id);
    } catch (err) { setReplyError(err instanceof Error ? err.message : "Failed to send reply"); }
    finally       { setSending(false); }
  }

  async function handleValidate() {
    setValidating(true); setValidateError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}/validate-stored`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Validation failed"); }
      const data = await res.json();
      setValidationResult({ verdict: data.verdict, summary: data.summary, issues: data.issues ?? [] });
      if (data.verdict === "pass") {
        setMarked(true); onMarkReceived(item.id);
        if (data.ref_doc_suggestion) setRefDocSuggestion({ clientId: data.ref_doc_suggestion.client_id, storagePath: data.ref_doc_suggestion.storage_path, originalFilename: data.ref_doc_suggestion.original_filename, suggestedLabel: data.ref_doc_suggestion.suggested_label });
      }
      if (data.draft_subject) setDraftSubject(data.draft_subject);
      if (data.draft_body)    setDraftBody(data.draft_body);
    } catch (err) { setValidateError(err instanceof Error ? err.message : "Validation failed"); }
    finally       { setValidating(false); }
  }

  async function handleAddToRefDocs() {
    if (!refDocSuggestion) return;
    setRefDocBusy(true); setRefDocError(null);
    try {
      const res = await fetch(`/api/clients/${refDocSuggestion.clientId}/reference-docs/from-suggestion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: refDocSuggestion.storagePath, original_filename: refDocSuggestion.originalFilename, suggested_label: refDocSuggestion.suggestedLabel }) });
      const data = await res.json();
      if (!res.ok) { setRefDocError(data.error ?? "Failed"); return; }
      setRefDocAdded(true);
    } catch { setRefDocError("Network error — please try again"); }
    finally  { setRefDocBusy(false); }
  }

  async function handleReject() {
    setRejecting(true); setRejectError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to reject"); }
      setRejected(true);
      await new Promise((r) => setTimeout(r, 900));
      onRejected(item.id);
    } catch (err) { setRejectError(err instanceof Error ? err.message : "Failed to reject"); }
    finally       { setRejecting(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const dcFg = PILL.docchase.fg;
  const decisionFg = PILL.decision.fg;

  const actionBar = replySent ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: "color-mix(in oklch, var(--accent) 22%, transparent)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Send size={10} strokeWidth={2.4} />
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Reply sent.</span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Hollis dispatched to {item.client_name}.</span>
    </div>
  ) : rejected ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: "rgba(220,38,38,0.12)", color: "var(--danger)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <XCircle size={11} />
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Rejected.</span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No reply sent to {item.client_name}.</span>
    </div>
  ) : isEditing ? (
    <>
      <button
        onClick={handleSendReply}
        disabled={sending || !draftBody.trim()}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: sending || !draftBody.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: sending || !draftBody.trim() ? 0.5 : 1 }}
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Save & send
      </button>
      <button
        onClick={() => { setIsEditing(false); setDraftSubject(item.draft_reply_subject ?? ""); setDraftBody(item.draft_reply_body ?? ""); }}
        disabled={sending}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
      >
        Cancel
      </button>
      {replyError && <span style={{ fontSize: 12, color: "#f87171", marginLeft: 8 }}>{replyError}</span>}
    </>
  ) : (
    <>
      <button
        onClick={handleSendReply}
        disabled={sending || !draftBody.trim()}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: sending || !draftBody.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: sending || !draftBody.trim() ? 0.4 : 1, transition: "opacity 120ms" }}
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Approve & send
      </button>
      <button
        onClick={() => setIsEditing(true)}
        disabled={sending}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      >
        <Pencil size={12} /> Edit draft
      </button>
      <span style={{ flex: 1 }} />
      <button
        onClick={handleReject}
        disabled={rejecting}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: rejecting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", opacity: rejecting ? 0.5 : 1 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,41,41,0.4)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        {rejecting ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
        Reject
      </button>
      {(rejectError || replyError || markError || validateError) && (
        <span style={{ fontSize: 12, color: "#f87171", marginLeft: 8 }}>
          {rejectError ?? replyError ?? markError ?? validateError}
        </span>
      )}
    </>
  );

  return (
    <>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Client reply */}
          <SectionDivider label="Client reply" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, padding: "0 4px", flexDirection: "row-reverse" }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{item.client_name}</span>
              {item.last_client_reply_at && <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{timeAgo(item.last_client_reply_at)}</span>}
            </div>
            <div style={{ maxWidth: "75%", fontSize: 14, lineHeight: 1.6, letterSpacing: "-0.003em", padding: "10px 14px", borderRadius: 12, borderTopRightRadius: 4, background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap" }}>
              {item.last_client_reply || <span style={{ fontStyle: "italic", color: "var(--text-tertiary)" }}>No message body — document attached.</span>}
            </div>
            {hasAttachment && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 4 }}>
                <AttachmentCard
                  filename={item.received_attachment_filename ?? null}
                  mimeType={item.received_attachment_content_type ?? null}
                  signedUrl={signedUrl}
                  loading={urlLoading}
                  error={urlError}
                  onOpenFullscreen={() => setFullscreen(true)}
                  size="md"
                />
              </div>
            )}
          </div>

          {/* Document check */}
          {hasAttachment && (
            <>
              <SectionDivider label="Document check" color={dcFg} />
              <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {!currentValidationStatus ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13.5, color: "var(--text-secondary)", flex: 1 }}>
                      {urlLoading ? "Loading attachment…" : "Hollis hasn't read the attachment yet."}
                    </span>
                    {canValidate && (
                      <button onClick={handleValidate} disabled={validating} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 7, cursor: validating ? "default" : "pointer", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", fontSize: 12.5, opacity: validating ? 0.6 : 1 }}>
                        {validating ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                        {validating ? "Validating…" : "Run check"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                        ...(currentValidationStatus === "pass"    ? { background: "rgba(22,163,74,0.10)",  color: "#4ade80", border: "1px solid rgba(22,163,74,0.20)"  } :
                            currentValidationStatus === "fail"    ? { background: "rgba(220,38,38,0.10)",  color: "#f87171", border: "1px solid rgba(220,38,38,0.20)"  } :
                                                                    { background: "rgba(245,158,11,0.10)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.20)" }),
                      }}>
                        {currentValidationStatus === "pass" ? <CheckCircle2 size={10} strokeWidth={2.4} /> : <XCircle size={10} strokeWidth={2.4} />}
                        {currentValidationStatus.charAt(0).toUpperCase() + currentValidationStatus.slice(1)}
                      </span>
                      {item.received_attachment_filename && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.received_attachment_filename}</span>
                      )}
                    </div>
                    {(validationResult?.summary ?? item.validation_summary) && (
                      <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {validationResult?.summary ?? item.validation_summary}
                      </div>
                    )}
                    {((validationResult?.issues ?? item.validation_issues) ?? []).length > 0 && (
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                        {(validationResult?.issues ?? item.validation_issues ?? []).map((issue, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#f87171" }}>
                            <span style={{ flexShrink: 0 }}>·</span><span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {validateError && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{validateError}</p>}
              </div>

              {refDocSuggestion && (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      Add <strong style={{ color: "var(--text-primary)" }}>{refDocSuggestion.suggestedLabel}</strong> to this client&apos;s AI reference docs?
                    </p>
                    {refDocAdded ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#4ade80" }}>
                        <CheckCircle2 size={12} /> Added
                      </span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {refDocError && <span style={{ fontSize: 11, color: "#f87171" }}>{refDocError}</span>}
                        <button onClick={handleAddToRefDocs} disabled={refDocBusy} style={{ height: 28, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", fontSize: 11, fontWeight: 600, color: refDocBusy ? "var(--text-secondary)" : "var(--text-primary)", cursor: refDocBusy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                          {refDocBusy && <Loader2 size={10} className="animate-spin" />} Add
                        </button>
                        <button onClick={() => setRefDocSuggestion(null)} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}              {/* Inline attachment preview (PDF / image) — shown only when document is clicked via card above */}
          {hasAttachment && signedUrl && (isPdf || isImage) && (
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.received_attachment_filename ?? "Attachment"}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={signedUrl} download={item.received_attachment_filename ?? "attachment"} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 8px", height: 24, borderRadius: 5, border: "1px solid var(--border)", background: "transparent", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                    <Download size={10} /> Download
                  </a>
                  <button onClick={() => setFullscreen(true)} style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>
              {isPdf ? (
                <iframe src={`${signedUrl}#toolbar=0&navpanes=0`} title={item.received_attachment_filename ?? "Document"} style={{ width: "100%", height: 480, border: "none", background: "#fff", display: "block" }} />
              ) : (
                <div style={{ background: "#fff", display: "flex", justifyContent: "center" }}>
                  <img src={signedUrl} alt={item.received_attachment_filename ?? "Attachment"} style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain", display: "block", cursor: "zoom-in" }} onClick={() => setFullscreen(true)} />
                </div>
              )}
            </div>
          )}

          {/* Reply to send */}
          {hasDraft && (
            <>
              <SectionDivider label="Reply to send" color={decisionFg} />
              <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: decisionFg, fontWeight: 600 }}>
                    <Send size={11} /> {replySent ? "Sent" : "Ready to send"}
                  </span>
                  <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>
                  <span>To <span style={{ color: "var(--text-secondary)" }}>{item.client_name}</span></span>
                  <span style={{ flex: 1 }} />
                  <span>From Hollis on your behalf</span>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 16, color: "var(--text-primary)", fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {draftSubject}
                  </div>
                  {isEditing ? (
                    <textarea
                      ref={draftBodyRef}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={9}
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.65, fontFamily: "inherit", resize: "vertical", outline: "none", width: "100%" }}
                    />
                  ) : (
                    <div style={{ fontSize: 14.5, lineHeight: 1.7, color: replySent ? "var(--text-tertiary)" : "var(--text-primary)", whiteSpace: "pre-wrap", letterSpacing: "-0.003em" }}>
                      {draftBody}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Action bar */}
      <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 28px", flexShrink: 0 }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          {actionBar}
        </div>
      </div>

      {fullscreen && signedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{item.received_attachment_filename ?? "Document"}</span>
            </div>
            <div className="flex items-center gap-3">
              <a href={signedUrl} download={item.received_attachment_filename ?? "attachment"} className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <Download size={14} /> Download
              </a>
              <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <ExternalLink size={14} /> Open in tab
              </a>
              <button onClick={() => setFullscreen(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer" }}>
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {isPdf ? (
              <iframe src={signedUrl} className="w-full h-full rounded-lg" style={{ border: "none" }} title={item.received_attachment_filename ?? "Document"} />
            ) : isImage ? (
              <div className="w-full h-full flex items-center justify-center">
                <img src={signedUrl} alt={item.received_attachment_filename ?? "Document"} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

// ── DocChase detail shell (breadcrumb header + panel) ─────────────────────────

function DocChaseDetail({
  row, item, onBack, onMarkReceived, onReplySent, onRejected,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; item: DocChaseReplyItem; onBack: () => void;
  onMarkReceived: (id: string) => void; onReplySent: (id: string) => void; onRejected: (id: string) => void;
  learningApproved?: number; learningThreshold?: number;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <DetailHeader row={row} onBack={onBack} learningApproved={learningApproved} learningThreshold={learningThreshold} />
      <div style={{ padding: "32px 28px 8px", flexShrink: 0, maxWidth: 820, margin: "0 auto", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.022em", lineHeight: 1.3 }}>
          {row.headline}
        </h1>
      </div>
      <DocChaseDetailPanel item={item} onMarkReceived={onMarkReceived} onReplySent={onReplySent} onRejected={onRejected} />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function InboxClient({
  initialItems,
  docChaseReplies: initialDocChaseReplies = [],
}: {
  initialItems: InboxItem[];
  docChaseReplies?: DocChaseReplyItem[];
}) {
  const [items,           setItems]          = useState<InboxItem[]>(initialItems);
  const [docChaseReplies, setDocChaseReplies] = useState<DocChaseReplyItem[]>(initialDocChaseReplies);
  const [view,            setView]           = useState<"list" | "detail">("list");
  const [selectedRow,     setSelectedRow]    = useState<DisplayRow | null>(null);
  const [isEditing,       setIsEditing]      = useState(false);
  const [editedBody,      setEditedBody]     = useState("");
  const [busy,            setBusy]           = useState(false);
  const [errorMsg,        setErrorMsg]       = useState<string | null>(null);
  const [sentId,          setSentId]         = useState<string | null>(null);
  const [sentAction,      setSentAction]     = useState<"approved" | "rejected" | "edited" | null>(null);
  const [checkedMap,      setCheckedMap]     = useState<Record<string, Set<number>>>({});
  const [readIds,         setReadIds]        = useState<Set<string>>(new Set());
  const [learningApproved, setLearningApproved] = useState(0);
  const [learningThreshold, setLearningThreshold] = useState(LEARNING_MODE_THRESHOLD);
  // Fetch live learning count on mount and whenever view returns to list
  async function fetchLearningCount() {
    try {        const res = await fetch("/api/agent/learning-count");
      if (!res.ok) return;
      const data = await res.json();
      setLearningApproved(data.approvedCount ?? 0);
      setLearningThreshold(data.threshold ?? 20);
    } catch { /* non-critical — pill just stays at stale value */ }
  }

  useEffect(() => {
    fetchLearningCount();
  }, []);

  function openRow(row: DisplayRow) {
    setSelectedRow(row);
    setView("detail");
    setIsEditing(false);
    setErrorMsg(null);
    setSentId(null);
    setSentAction(null);
    setReadIds((prev) => new Set([...prev, row.id]));
  }

  function goBack() {
    setView("list");
    setSelectedRow(null);
    fetchLearningCount();
  }

  async function resolve(
    id: string,
    action: "approved" | "rejected" | "edited",
    extra?: { edited_body?: string }
  ) {
    setBusy(true); setErrorMsg(null);
    try {
      const res = await fetch(`/api/agent/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      setSentId(id); setSentAction(action);
      await new Promise((r) => setTimeout(r, 900));
      setItems((prev) => prev.filter((i) => i.id !== id));
      goBack();
      setSentId(null); setSentAction(null); setIsEditing(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  function toggleCheck(itemId: string, idx: number) {
    setCheckedMap((prev) => {
      const current = new Set(prev[itemId] ?? []);
      if (current.has(idx)) current.delete(idx); else current.add(idx);
      return { ...prev, [itemId]: current };
    });
  }

  if (view === "list") {
    return (
      <ListView
        allItems={items}
        docChaseReplies={docChaseReplies}
        onOpen={openRow}
        readIds={readIds}
        onRead={(id) => setReadIds((prev) => new Set([...prev, id]))}
      />
    );
  }

  if (!selectedRow) { setView("list"); return null; }

  // DocChase
  if (selectedRow.kind === "docchase" && selectedRow.dcItem) {
    const live = docChaseReplies.find((r) => r.id === selectedRow.id) ?? selectedRow.dcItem;
    return (
      <DocChaseDetail
        row={selectedRow}
        item={live}
        onBack={goBack}
        learningApproved={learningApproved}
        learningThreshold={learningThreshold}
        onMarkReceived={(id) => { setDocChaseReplies((prev) => prev.filter((r) => r.id !== id)); goBack(); }}
        onReplySent={(id) => { setDocChaseReplies((prev) => prev.filter((r) => r.id !== id)); goBack(); }}
        onRejected={(id) => { setDocChaseReplies((prev) => prev.filter((r) => r.id !== id)); goBack(); }}
      />
    );
  }

  const selectedItem = items.find((i) => i.id === selectedRow.id);
  if (!selectedItem) { setView("list"); return null; }

  const isSent = sentId === selectedItem.id;
  const itemType = deriveType(selectedItem);

  if (itemType === "todo") {
    return (
      <TodoDetailView
        row={selectedRow}
        item={selectedItem}
        onBack={goBack}
        busy={busy}
        done={isSent && sentAction === "approved"}
        checked={checkedMap[selectedItem.id] ?? new Set<number>()}
        onToggle={(idx) => toggleCheck(selectedItem.id, idx)}
        onComplete={() => resolve(selectedItem.id, "approved")}
        learningApproved={learningApproved}
        learningThreshold={learningThreshold}
      />
    );
  }

  return (
    <DecisionDetail
      row={selectedRow}
      item={selectedItem}
      onBack={goBack}
      busy={busy}
      sent={isSent}
      sentAction={sentAction}
      isEditing={isEditing}
      editedBody={editedBody}
      errorMsg={errorMsg}
      onApprove={() => resolve(selectedItem.id, "approved")}
      onReject={() => resolve(selectedItem.id, "rejected")}
      onEdit={() => {
        setIsEditing(true);
        setEditedBody(typeof selectedItem.proposed_action?.payload?.body === "string" ? selectedItem.proposed_action.payload.body : "");
      }}
      onEditedBodyChange={setEditedBody}
      onConfirmEdit={() => resolve(selectedItem.id, "edited", { edited_body: editedBody })}
      onCancelEdit={() => { setIsEditing(false); setEditedBody(""); }}
    />
  );
}
