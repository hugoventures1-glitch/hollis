"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Send, Loader2, Calendar, Building2 } from "lucide-react";

export interface DraftPolicy {
  client_name: string;
  carrier: string | null;
  expiration_date: string;
  policy_name: string | null;
}

export interface Draft {
  id: string;
  subject: string;
  body: string;
  policies: DraftPolicy | null;
}

interface DraftEditDrawerProps {
  draft: Draft;
  onClose: () => void;
  onSent: (id: string) => void;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

export default function DraftEditDrawer({
  draft,
  onClose,
  onSent,
}: DraftEditDrawerProps) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/outbox/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Send failed");
      }
      onSent(draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const policy = draft.policies;
  const days = policy ? daysUntil(policy.expiration_date) : null;
  const urgencyColor =
    days !== null && days <= 14
      ? "text-red-400"
      : days !== null && days <= 30
      ? "text-[#888888]"
      : "text-[#FAFAFA]";

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="w-[560px] shrink-0 bg-[#111118] border-l border-[#1e1e2a] flex flex-col h-full shadow-[−24px_0_60px_rgba(0,0,0,0.5)]">

        {/* Header */}
        <div className="h-14 shrink-0 border-b border-[#1e1e2a] flex items-center justify-between px-6">
          <span className="text-[14px] font-semibold text-[#f5f5f7]">Review Draft</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#505057] hover:text-[#f5f5f7] hover:bg-white/[0.06] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Client meta */}
        {policy && (
          <div className="px-6 py-4 border-b border-[#1e1e2a] bg-[#0C0C0C] flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shrink-0">
              <span className="text-[13px] font-bold text-[#FAFAFA]">
                {policy.client_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[#f5f5f7] truncate">
                {policy.client_name}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {policy.carrier && (
                  <span className="flex items-center gap-1 text-[12px] text-[#505057]">
                    <Building2 size={11} />
                    {policy.carrier}
                  </span>
                )}
                {days !== null && (
                  <span className={`flex items-center gap-1 text-[12px] font-semibold ${urgencyColor}`}>
                    <Calendar size={11} />
                    {days}d until expiry
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Editable fields */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Subject */}
          <div>
            <label className="block text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-2">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-4 py-2.5 text-[14px] text-[#f5f5f7] placeholder-[#6b6b6b] outline-none focus:border-[#555555] transition-colors"
            />
          </div>

          {/* Body */}
          <div className="flex flex-col flex-1">
            <label className="block text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-2">
              Email Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-4 py-3 text-[14px] text-[#f5f5f7] placeholder-[#6b6b6b] outline-none focus:border-[#555555] transition-colors resize-none leading-relaxed font-mono"
            />
            <div className="text-[11px] text-[#6b6b6b] mt-1.5 text-right">
              {body.split(/\s+/).filter(Boolean).length} words
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[13px] text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-2.5">
              <span>⚠</span> {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-[#1e1e2a] px-6 py-4 flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !body.trim()}
            className="h-9 flex items-center gap-2 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {sending ? "Sending…" : "Send Email"}
          </button>
          <button
            onClick={onClose}
            disabled={sending}
            className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
          >
            Cancel
          </button>
          <span className="ml-auto text-[11px] text-[#6b6b6b]">
            Agent reviews before sending
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
