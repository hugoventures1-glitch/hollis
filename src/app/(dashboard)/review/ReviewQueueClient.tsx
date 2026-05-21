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
} from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";
import type { QueueItemWithPolicy } from "./page";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

function confidenceBadge(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "Scheduled", color: "text-text-tertiary bg-hover-overlay border-border" };
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

const EMAIL_ACTION_TYPES = new Set([
  "send_renewal_email",
  "draft_and_send_response",
  "send_verification_email",
]);

export default function ReviewQueueClient({ initialItems }: ReviewQueueClientProps) {
  const [items, setItems] = useState<QueueItemWithPolicy[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedIntent, setEditedIntent] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { toast } = useToast();

  function resolve(
    id: string,
    action: "approved" | "rejected" | "edited",
    extra?: { edited_intent?: string; notes?: string }
  ) {
    // Optimistic: remove item immediately so the UI feels instant
    const item = items.find((i) => i.id === id);
    const itemIndex = items.findIndex((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setEditingId(null);
    setErrorMsg(null);

    // Fire in the background
    fetch(`/api/agent/review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? "Failed to resolve");
        }
        if (action === "approved" || action === "edited") {
          const actionType = (item?.proposed_action as { action_type?: string } | null)?.action_type;
          const msg = EMAIL_ACTION_TYPES.has(actionType ?? "") ? "Email sent." : "Done.";
          toast(msg, "success");
        }
      })
      .catch((err) => {
        // Restore item to its original position on failure
        if (item !== undefined) {
          setItems((prev) => {
            const next = [...prev];
            next.splice(itemIndex, 0, item);
            return next;
          });
        }
        toast(err instanceof Error ? err.message : "Something went wrong — please try again.", "error");
      });
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
    <div className="flex flex-col h-full bg-background text-text-primary">
      {/* Header */}
      <header className="shrink-0 border-b border-border flex items-start justify-between pl-8 pr-6" style={{ paddingTop: 36, paddingBottom: 20 }}>
        <div>
          <div className="flex items-center gap-3">
            <h1 style={{ margin: 0, fontSize: 39, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1 }}>Review Queue</h1>
            {items.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-hover-overlay border border-border text-[11px] font-semibold text-text-secondary">
                {items.length} pending
              </span>
            )}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5, fontFamily: "var(--font-mono)" }}>Approve or reject AI-drafted responses before they send.</p>
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
          <div className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
            <Inbox size={22} className="text-text-tertiary" />
          </div>
          <h2 className="text-[16px] font-semibold text-text-primary mb-1">Queue is clear</h2>
          <p className="text-[13px] text-text-tertiary max-w-xs">
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
                  ? "text-text-secondary"
                  : "text-text-primary";
              const confidence = confidenceBadge(item.confidence_score);
              const isEditing = editingId === item.id;

              return (
                <div
                  key={item.id}
                  className="bg-surface border border-border rounded-xl p-5 hover:border-border transition-colors"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-semibold text-text-primary truncate">
                          {policy?.client_name ?? "Unknown Client"}
                        </span>
                        {days !== null && (
                          <span className={`text-[12px] font-semibold shrink-0 ${urgencyColor}`}>
                            {days}d
                          </span>
                        )}
                      </div>
                      {policy && (
                        <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                          <span className="truncate">{policy.policy_name}</span>
                          {policy.carrier && (
                            <>
                              <span className="text-text-tertiary">·</span>
                              <span className="truncate text-text-tertiary">{policy.carrier}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {policy && (
                      <Link
                        href={`/renewals/${policy.id}`}
                        className="shrink-0 flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
                      >
                        Open policy
                        <ChevronRight size={11} />
                      </Link>
                    )}
                  </div>

                  {/* Agent read */}
                  <div className="bg-background border border-border rounded-lg p-4 mb-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                          Agent read
                        </div>
                        <span className="text-[13px] font-medium text-text-primary">
                          {intentLabel(item.classified_intent)}
                        </span>
                      </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${confidence.color}`}
              >
                {confidence.label}
                {item.confidence_score != null && " confidence"}
              </span>
                    </div>

                    {item.signal_id !== null && (
                    <div>
                      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                        Client said
                      </div>
                      <p className="text-[12px] text-text-secondary italic leading-relaxed line-clamp-4">
                        &ldquo;{item.raw_signal_snippet}&rdquo;
                      </p>
                    </div>
                    )}

                    <div>
                      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                        Proposed action
                      </div>
                      <p className="text-[12px] text-text-secondary leading-relaxed">
                        {item.proposed_action.description}
                      </p>
                    </div>
                  </div>

                  {/* Edit form */}
                  {isEditing && (
                    <div className="bg-background border border-border rounded-lg p-4 mb-4 space-y-3">
                      <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                        Edit intent
                      </div>
                      <div>
                        <label className="block text-[11px] text-text-tertiary mb-1">
                          Correct intent label
                        </label>
                        <input
                          type="text"
                          value={editedIntent}
                          onChange={(e) => setEditedIntent(e.target.value)}
                          placeholder="e.g. confirm_renewal"
                          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-text-tertiary mb-1">
                          Notes (optional)
                        </label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Why you changed it…"
                          rows={2}
                          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary resize-none"
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
                          disabled={!editedIntent.trim()}
                          className="h-8 flex items-center gap-1.5 px-3.5 rounded-md bg-text-primary text-text-inverse text-[12px] font-semibold hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckCircle2 size={12} />
                          Confirm edit
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="h-8 flex items-center px-3 rounded-md border border-border text-[12px] text-text-tertiary hover:text-text-primary hover:border-[#3e3e4a] transition-colors"
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
                        className="h-8 flex items-center gap-1.5 px-3.5 rounded-md bg-text-primary text-text-inverse text-[12px] font-semibold hover:opacity-80 transition-opacity"
                      >
                        <CheckCircle2 size={12} />
                        Approve
                      </button>
                      <button
                        onClick={() => startEdit(item)}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-md border border-border text-[12px] text-text-secondary hover:text-text-primary hover:border-[#3e3e4a] transition-colors"
                      >
                        <Pencil size={12} />
                        Edit &amp; Approve
                      </button>
                      <button
                        onClick={() => resolve(item.id, "rejected")}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-md border border-border text-[12px] text-text-tertiary hover:text-red-400 hover:border-red-800/50 transition-colors"
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
