"use client";

import { useState } from "react";

export interface CommsLogEntry {
  id: string;
  kind: "email" | "sms" | "note";
  label: string;
  detail?: string | null;
  status?: string | null;
  ts: string;
}

interface CommsHistoryPanelProps {
  entries: CommsLogEntry[];
}

const TABS = [
  { key: "email" as const, label: "email" },
  { key: "sms"   as const, label: "sms"   },
  { key: "notes" as const, label: "notes" },
];

function fmtTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })
    + " "
    + d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function CommsHistoryPanel({ entries }: CommsHistoryPanelProps) {
  const [tab, setTab] = useState<"email" | "sms" | "notes">("email");

  const visible = entries.filter((e) =>
    tab === "notes" ? e.kind === "note" : e.kind === tab
  );

  return (
    <div className="rounded-xl bg-surface border border-border p-6 flex flex-col gap-4 flex-1">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
          Comms History
        </div>
        <div className="flex gap-4">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="text-[12px] transition-colors"
              style={{ color: tab === key ? "var(--text-primary)" : "var(--text-tertiary)" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 gap-1.5">
            <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>No communications logged yet.</span>
            {tab === "email" && (
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Inbound email processing pending.</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {visible.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 py-2.5 border-b border-border-subtle"
              >
                <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                  {fmtTs(entry.ts)}
                </span>
                <span className="text-[13px] flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                  {entry.label}
                </span>
                {entry.status && (
                  <span
                    className="text-[11px] shrink-0"
                    style={{ color: entry.status === "sent" ? "var(--text-tertiary)" : "var(--danger)" }}
                  >
                    {entry.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
