"use client";

import { useState } from "react";
import { Send, Trash2, RefreshCw, Loader2, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import DraftEditDrawer from "@/components/outbox/DraftEditDrawer";
import type { Draft } from "@/components/outbox/DraftEditDrawer";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

interface OutboxClientProps {
  initialDrafts: Draft[];
}

export default function OutboxClient({ initialDrafts }: OutboxClientProps) {
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? null;

  const handleDismiss = async (id: string) => {
    const supabase = createClient();
    await supabase
      .from("outbox_drafts")
      .update({ status: "dismissed" })
      .eq("id", id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSent = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setActiveDraftId(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setGenerateMsg(null);
    try {
      const res = await fetch("/api/renewals/generate-drafts", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate drafts");
      if (data.generated === 0) {
        setGenerateMsg(
          "No new drafts to generate — all eligible policies already have drafts."
        );
      } else {
        setGenerateMsg(
          `Generated ${data.generated} new draft${
            data.generated !== 1 ? "s" : ""
          }. Refreshing…`
        );
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C] text-[#FAFAFA]">
      {/* Header */}
      <header className="h-[56px] shrink-0 border-b border-[#1C1C1C] flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-[#FAFAFA] text-[15px] font-semibold">
            Drafts
          </span>
          {drafts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] text-[11px] font-semibold text-[#FAFAFA]">
              {drafts.length} pending draft{drafts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="h-8 flex items-center gap-2 px-4 rounded-md bg-[#1a1a24] border border-[#1C1C1C] text-[13px] text-[#555555] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          Generate New Drafts
        </button>
      </header>

      {/* Status messages */}
      {(generateMsg || generateError) && (
        <div
          className={`mx-6 mt-4 px-4 py-2.5 rounded-lg text-[13px] border ${
            generateError
              ? "bg-red-950/30 border-red-800/30 text-red-400"
              : "bg-[#FAFAFA]/[0.04] border-[#1C1C1C] text-[#FAFAFA]"
          }`}
        >
          {generateError ?? generateMsg}
        </div>
      )}

      {/* Draft list or empty state */}
      {drafts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="w-14 h-14 rounded-full bg-[#111111] border border-[#1C1C1C] flex items-center justify-center mb-4">
            <Inbox size={22} className="text-[#333333]" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#FAFAFA] mb-1">
            All caught up
          </h2>
          <p className="text-[13px] text-[#333333] max-w-xs">
            No pending drafts. Click &ldquo;Generate New Drafts&rdquo; to
            create renewal outreach emails for upcoming expirations.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-3 max-w-2xl">
            {drafts.map((draft) => {
              const policy = draft.policies;
              const days = policy ? daysUntil(policy.expiration_date) : null;
              const urgencyColor =
                days !== null && days <= 14
                  ? "text-red-400"
                  : days !== null && days <= 30
                  ? "text-[#888888]"
                  : "text-[#FAFAFA]";

              const bodyPreview = draft.body
                .split("\n")
                .filter(Boolean)
                .slice(0, 2)
                .join(" ")
                .slice(0, 160);

              return (
                <div
                  key={draft.id}
                  className="bg-[#111111] border border-[#1C1C1C] rounded-xl p-5 hover:border-[#1C1C1C] transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[13px] font-bold text-[#FAFAFA]">
                        {policy?.client_name.charAt(0).toUpperCase() ?? "?"}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <span className="text-[14px] font-semibold text-[#FAFAFA] truncate">
                          {policy?.client_name ?? "Unknown Client"}
                        </span>
                        {days !== null && (
                          <span
                            className={`text-[12px] font-semibold shrink-0 ${urgencyColor}`}
                          >
                            {days}d
                          </span>
                        )}
                      </div>

                      <div className="text-[13px] font-medium text-[#555555] mb-1.5 truncate">
                        {draft.subject}
                      </div>

                      <p className="text-[12px] text-[#333333] leading-relaxed line-clamp-2">
                        {bodyPreview}
                        {draft.body.length > 160 ? "…" : ""}
                      </p>

                      {policy?.carrier && (
                        <div className="mt-2 text-[11px] text-[#333333]">
                          {policy.carrier}
                          {policy.policy_name ? ` · ${policy.policy_name}` : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#1a1a24]">
                    <button
                      onClick={() => setActiveDraftId(draft.id)}
                      className="h-8 flex items-center gap-1.5 px-3.5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors"
                    >
                      <Send size={12} />
                      Edit &amp; Send
                    </button>
                    <button
                      onClick={() => handleDismiss(draft.id)}
                      className="h-8 flex items-center gap-1.5 px-3 rounded-md border border-[#1C1C1C] text-[12px] text-[#333333] hover:text-red-400 hover:border-red-800/50 transition-colors"
                    >
                      <Trash2 size={12} />
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit & Send drawer */}
      {activeDraft && (
        <DraftEditDrawer
          draft={activeDraft}
          onClose={() => setActiveDraftId(null)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
