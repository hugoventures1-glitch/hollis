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
  not_renewing:      { label: "Not renewing",       color: "#FF4444" },
  shopping_around:   { label: "Shopping around",    color: "#F59E0B" },
  requesting_review: { label: "Wants review",       color: "#60a5fa" },
  price_concern:     { label: "Price concern",      color: "#F59E0B" },
  claim_related:     { label: "Claim related",      color: "#FF4444" },
  silent:            { label: "No response",        color: "#555555" },
  unknown:           { label: "Unclear",            color: "#555555" },
};

export function SignalModal({ policyId, clientName, onClose, onSignalLogged }: SignalModalProps) {
  const [text,        setText]        = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [result,      setResult]      = useState<{ intent: IntentResult; tier: number } | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on open
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Close on Escape
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
        style={{ background: "#111111", border: "1px solid #1E1E1E", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid #1A1A1A" }}>
          <div>
            <p className="text-[15px] font-semibold text-[#FAFAFA]">Log client response</p>
            <p className="text-[12px] text-[#555555] mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "#555555" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#FAFAFA")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#555555")}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              <div>
                <p className="text-[12px] text-[#555555] mb-2 leading-relaxed">
                  Paste what the client said — email reply, call notes, SMS, anything. Hollis will classify their intent and decide how to respond.
                </p>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder={`e.g. "Hi, yes happy to renew — can you send through the paperwork?"\n\nor: "Called Linda, said she's getting quotes from another broker."`}
                  className="w-full rounded-lg border border-[#1C1C1C] bg-[#0C0C0C] px-4 py-3 text-[13px] text-[#f5f5f7] placeholder-[#333333] focus:outline-none focus:border-[#333333] resize-none leading-relaxed transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
                  }}
                />
                <p className="text-[11px] text-[#2a2a2a] mt-1.5">⌘ + Enter to submit</p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: "#1A0000", border: "1px solid #3f0000" }}>
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-400">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!text.trim() || submitting}
                className="w-full h-10 rounded-lg text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                style={{
                  background: !text.trim() || submitting ? "#1A1A1A" : "#FAFAFA",
                  color:      !text.trim() || submitting ? "#333333" : "#0C0C0C",
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
            /* Result view */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} style={{ color: "#00d4aa" }} />
                <p className="text-[14px] font-medium text-[#FAFAFA]">Signal classified</p>
              </div>

              {/* Intent badge */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: "#0C0C0C", border: "1px solid #1A1A1A" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#444444] uppercase tracking-wider">Intent</span>
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
                  <span className="text-[11px] text-[#444444] uppercase tracking-wider">Confidence</span>
                  <span className="text-[13px] font-mono text-[#FAFAFA]">{confidencePct}%</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#444444] uppercase tracking-wider">Routed to</span>
                  <span className="text-[13px] text-[#FAFAFA]">
                    {result.tier === 1 ? "Tier 1 — Hollis acts autonomously"
                     : result.tier === 2 ? "Tier 2 — queued for your review"
                     : "Tier 3 — escalated to you now"}
                  </span>
                </div>

                {result.intent.reasoning && (
                  <div>
                    <span className="text-[11px] text-[#444444] uppercase tracking-wider block mb-1.5">Reasoning</span>
                    <p className="text-[12px] text-[#666666] leading-relaxed">{result.intent.reasoning}</p>
                  </div>
                )}

                {result.intent.flags_detected?.length > 0 && (
                  <div>
                    <span className="text-[11px] text-[#444444] uppercase tracking-wider block mb-1.5">Flags raised</span>
                    <div className="flex flex-wrap gap-1.5">
                      {result.intent.flags_detected.map((flag) => (
                        <span
                          key={flag}
                          className="text-[11px] px-2 py-0.5 rounded"
                          style={{ background: "#1A1A1A", color: "#888888", border: "1px solid #222222" }}
                        >
                          {flag.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {result.tier === 2 && (
                <p className="text-[12px] text-[#555555]">
                  Check the <strong className="text-[#888888]">Review</strong> tab to approve or edit the proposed action.
                </p>
              )}

              <button
                onClick={onClose}
                className="w-full h-9 rounded-lg text-[13px] transition-colors"
                style={{ background: "#1C1C1C", color: "#888888", border: "1px solid #222222" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#FAFAFA")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#888888")}
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
