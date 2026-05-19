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
import { TypePill } from "./InboxShared";

// ── List row ──────────────────────────────────────────────────────────────────

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

// ── Escalation row ────────────────────────────────────────────────────────────

function EscalationRow({
  row, onOpen, unread,
}: {
  row: DisplayRow; onOpen: (r: DisplayRow) => void; unread: boolean;
}) {
  const payload = row.inboxItem?.proposed_action?.payload as Record<string, unknown> | undefined;
  const reason = (payload?.escalation_reason as string | undefined) ?? row.headline;
  return (
    <button
      onClick={() => onOpen(row)}
      style={{
        width: "100%", textAlign: "left", border: "none",
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
        columnGap: 12, alignItems: "center",
        padding: "14px 32px 14px 25px",
        background: "rgba(220,38,38,0.05)",
        borderTop: "1px solid rgba(220,38,38,0.15)",
        borderLeft: "3px solid var(--danger)",
        cursor: "pointer", transition: "background 120ms",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.10)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.05)"; }}
    >
      <div
        className="escalation-dot"
        style={{
          width: 9, height: 9, borderRadius: 999,
          background: "var(--danger)",
          marginRight: 4, flexShrink: 0,
        }}
      />

      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontSize: 13.5, fontWeight: unread ? 700 : 600,
            color: unread ? "var(--text-primary)" : "var(--text-secondary)",
            letterSpacing: "-0.005em", whiteSpace: "nowrap", flexShrink: 0,
            maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {row.client}
        </span>
        <span
          style={{
            fontSize: 13.5, color: unread ? "var(--text-primary)" : "var(--text-secondary)",
            fontWeight: unread ? 500 : 400,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: "-0.003em", flex: 1, minWidth: 0,
          }}
        >
          {reason}
        </span>
      </div>

      <TypePill type="escalation" />

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

// ── Escalations header ────────────────────────────────────────────────────────

function EscalationsHeader({ count }: { count: number }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 32px 10px 25px",
        background: "rgba(220,38,38,0.04)",
        borderBottom: "1px solid rgba(220,38,38,0.12)",
      }}
    >
      <AlertTriangle size={14} style={{ color: "var(--danger)", flexShrink: 0 }} />
      <span
        style={{
          fontSize: 11.5, fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--danger)", whiteSpace: "nowrap",
        }}
      >
        Escalations
      </span>
      <span
        style={{
          fontSize: 11.5, fontWeight: 600, fontVariantNumeric: "tabular-nums",
          color: "var(--danger)", background: "rgba(220,38,38,0.10)",
          padding: "1px 7px", borderRadius: 999,
        }}
      >
        {count}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
        Requires your input
      </span>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

import { FilterTab } from "./InboxShared";

export function ListView({
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
          <span style={{ flex: 1 }} />
          <button
            onClick={() => startRefresh(() => { router.refresh(); })}
            disabled={refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", fontSize: 12, cursor: refreshing ? "default" : "pointer" }}
            onMouseEnter={(e) => { if (!refreshing) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
            title="Refresh inbox"
          >
            <RefreshCw size={12} style={{ animation: refreshing ? "spin 600ms linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
          <FilterTab active={filter === "all"}      label="All"       count={counts.all}      onClick={() => setFilter("all")} />
          <FilterTab active={filter === "decision"} label="Decisions" count={counts.decision} onClick={() => setFilter("decision")} />
          <FilterTab active={filter === "todo"}     label="To-Dos"    count={counts.todo}     onClick={() => setFilter("todo")} />
          <FilterTab active={filter === "docchase"} label="Doc Chase" count={counts.docchase} onClick={() => setFilter("docchase")} />
        </div>
      </header>

      <div style={{ flex: 1, overflow: "auto" }}>
        {hasEscalations && (
          <div className="escalation-section">
            <EscalationsHeader count={escalationRows.length} />
            {escalationRows.map((row) => (
              <EscalationRow
                key={row.id}
                row={row}
                onOpen={handleOpen}
                unread={!readIds.has(row.id)}
              />
            ))}
          </div>
        )}

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
