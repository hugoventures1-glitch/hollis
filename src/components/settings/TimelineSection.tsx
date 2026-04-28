"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { TimelineEditor } from "@/components/renewals/TimelineEditor";
import { DEFAULT_TIMELINE } from "@/types/timeline";
import type { TimelineConfig } from "@/types/timeline";

export function TimelineSection() {
  const [config, setConfig] = useState<TimelineConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/timeline")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.timeline ?? DEFAULT_TIMELINE);
        setLoading(false);
      })
      .catch(() => {
        setConfig(DEFAULT_TIMELINE);
        setLoading(false);
      });
  }, []);

  async function handleSave(cfg: TimelineConfig) {
    const res = await fetch("/api/settings/timeline", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeline: cfg }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Failed to save");
    }
    setConfig(cfg);
  }

  async function handleReset() {
    await handleSave(DEFAULT_TIMELINE);
    setConfig(DEFAULT_TIMELINE);
  }

  return (
    <div className="px-8 py-8 w-full">
      <div className="mb-6">
        <h2 className="text-[16px] font-semibold text-[#FAFAFA]">Renewal Timeline</h2>
        <p className="text-[13px] text-zinc-500 mt-1">
          The default outreach schedule applied to all new renewals. Changes here apply to future imports only — policies already in progress keep their existing schedule.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-600 text-[13px] py-8">
          <Loader2 size={15} className="animate-spin" />
          Loading timeline…
        </div>
      ) : (
        <TimelineEditor
          initialConfig={config!}
          onSave={handleSave}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
