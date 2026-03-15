"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";
import type { InsurerTerms } from "@/types/renewals";

interface InsurerTermsPanelProps {
  policyId: string;
  terms: InsurerTerms[];
  priorPremium?: number | null;
}

export function InsurerTermsPanel({ policyId, terms, priorPremium }: InsurerTermsPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [insurerName, setInsurerName] = useState("");
  const [rawText, setRawText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!rawText.trim() || !insurerName.trim()) {
      toast("Enter insurer name and paste terms text", "error");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policyId}/insurer-terms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            insurer_name: insurerName.trim(),
            raw_input_text: rawText.trim(),
            prior_premium: priorPremium ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to parse terms");
        toast("Terms parsed and saved");
        setShowForm(false);
        setInsurerName("");
        setRawText("");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed", "error");
      }
    });
  };

  const handleToggleRecommend = (termId: string, current: boolean) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policyId}/insurer-terms/${termId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_recommended: !current }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Update failed");
        }
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed", "error");
      }
    });
  };

  return (
    <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest">
          Insurer Quotes
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff06] text-[#8a8a8a] hover:bg-[#ffffff0a] hover:text-[#FAFAFA] transition-colors disabled:opacity-50"
        >
          <Plus size={12} />
          Add Quote
        </button>
      </div>

      {/* Add quote form */}
      {showForm && (
        <div className="rounded-lg bg-[#0C0C0C] border border-[#1C1C1C] p-4 space-y-3">
          <div className="text-[12px] text-[#8a8a8a]">
            Paste the insurer renewal letter or key terms below. Claude will parse and structure it.
          </div>
          <input
            type="text"
            value={insurerName}
            onChange={e => setInsurerName(e.target.value)}
            placeholder="Insurer name (e.g. Zurich, QBE, Allianz)"
            className="block w-full text-[13px] bg-[#111111] border border-[#2a2a35] rounded-lg px-3 py-2 text-[#FAFAFA] placeholder-[#6b6b6b] focus:outline-none focus:border-[#555555]"
          />
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder="Paste insurer renewal terms, quote letter, or key conditions here…"
            rows={6}
            className="block w-full text-[13px] bg-[#111111] border border-[#2a2a35] rounded-lg px-3 py-2 text-[#FAFAFA] placeholder-[#6b6b6b] focus:outline-none focus:border-[#555555] resize-none font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={isPending || !rawText.trim() || !insurerName.trim()}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#FAFAFA]/[0.06] text-[#FAFAFA] hover:bg-[#FAFAFA]/20 transition-colors disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Parsing with Claude…
                </>
              ) : (
                "Parse & Save"
              )}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-[12px] px-3 py-1.5 rounded-lg text-[#8a8a8a] hover:text-[#8a8a8a] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Terms cards */}
      {terms.length === 0 && !showForm && (
        <div className="text-[13px] text-[#6b6b6b] py-4 text-center">
          No quotes added yet. Add quotes to compare insurers.
        </div>
      )}

      {terms.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {terms.map((term) => {
            const isExpanded = expandedId === term.id;
            const changeColor =
              term.premium_change === null
                ? "text-[#8a8a8a]"
                : term.premium_change > 0
                ? "text-red-400"
                : "text-[#4ade80]";

            return (
              <div
                key={term.id}
                className={`rounded-xl border p-4 space-y-3 transition-colors ${
                  term.is_recommended
                    ? "bg-[#16a34a]/[0.06] border-[#16a34a]/30"
                    : "bg-[#0C0C0C] border-[#1C1C1C]"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-[#FAFAFA]">{term.insurer_name}</div>
                    {term.effective_date && (
                      <div className="text-[11px] text-[#6b6b6b] mt-0.5">
                        Effective{" "}
                        {new Date(term.effective_date + "T00:00:00").toLocaleDateString("en-AU", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleRecommend(term.id, term.is_recommended)}
                    disabled={isPending}
                    title={term.is_recommended ? "Remove recommendation" : "Mark as recommended"}
                    className={`shrink-0 p-1 rounded-md transition-colors disabled:opacity-50 ${
                      term.is_recommended
                        ? "text-yellow-400 hover:text-yellow-300"
                        : "text-[#6b6b6b] hover:text-[#8a8a8a]"
                    }`}
                  >
                    <Star size={14} fill={term.is_recommended ? "currentColor" : "none"} />
                  </button>
                </div>

                {/* Premium */}
                <div className="flex items-baseline gap-3">
                  <div>
                    <div className="text-[11px] text-[#6b6b6b] uppercase tracking-wider">Premium</div>
                    <div className="text-[18px] font-bold text-[#FAFAFA]">
                      {term.quoted_premium !== null
                        ? `$${Number(term.quoted_premium).toLocaleString("en-AU")}`
                        : "—"}
                    </div>
                  </div>
                  {term.premium_change !== null && (
                    <div className={`text-[13px] font-medium ${changeColor}`}>
                      {term.premium_change > 0 ? "+" : ""}
                      {term.premium_change_pct !== null
                        ? `${term.premium_change_pct.toFixed(1)}%`
                        : `$${Math.abs(term.premium_change).toLocaleString()}`}
                    </div>
                  )}
                </div>

                {/* Payment terms */}
                {term.payment_terms && (
                  <div className="text-[12px] text-[#8a8a8a]">
                    <span className="text-[#6b6b6b]">Payment: </span>
                    {term.payment_terms}
                  </div>
                )}

                {/* Exclusions / conditions toggle */}
                {(term.new_exclusions.length > 0 || term.changed_conditions.length > 0) && (
                  <div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : term.id)}
                      className="flex items-center gap-1 text-[11px] text-[#8a8a8a] hover:text-[#8a8a8a] transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {term.new_exclusions.length} exclusion{term.new_exclusions.length !== 1 ? "s" : ""},{" "}
                      {term.changed_conditions.length} condition change{term.changed_conditions.length !== 1 ? "s" : ""}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        {term.new_exclusions.length > 0 && (
                          <div>
                            <div className="text-[11px] font-medium text-[#9e9e9e] mb-1">New Exclusions</div>
                            <ul className="space-y-1">
                              {term.new_exclusions.map((exc, i) => (
                                <li key={i} className="text-[12px] text-[#8a8a8a] flex gap-1.5">
                                  <span className="text-[#9e9e9e] shrink-0">•</span>
                                  {exc}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {term.changed_conditions.length > 0 && (
                          <div>
                            <div className="text-[11px] font-medium text-[#60a5fa] mb-1">Changed Conditions</div>
                            <ul className="space-y-1">
                              {term.changed_conditions.map((cond, i) => (
                                <li key={i} className="text-[12px] text-[#8a8a8a] flex gap-1.5">
                                  <span className="text-[#60a5fa] shrink-0">•</span>
                                  {cond}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {term.notes && (
                  <div className="text-[12px] text-[#8a8a8a] italic border-t border-[#1C1C1C] pt-2">
                    {term.notes}
                  </div>
                )}

                {term.is_recommended && (
                  <div className="text-[11px] font-semibold text-[#4ade80]">★ Recommended</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
