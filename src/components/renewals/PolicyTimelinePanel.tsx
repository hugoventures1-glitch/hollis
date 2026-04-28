"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { TimelineEditor } from "./TimelineEditor";
import { resolveTimeline } from "@/types/timeline";
import type { TimelineConfig } from "@/types/timeline";

interface PolicyTimelinePanelProps {
  policyId: string;
  policyTimeline: TimelineConfig | null;
  brokerTimeline: TimelineConfig | null;
  daysUntilExpiry: number;
}

export function PolicyTimelinePanel({
  policyId,
  policyTimeline: initialPolicyTimeline,
  brokerTimeline,
  daysUntilExpiry,
}: PolicyTimelinePanelProps) {
  const [policyTimeline, setPolicyTimeline] = useState<TimelineConfig | null>(initialPolicyTimeline);
  const [customising, setCustomising] = useState(false);
  const isCustom = policyTimeline !== null;

  async function handleCustomise() {
    setCustomising(true);
    const forked = resolveTimeline(brokerTimeline, null);
    try {
      const res = await fetch(`/api/renewals/${policyId}/timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline: forked }),
      });
      if (!res.ok) throw new Error("Failed to customise timeline");
      setPolicyTimeline(forked);
    } finally {
      setCustomising(false);
    }
  }

  async function handleSave(cfg: TimelineConfig) {
    const res = await fetch(`/api/renewals/${policyId}/timeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeline: cfg }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Failed to save");
    }
    setPolicyTimeline(cfg);
  }

  async function handleRevert() {
    const res = await fetch(`/api/renewals/${policyId}/timeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeline: null }),
    });
    if (!res.ok) throw new Error("Failed to revert");
    setPolicyTimeline(null);
  }

  const displayConfig = isCustom ? policyTimeline! : resolveTimeline(brokerTimeline, null);

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#555555" }}>
        Renewal Timeline
      </div>

      {/* Banner */}
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6"
        style={{ background: "#111111", border: "1px solid #1C1C1C" }}
      >
        <CalendarRange size={15} className="text-zinc-500 shrink-0" />
        <span className="text-[13px] text-zinc-500 flex-1">
          {isCustom
            ? "This policy has a custom timeline. Changes here only affect this policy."
            : "Using default timeline — customise for this policy only"}
        </span>
        {!isCustom && (
          <button
            type="button"
            onClick={handleCustomise}
            disabled={customising}
            className="shrink-0 px-3 py-1 text-[12px] font-medium rounded-md border border-[#2A2A2A] text-zinc-300 hover:border-zinc-500 hover:text-[#FAFAFA] transition-colors disabled:opacity-50"
          >
            {customising ? "Setting up…" : "Customise"}
          </button>
        )}
      </div>

      <TimelineEditor
        initialConfig={displayConfig}
        isReadOnly={!isCustom}
        onSave={handleSave}
        onReset={isCustom ? handleRevert : undefined}
        daysUntilExpiry={daysUntilExpiry}
      />
    </div>
  );
}
