"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Paperclip, RefreshCw } from "lucide-react";
import type { InboxItem, DocChaseReplyItem } from "../page";
import {
  type DisplayRow,
  type Filter,
  toDisplayRow,
  dcToDisplayRow,
} from "./inbox-types";
import { TypePill, FilterTab } from "./InboxShared";

// ── Border color by type ──────────────────────────────────────────────────────

const BORDER: Record<string, string> = {
  decision:   "rgba(37,99,235,0.65)",
  escalation: "var(--danger)",
  docchase:   "rgba(5,150,105,0.65)",
  todo:       "rgba(217,119,6,0.65)",
};

// ── List row ──────────────────────────────────────────────────────────────────

function ListRow({
  row, onOpen, unread, selected,
}: {
  row: DisplayRow; onOpen: (r: DisplayRow) => void; unread: boolean; selected: boolean;
}) {
  const isUrgent = row.expiryDays !== null && row.expiryDays <= 7;
  const borderColor = BORDER[row.type] ?? "transparent";

  return (
    <button
      onClick={() => onOpen(row)}
      style={{
        width: "100%", textAlign: "left", border: "none",
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "11px 14px 11px 11px",
        background: selected ? "var(--surface)" : "transparent",
        borderTop: "1px solid var(--border-subtle)",
        borderLeft: `3px solid ${selected ? borderColor : "transparent"}`,
        cursor: "pointer", transition: "background 100ms, border-left-color 100ms",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!selected) { el.style.background = "var(--surface)"; el.style.borderLeftColor = `${borderColor}55`; }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!selected) { el.style.background = "transparent"; el.style.borderLeftColor = "transparent"; }
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, marginTop: 5, background: unread ? "#3b82f6" : "transparent" }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top: client name + pill + time */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 13, fontWeight: unread ? 700 : 600,
            color: "var(--text-primary)", letterSpacing: "-0.005em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>
            {row.client}
          </span>
          {row.hasAttachment && <Paperclip size={10} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />}
          <TypePill type={row.type} unread={unread} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {row.timeAgoStr}
          </span>
        </div>
        {/* Bottom: headline + expiry badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 12, color: "var(--text-secondary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>
            {row.headline}
          </span>
          {row.expiryDays !== null && (
            <span style={{
              fontSize: 10.5, fontWeight: isUrgent ? 600 : 500,
              padding: "1px 5px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
              background: isUrgent ? "rgba(220,38,38,0.10)" : "rgba(0,0,0,0.06)",
              color: isUrgent ? "var(--danger)" : "var(--text-tertiary)",
            }}>
              {row.expiryDays}d
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Escalation row ────────────────────────────────────────────────────────────

function EscalationRow({
  row, onOpen, unread, selected,
}: {
  row: DisplayRow; onOpen: (r: DisplayRow) => void; unread: boolean; selected: boolean;
}) {
  const payload = row.inboxItem?.proposed_action?.payload as Record<string, unknown> | undefined;
  const reason = (payload?.escalation_reason as string | undefined) ?? row.headline;

  return (
    <button
      onClick={() => onOpen(row)}
      style={{
        width: "100%", textAlign: "left", border: "none",
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "11px 14px 11px 11px",
        background: selected ? "rgba(220,38,38,0.09)" : "rgba(220,38,38,0.04)",
        borderTop: "1px solid rgba(220,38,38,0.12)",
        borderLeft: "3px solid var(--danger)",
        cursor: "pointer", transition: "background 100ms",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.09)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selected ? "rgba(220,38,38,0.09)" : "rgba(220,38,38,0.04)"; }}
    >
      <div
        className="escalation-dot"
        style={{ width: 7, height: 7, borderRadius: 999, background: "var(--danger)", marginTop: 5, flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top: client + pill + time */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 13, fontWeight: unread ? 700 : 600,
            color: "var(--text-primary)", letterSpacing: "-0.005em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>
            {row.client}
          </span>
          <TypePill type="escalation" unread={unread} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {row.timeAgoStr}
          </span>
        </div>
        {/* Bottom: reason */}
        <span style={{
          fontSize: 12, color: "var(--text-secondary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "block",
        }}>
          {reason}
        </span>
      </div>
    </button>
  );
}

