"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface IntentResult {
  intent: string;
  confidence: number;
  reasoning: string;
  flags_detected: string[];
}

interface SignalModalProps {
  policyId: string;
  clientName: string;
  onClose: () => void;
  onSignalLogged?: (intent: string, tier: number) => void;
}

const INTENT_LABELS: Record<string, { label: string; color: string }> = {
  renewing:          { label: "Renewing",          color: "#00d4aa" },
  not_renewing:      { label: "Not renewing",       color: "var(--danger)" },
  shopping_around:   { label: "Shopping around",    color: "#F59E0B" },
  requesting_review: { label: "Wants review",       color: "#60a5fa" },
  price_concern:     { label: "Price concern",      color: "#F59E0B" },
  claim_related:     { label: "Claim related",      color: "var(--danger)" },
  silent:            { label: "No response",        color: "var(--text-secondary)" },
  unknown:           { label: "Unclear",            color: "var(--text-secondary)" },
};

export function SignalModal({ policyId, clientName, onClose, onSignalLogged }: SignalModalProps) {
  const [text,        setText]        = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [result,      setResult]      = useState<{ intent: IntentResult; tier: number } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/agent/signal", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ policy_id: policyId, raw_signal: text.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Signal failed");

      const intent: IntentResult = data.classification;
      const tier: number         = data.tier_decision?.tier ?? 1;

      setResult({ intent, tier });
      onSignalLogged?.(intent.intent, tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const intentMeta = result ? (INTENT_LABELS[result.intent.intent] ?? INTENT_LABELS.unknown) : null;
  const confidencePct = result ? Math.round(result.intent.confidence * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative rounded-2xl w-full max-w-[480px] mx-4"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Log client response</p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              <div>
                <p className="text-[12px] mb-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Paste what the client said — email reply, call notes, SMS, anything. Hollis will classify their intent and decide how to respond.
                </p>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder={`e.g. "Hi, yes happy to renew — can you send through the paperwork?"\n\nor: "Called Linda, said she's getting quotes from another broker."`}
                  className="w-full rounded-lg px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed transition-colors"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
                  }}
                />
                <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>⌘ + Enter to submit</p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-950/40 border border-red-800/50">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
                className="w-full h-10 rounded-lg text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                style={{
                  background: !text.trim() || submitting ? "var(--surface-raised)" : "var(--text-primary)",
                  color:      !text.trim() || submitting ? "var(--text-tertiary)" : "var(--text-inverse)",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Classifying…
                  </>
                ) : (
                  "Send to Hollis"
                )}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} style={{ color: "#00d4aa" }} />
                <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>Signal classified</p>
              </div>

              {/* Intent badge */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--background)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Intent</span>
                  <span
                    className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: `${intentMeta?.color}18`,
                      color:       intentMeta?.color,
                      border:      `1px solid ${intentMeta?.color}33`,
                    }}
                  >
                    {intentMeta?.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Confidence</span>
                  <span className="text-[13px] font-mono" style={{ color: "var(--text-primary)" }}>{confidencePct}%</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Routed to</span>
                  <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                    {result.tier === 1 ? "Tier 1 — Hollis acts autonomously"
                     : result.tier === 2 ? "Tier 2 — queued for your review"
                     : "Tier 3 — escalated to you now"}
                  </span>
                </div>

                {result.intent.reasoning && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Reasoning</span>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{result.intent.reasoning}</p>
                  </div>
                )}

                {result.intent.flags_detected?.length > 0 && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Flags raised</span>
                    <div className="flex flex-wrap gap-1.5">
                      {result.intent.flags_detected.map((flag) => (
                        <span
                          key={flag}
                          className="text-[11px] px-2 py-0.5 rounded"
                          style={{ background: "var(--surface-raised)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                        >
                          {flag.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {result.tier === 2 && (
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  Check the <strong style={{ color: "var(--text-primary)" }}>Review</strong> tab to approve or edit the proposed action.
                </p>
              )}

              <button
                onClick={onClose}
                className="w-full h-9 rounded-lg text-[13px] transition-colors"
                style={{ background: "var(--surface-raised)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
