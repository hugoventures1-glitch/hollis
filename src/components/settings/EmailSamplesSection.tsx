"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Plus, FileText } from "lucide-react";
import type { BrokerEmailSample } from "@/types/settings";

const GOAL = 20;
const DELIMITER = "---";

export function EmailSamplesSection() {
  const [samples, setSamples]   = useState<BrokerEmailSample[]>([]);
  const [loading, setLoading]   = useState(true);
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/email-samples");
      if (res.ok) setSamples(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/email-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: [{ subject: subject.trim() || undefined, body: body.trim() }] }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save");
      }
      setSubject("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkAdd() {
    const parts = bulkText.split(new RegExp(`\\n\\s*${DELIMITER}\\s*\\n`)).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/email-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: parts.map((p) => ({ body: p })) }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save");
      }
      setBulkText("");
      setBulkMode(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/settings/email-samples/${id}`, { method: "DELETE" });
    if (res.ok) setSamples((prev) => prev.filter((s) => s.id !== id));
  }

  const count = samples.length;
  const pct   = Math.min((count / GOAL) * 100, 100);
  const done  = count >= GOAL;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-semibold text-text-primary">Writing Style</h2>
        <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed">
          Paste emails you&apos;ve previously sent to clients. Hollis reads these to learn your tone and style — upload at least {GOAL} for best results.
        </p>
      </div>

      {/* Progress */}
      <div
        className="rounded-xl p-5 border"
        style={{ background: "var(--surface)", borderColor: done ? "rgba(34,197,94,0.3)" : "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold" style={{ color: done ? "#22C55E" : "var(--text-primary)" }}>
            {done ? "Writing style captured" : "Capture your writing style"}
          </p>
          <span className="text-[13px] font-medium tabular-nums" style={{ color: done ? "#22C55E" : "var(--text-secondary)" }}>
            {count} / {GOAL}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--border)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: done ? "#22C55E" : "#60A5FA" }}
          />
        </div>
        {!done && (
          <p className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
            {GOAL - count} more email{GOAL - count !== 1 ? "s" : ""} needed
          </p>
        )}
      </div>

      {/* Add form */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            {bulkMode ? "Bulk paste" : "Add email"}
          </p>
          <button
            type="button"
            onClick={() => setBulkMode((v) => !v)}
            className="text-[12px] transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
          >
            {bulkMode ? "← Single email" : "Paste multiple →"}
          </button>
        </div>

        {bulkMode ? (
          <div className="space-y-3">
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Paste multiple emails separated by a line containing only <code className="px-1 rounded text-[11px]" style={{ background: "var(--border)" }}>---</code>
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={12}
              placeholder={`Hi Sarah,\n\nJust a quick note to confirm we've received your renewal documents...\n\n---\n\nHi James,\n\nYour policy is due for renewal on the 15th...`}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-[14px] text-text-primary placeholder-[#3a3a3a] focus:outline-none focus:border-[#333333] resize-none leading-relaxed transition-colors"
              style={{ fontFamily: "inherit" }}
            />
            <button
              type="button"
              onClick={handleBulkAdd}
              disabled={saving || !bulkText.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40"
              style={{ background: "var(--border)", color: "var(--text-primary)" }}
            >
              <Plus size={14} />
              {saving ? "Saving…" : "Add all"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-[14px] text-text-primary placeholder-[#3a3a3a] focus:outline-none focus:border-[#333333] transition-colors"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Paste the email body here…"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-[14px] text-text-primary placeholder-[#3a3a3a] focus:outline-none focus:border-[#333333] resize-none leading-relaxed transition-colors"
              style={{ fontFamily: "inherit" }}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !body.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40"
              style={{ background: "var(--border)", color: "var(--text-primary)" }}
            >
              <Plus size={14} />
              {saving ? "Saving…" : "Add sample"}
            </button>
          </div>
        )}

        {error && <p className="text-[13px] text-red-400">{error}</p>}
      </div>

      {/* Sample list */}
      {!loading && samples.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            Uploaded samples ({samples.length})
          </p>
          <div className="space-y-2">
            {samples.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <FileText size={14} strokeWidth={1.5} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  {s.subject && (
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {s.subject}
                    </p>
                  )}
                  <p className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>
                    {s.body.slice(0, 100)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="shrink-0 p-1.5 rounded transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#F87171")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Loading…</p>
      )}
    </div>
  );
}
