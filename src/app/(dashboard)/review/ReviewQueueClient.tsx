"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Inbox,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { QueueItemWithPolicy } from "./page";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

function confidenceBadge(score: number): { label: string; color: string } {
  const pct = Math.round(score * 100);
  if (score >= 0.85) return { label: `${pct}%`, color: "text-[#4ade80] bg-[#16a34a]/10 border-[#16a34a]/20" };
  if (score >= 0.60) return { label: `${pct}%`, color: "text-[#fbbf24] bg-[#f59e0b]/10 border-[#f59e0b]/20" };
  return { label: `${pct}%`, color: "text-[#f87171] bg-[#dc2626]/10 border-[#dc2626]/20" };
}

function intentLabel(intent: string): string {
  return intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ReviewQueueClientProps {
  initialItems: QueueItemWithPolicy[];
}

export default function ReviewQueueClient({ initialItems }: ReviewQueueClientProps) {
  const [items, setItems] = useState<QueueItemWithPolicy[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedIntent, setEditedIntent] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function resolve(
    id: string,
    action: "approved" | "rejected" | "edited",
    extra?: { edited_intent?: string; notes?: string }
  ) {
    setBusy(id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/agent/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to resolve");
      }
      // Remove resolved item from list
      setItems((prev) => prev.filter((i) => i.id !== id));
      setEditingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function startEdit(item: QueueItemWithPolicy) {
    setEditingId(item.id);
    setEditedIntent(item.classified_intent);
    setEditNotes("");
    setErrorMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditedIntent("");
    setEditNotes("");
    setErrorMsg(null);
  }

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C] text-[#FAFAFA]">
      {/* Header */}
      <header className="h-[56px] shrink-0 border-b border-[#1C1C1C] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-[#FAFAFA] text-[15px] font-semibold">Agent Review</span>
          {items.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#FAFAFA]/[0.04] border border-[#1C1C1C] text-[11px] font-semibold text-[#9e9e9e]">
              {items.length} pending
            </span>
          )}
        </div>
      </header>

      {/* Error banner */}
      {errorMsg && (
        <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg text-[13px] border bg-red-950/30 border-red-800/30 text-red-400 flex items-center gap-2">
          <AlertTriangle size={14} />
          {errorMsg}
        </div>
      )}

      {/* Queue list or empty state */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-14 h-14 rounded-full bg-[#111111] border border-[#1C1C1C] flex items-center justify-center mb-4">
            <Inbox size={22} className="text-[#6b6b6b]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#FAFAFA] mb-1">Queue is clear</h2>
          <p className="text-[13px] text-[#6b6b6b] max-w-xs">
            No pending decisions. The agent will surface items here when it needs
            your input on a Tier 2 signal.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4 max-w-2xl">
            {items.map((item) => {
              const policy = item.policies;
              const days = policy ? daysUntil(policy.expiration_date) : null;
              const urgencyColor =
                days !== null && days <= 14
                  ? "text-red-400"
                  : days !== null && days <= 30
                  ? "text-[#9e9e9e]"
                  : "text-[#FAFAFA]";
              const confidence = confidenceBadge(item.confidence_score);
              const isEditing = editingId === item.id;
              const isBusy = busy === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-[#111111] border border-[#1C1C1C] rounded-xl p-5 hover:border-[#1C1C1C] transition-colors"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-semibold text-[#FAFAFA] truncate">
                          {policy?.client_name ?? "Unknown Client"}
                        </span>
                        {days !== null && (
                          <span className={`text-[12px] font-semibold shrink-0 ${urgencyColor}`}>
                            {days}d
                          </span>
                        )}
                      </div>
                      {policy && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#8a8a8a]">
                          <span className="truncate">{policy.policy_name}</span>
                          {policy.carrier && (
                            <>
                              <span className="text-[#6b6b6b]">·</span>
                              <span className="truncate text-[#6b6b6b]">{policy.carrier}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {policy && (
                      <Link
                        href={`/renewals/${policy.id}`}
                        className="shrink-0 flex items-center gap-1 text-[11px] text-[#6b6b6b] hover:text-[#8a8a8a] transition-colors"
                      >
                        Open policy
                        <ChevronRight size={11} />
                      </Link>
                    )}
                  </div>

                  {/* Agent read */}
                  <div className="bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg p-4 mb-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                          Agent read
                        </div>
                        <span className="text-[13px] font-medium text-[#FAFAFA]">
                          {intentLabel(item.classified_intent)}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${confidence.color}`}
                      >
                        {confidence.label} confidence
                      </span>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                        Client said
                      </div>
                      <p className="text-[12px] text-[#8a8a8a] italic leading-relaxed line-clamp-4">
                        &ldquo;{item.raw_signal_snippet}&rdquo;
                      </p>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                        Proposed action
                      </div>
                      <p className="text-[12px] text-[#8a8a8a] leading-relaxed">
                        {item.proposed_action.description}
                      </p>
                    </div>
                  </div>

                  {/* Edit form */}
                  {isEditing && (
                    <div className="bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg p-4 mb-4 space-y-3">
                      <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-wider">
                        Edit intent
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6b6b6b] mb-1">
                          Correct intent label
                        </label>
                        <input
                          type="text"
                          value={editedIntent}
                          onChange={(e) => setEditedIntent(e.target.value)}
                          placeholder="e.g. confirm_renewal"
                          className="w-full bg-[#1a1a24] border border-[#1C1C1C] rounded-md px-3 py-2 text-[13px] text-[#FAFAFA] placeholder-[#6b6b6b] focus:outline-none focus:border-[#555555]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6b6b6b] mb-1">
                          Notes (optional)
                        </label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Why you changed it…"
                          rows={2}
                          className="w-full bg-[#1a1a24] border border-[#1C1C1C] rounded-md px-3 py-2 text-[13px] text-[#FAFAFA] placeholder-[#6b6b6b] focus:outline-none focus:border-[#555555] resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            resolve(item.id, "edited", {
                              edited_intent: editedIntent,
                              notes: editNotes || undefined,
                            })
                          }
                          disabled={isBusy || !editedIntent.trim()}
                          className="h-8 flex items-center gap-1.5 px-3.5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Confirm edit
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={isBusy}
                          className="h-8 flex items-center px-3 rounded-md border border-[#1C1C1C] text-[12px] text-[#6b6b6b] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!isEditing && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => resolve(item.id, "approved")}
                        disabled={isBusy}
                        className="h-8 flex items-center gap-1.5 px-3.5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isBusy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={12} />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        disabled={isBusy}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors disabled:opacity-50"
                      >
                        <Pencil size={12} />
                        Edit &amp; Approve
                      </button>
                      <button
                        onClick={() => resolve(item.id, "rejected")}
                        disabled={isBusy}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-md border border-[#1C1C1C] text-[12px] text-[#6b6b6b] hover:text-red-400 hover:border-red-800/50 transition-colors disabled:opacity-50"
                      >
                        <XCircle size={12} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
