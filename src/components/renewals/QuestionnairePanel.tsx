"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Check, X, Loader2, ClipboardCopy, RefreshCw } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";
import type { RenewalQuestionnaire, QuestionnaireSuggestions } from "@/types/renewals";

interface QuestionnairePanelProps {
  policyId: string;
  questionnaires: RenewalQuestionnaire[];
}

export function QuestionnairePanel({ policyId, questionnaires }: QuestionnairePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());

  const latest = questionnaires[0] ?? null;
  const daysSinceSent = latest
    ? Math.floor((Date.now() - new Date(latest.sent_at).getTime()) / 86400000)
    : null;

  const handleSend = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policyId}/questionnaire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to send questionnaire");
        toast("Questionnaire sent to client");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed", "error");
      }
    });
  };

  const handleCopyLink = async (token: string) => {
    const url = `${window.location.origin}/q/${token}`;
    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard");
  };

  const handleDismiss = (i: number) => {
    setDismissedSuggestions(prev => new Set([...prev, i]));
  };

  const suggestions: QuestionnaireSuggestions | null = latest?.ai_suggestions ?? null;
  const visibleSuggestions = suggestions?.suggested_updates.filter((_, i) => !dismissedSuggestions.has(i)) ?? [];

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest">
          Client Questionnaire
        </div>
        {(!latest || latest.status === "responded") && (
          <button
            onClick={handleSend}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#4f46e5]/10 text-[#818cf8] hover:bg-[#4f46e5]/20 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {latest?.status === "responded" ? "Send Again" : "Send Questionnaire"}
          </button>
        )}
      </div>

      {/* Status */}
      {!latest && (
        <div className="text-[13px] text-[#505057] py-2">
          No questionnaire sent yet. Send one to capture client&apos;s current risk details.
        </div>
      )}

      {latest && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border ${
              latest.status === "responded"
                ? "bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20"
                : latest.status === "expired"
                ? "bg-red-900/20 text-red-400 border-red-800/30"
                : "bg-[#4f46e5]/10 text-[#818cf8] border-[#4f46e5]/20"
            }`}>
              {latest.status === "responded" && <Check size={11} />}
              {latest.status === "responded" ? "Responded" : latest.status === "expired" ? "Expired" : "Awaiting Response"}
            </span>
            <span className="text-[12px] text-[#505057]">
              Sent {daysSinceSent === 0 ? "today" : `${daysSinceSent}d ago`}
            </span>
            {latest.responded_at && (
              <span className="text-[12px] text-[#505057]">
                Responded{" "}
                {new Date(latest.responded_at).toLocaleDateString("en-AU", {
                  day: "numeric", month: "short",
                })}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {latest.status === "sent" && (
              <>
                <button
                  onClick={() => handleCopyLink(latest.token)}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff06] text-zinc-400 hover:bg-[#ffffff0a] hover:text-zinc-300 transition-colors"
                >
                  <ClipboardCopy size={12} />
                  Copy Link
                </button>
                <button
                  onClick={handleSend}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff06] text-zinc-400 hover:bg-[#ffffff0a] hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Resend Reminder
                </button>
              </>
            )}
          </div>

          {/* AI Suggestions */}
          {latest.status === "responded" && suggestions && (
            <div className="space-y-3 pt-1">
              {suggestions.summary && (
                <div className="rounded-lg bg-[#0d0d12] border border-[#1e1e2a] px-4 py-3">
                  <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-1.5">
                    AI Summary
                  </div>
                  <p className="text-[13px] text-zinc-400 leading-relaxed">{suggestions.summary}</p>
                </div>
              )}

              {suggestions.risk_flags.length > 0 && (
                <div className="rounded-lg bg-amber-950/20 border border-amber-800/30 px-4 py-3">
                  <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-widest mb-1.5">
                    Risk Flags
                  </div>
                  <ul className="space-y-1">
                    {suggestions.risk_flags.map((flag, i) => (
                      <li key={i} className="text-[12px] text-amber-400/80 flex gap-1.5">
                        <span className="shrink-0">⚠</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {visibleSuggestions.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-2">
                    Suggested Policy Updates
                  </div>
                  <div className="space-y-2">
                    {visibleSuggestions.map((sug, i) => (
                      <div key={i} className="rounded-lg bg-[#0d0d12] border border-[#1e1e2a] px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-zinc-300 capitalize">
                              {sug.field.replace(/_/g, " ")}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {sug.current_value && (
                                <span className="text-[11px] text-zinc-600 line-through">{sug.current_value}</span>
                              )}
                              <span className="text-[11px] text-[#00d4aa]">→ {sug.suggested_value}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-1">{sug.reason}</div>
                          </div>
                          <button
                            onClick={() => handleDismiss(i)}
                            className="shrink-0 p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                            title="Dismiss"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {visibleSuggestions.length === 0 && suggestions.suggested_updates.length > 0 && (
                <div className="text-[12px] text-[#505057]">All suggestions reviewed.</div>
              )}
            </div>
          )}

          {/* Raw responses (collapsed by default) */}
          {latest.status === "responded" && latest.responses && (
            <details className="group">
              <summary className="text-[12px] text-zinc-500 hover:text-zinc-400 cursor-pointer list-none flex items-center gap-1">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                View raw responses
              </summary>
              <div className="mt-2 rounded-lg bg-[#0d0d12] border border-[#1e1e2a] p-3 space-y-2">
                {Object.entries(latest.responses).map(([q, a]) => (
                  <div key={q}>
                    <div className="text-[11px] text-zinc-500 mb-0.5">{q}</div>
                    <div className="text-[12px] text-zinc-300">{a}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
