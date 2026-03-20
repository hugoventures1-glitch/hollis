"use client";

import { useState, useEffect } from "react";
import { SaveButton } from "./SaveButton";

const MAX_CHARS = 2000;

const EXAMPLES = [
  "Always address clients by first name and keep a warm but professional tone.",
  "If a client is in the construction or trades industry, emphasise our specialist liability coverage.",
  "Never send SMS to clients over 65 — call them instead.",
  "Hold outreach if I haven't reviewed the file first — flag me before acting.",
  "For commercial clients with premiums over $10k, always draft for my review before sending.",
];

export function HollisSection({ initialOrders }: { initialOrders?: string | null }) {
  const [value, setValue]   = useState(initialOrders ?? "");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Keep local state in sync if parent re-renders
  useEffect(() => {
    setValue(initialOrders ?? "");
  }, [initialOrders]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/settings/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ standing_orders: value }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remaining = MAX_CHARS - value.length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Hollis Instructions</h2>
        <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed">
          Tell Hollis how to behave — it reads these before every outbound decision. Write naturally, like briefing a new employee on how you run your book.
        </p>
      </div>

      {/* Main textarea */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider block">
          Standing orders
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_CHARS))}
          rows={10}
          placeholder="e.g. Always use the client's first name. For construction clients, lead with our specialist liability cover. Never send SMS to clients I've flagged as phone-only..."
          className="w-full rounded-lg border border-[#1C1C1C] bg-[#111111] px-4 py-3 text-[14px] text-[#f5f5f7] placeholder-[#3a3a3a] focus:outline-none focus:border-[#333333] resize-none leading-relaxed transition-colors"
          style={{ fontFamily: "inherit" }}
        />
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#444444]">
            Hollis treats these as standing orders — they apply to every policy unless you override at the client or policy level.
          </p>
          <span
            className="text-[11px] shrink-0 ml-4"
            style={{ color: remaining < 200 ? "#F59E0B" : "#3a3a3a" }}
          >
            {remaining.toLocaleString()} left
          </span>
        </div>
      </div>

      {/* Examples */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider">Examples</p>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const sep = value.trim() ? "\n" : "";
                setValue((prev) => (prev + sep + ex).slice(0, MAX_CHARS));
              }}
              className="w-full text-left px-3 py-2.5 rounded-md text-[13px] leading-snug transition-colors"
              style={{ background: "#111111", border: "1px solid #1C1C1C", color: "#555555" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color       = "#FAFAFA";
                (e.currentTarget as HTMLElement).style.borderColor = "#333333";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color       = "#555555";
                (e.currentTarget as HTMLElement).style.borderColor = "#1C1C1C";
              }}
            >
              <span className="text-[#2a2a2a] mr-2">+</span>
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-red-400">{error}</p>}

      <SaveButton saving={saving} saved={saved} onClick={handleSave} label="Save instructions" />
    </div>
  );
}