// ── Escalations header ────────────────────────────────────────────────────────

function EscalationsHeader({ count }: { count: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px 8px 14px",
      background: "rgba(220,38,38,0.04)",
      borderBottom: "1px solid rgba(220,38,38,0.12)",
    }}>
      <AlertTriangle size={13} style={{ color: "var(--danger)", flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--danger)", whiteSpace: "nowrap" }}>
        Escalations
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--danger)", background: "rgba(220,38,38,0.10)", padding: "1px 6px", borderRadius: 999 }}>
        {count}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Requires your input</span>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

export function ListView({
  allItems,
  docChaseReplies,
  onOpen,
  readIds,
  onRead,
  selectedId,
}: {
  allItems: InboxItem[];
  docChaseReplies: DocChaseReplyItem[];
  onOpen: (r: DisplayRow) => void;
  readIds: Set<string>;
  onRead: (id: string) => void;
  selectedId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const escalationRows: DisplayRow[] = allItems
    .filter((i) => i.tier === 3)
    .map(toDisplayRow)
    .sort((a, b) => {
      const aTime = a.inboxItem?.created_at ?? "";
      const bTime = b.inboxItem?.created_at ?? "";
      return bTime.localeCompare(aTime);
    });

  const regularItems = allItems.filter((i) => i.tier !== 3);

  const allRows: DisplayRow[] = [
    ...regularItems.map(toDisplayRow),
    ...docChaseReplies.map(dcToDisplayRow),
  ].sort((a, b) => {
    const aTime = a.inboxItem?.created_at ?? a.dcItem?.created_at ?? "";
    const bTime = b.inboxItem?.created_at ?? b.dcItem?.created_at ?? "";
    return bTime.localeCompare(aTime);
  });

  const filtered =
    filter === "all"      ? allRows :
    filter === "decision" ? allRows.filter((r) => r.type === "decision") :
                            allRows.filter((r) => r.type === filter);

  const counts = {
    all:      allRows.length + escalationRows.length,
    decision: allRows.filter((r) => r.type === "decision").length,
    todo:     allRows.filter((r) => r.type === "todo").length,
    docchase: allRows.filter((r) => r.type === "docchase").length,
  };

  function handleOpen(row: DisplayRow) {
    onRead(row.id);
    onOpen(row);
  }

  const hasEscalations = escalationRows.length > 0;

  return (
    <div data-tour="inbox-list" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "20px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            Inbox
          </h1>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => startRefresh(() => { router.refresh(); })}
            disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 11.5, cursor: refreshing ? "default" : "pointer" }}
            onMouseEnter={(e) => { if (!refreshing) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
            title="Refresh inbox"
          >
            <RefreshCw size={11} style={{ animation: refreshing ? "spin 600ms linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
          <FilterTab active={filter === "all"}      label="All"       count={counts.all}      onClick={() => setFilter("all")} />
          <FilterTab active={filter === "decision"} label="Decisions" count={counts.decision} onClick={() => setFilter("decision")} />
          <FilterTab active={filter === "todo"}     label="To-Dos"    count={counts.todo}     onClick={() => setFilter("todo")} />
          <FilterTab active={filter === "docchase"} label="Doc Chase" count={counts.docchase} onClick={() => setFilter("docchase")} />
        </div>
      </header>

      <div style={{ flex: 1, overflow: "auto" }}>
        {hasEscalations && (
          <div className="escalation-section" data-tour="inbox-escalations">
            <EscalationsHeader count={escalationRows.length} />
            {escalationRows.map((row) => (
              <EscalationRow
                key={row.id}
                row={row}
                onOpen={handleOpen}
                unread={!readIds.has(row.id)}
                selected={row.id === selectedId}
              />
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 14px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Nothing here — Hollis is watching the rest.
          </div>
        ) : (
          filtered.map((row) => (
            <ListRow
              key={row.id}
              row={row}
              onOpen={handleOpen}
              unread={!readIds.has(row.id)}
              selected={row.id === selectedId}
            />
          ))
        )}
      </div>
    </div>
  );
}
