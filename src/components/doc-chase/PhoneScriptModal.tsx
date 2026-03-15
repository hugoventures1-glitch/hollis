"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Phone } from "lucide-react";

interface PhoneScriptModalProps {
  requestId: string;
  open: boolean;
  onClose: () => void;
  onMarkedCalled: () => void;
}

interface MessageDetail {
  id: string;
  touch_number: number;
  channel: string;
  phone_script: string | null;
}

interface RequestDetail {
  id: string;
  client_name: string;
  document_type: string;
  messages: MessageDetail[];
}

export function PhoneScriptModal({
  requestId,
  open,
  onClose,
  onMarkedCalled,
}: PhoneScriptModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !requestId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/doc-chase/${requestId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (!d.messages) setError("Could not load script");
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [open, requestId]);

  const touch4 = data?.messages?.find(
    (m) => m.touch_number === 4 && m.channel === "phone_script"
  );
  const script = touch4?.phone_script ?? "";
  const bullets = script
    .split(/\n+/)
    .map((s) => s.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);

  async function handleMarkCalled() {
    if (!requestId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/doc-chase/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "received" }),
      });
      if (res.ok) {
        onMarkedCalled();
        onClose();
      } else {
        const d = await res.json();
        setError(d.error ?? "Failed to update");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#111118] border border-[#1e1e2a] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2a] shrink-0">
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-[#9e9e9e]" />
            <span className="text-[15px] font-semibold text-[#f5f5f7]">
              Phone Script
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={22} className="animate-spin text-zinc-500" />
            </div>
          ) : error ? (
            <p className="text-[13px] text-red-400">{error}</p>
          ) : data ? (
            <>
              <div className="mb-4">
                <p className="text-[12px] text-zinc-500">Calling about</p>
                <p className="text-[14px] font-medium text-[#f5f5f7]">
                  {data.client_name}
                </p>
                <p className="text-[13px] text-zinc-400 mt-0.5">
                  {data.document_type}
                </p>
              </div>

              {bullets.length > 0 ? (
                <ul className="space-y-2 list-none">
                  {bullets.map((point, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-[14px] text-[#c5c5cb] leading-relaxed"
                    >
                      <span className="text-[#9e9e9e] shrink-0">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-zinc-500">
                  No script available for this request.
                </p>
              )}
            </>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-[#1e1e2a] bg-[#0C0C0C] shrink-0">
          <button
            onClick={handleMarkCalled}
            disabled={submitting || loading}
            className="w-full h-9 flex items-center justify-center gap-2 rounded-md bg-[#FAFAFA] hover:bg-[#E8E8E8] text-[#0C0C0C] text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Updating…
              </>
            ) : (
              "Mark as Called"
            )}
          </button>
          <p className="text-[11px] text-[#6b6b6b] mt-2 text-center">
            Marks the document as received and cancels pending follow-ups
          </p>
        </div>
      </div>
    </>
  );
}
