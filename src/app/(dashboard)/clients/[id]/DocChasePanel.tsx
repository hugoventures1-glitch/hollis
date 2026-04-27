"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText, X, MessageSquare,
  Loader2
} from "lucide-react";
import Link from "next/link";
import type { DocChaseRequestSummary } from "@/types/doc-chase";
import { ChaseRow, timeAgo, daysSince, ESCALATION_ORDER, EscalationIcon, escalationLabel, TouchDots } from "@/components/doc-chase/ChaseRow";

// ── Collapsed summary props ────────────────────────────────────────────────────

export interface DocChaseSummaryItem {
  id: string;
  document_type: string;
  status: string;
  escalation_level: string;
  created_at: string;
  last_client_reply: string | null;
  validation_status: "pass" | "fail" | "partial" | "unreadable" | null;
  validation_summary: string | null;
  validation_issues: string[] | null;
}

interface DocChasePanelProps {
  clientName: string;
  clientEmail: string | null;
  chases: DocChaseSummaryItem[];
  startChaseHref: string;
}


// ── Expanded modal ─────────────────────────────────────────────────────────────

function ExpandedModal({
  clientName,
  clientEmail,
  startChaseHref,
  onClose,
}: {
  clientName: string;
  clientEmail: string | null;
  startChaseHref: string;
  onClose: () => void;
}) {
  const [chases, setChases] = useState<DocChaseRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChases = useCallback(async () => {
    try {
      const res = await fetch("/api/doc-chase");
      if (!res.ok) return;
      const json = await res.json();
      const data: DocChaseRequestSummary[] = json.requests ?? [];
      const nameLower = clientName.toLowerCase();
      const emailLower = clientEmail?.toLowerCase() ?? null;
      const filtered = data.filter((r) => {
        if (emailLower && r.client_email?.toLowerCase() === emailLower) return true;
        return r.client_name?.toLowerCase().includes(nameLower);
      });
      setChases(filtered);
    } finally {
      setLoading(false);
    }
  }, [clientName, clientEmail]);

  async function handleStatusChange(id: string, status: "received" | "cancelled") {
    try {
      const res = await fetch(`/api/doc-chase/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      fetchChases();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchChases();
  }, [fetchChases]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const active   = chases.filter((c) => ["pending", "active"].includes(c.status));
  const resolved = chases.filter((c) => ["received", "cancelled"].includes(c.status));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col w-full rounded-2xl overflow-hidden"
        style={{
          maxWidth: 680,
          maxHeight: "82vh",
          background: "#0E0E0E",
          border: "1px solid #1C1C1C",
          animation: "dcExpand 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid #1A1A1A" }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-[#FAFAFA]">Doc Chase</span>
            <span className="text-[12px]" style={{ color: "#444" }}>{clientName}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={startChaseHref}
              className="text-[12px] px-3 py-1.5 rounded-md transition-colors"
              style={{ background: "#1A1A1A", border: "1px solid #252525", color: "#AAAAAA" }}
            >
              + New chase
            </Link>
            <button onClick={onClose} className="transition-colors hover:text-[#FAFAFA]" style={{ color: "#444" }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={16} className="animate-spin" style={{ color: "#333" }} />
            </div>
          ) : chases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FileText size={22} style={{ color: "#252525" }} />
              <p className="text-[13px]" style={{ color: "#333" }}>No doc chases for this client</p>
              <Link
                href={startChaseHref}
                className="text-[12px] transition-colors"
                style={{ color: "#444" }}
              >
                + Start a chase →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Active chases */}
              {active.length > 0 && (
                <div>
                  <div className="px-6 pt-5 pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#333" }}>
                      Active · {active.length}
                    </span>
                  </div>
                  {active.map((chase) => (
                    <ChaseRow key={chase.id} chase={chase} onForceSent={fetchChases} onStatusChange={handleStatusChange} showHistory={true} />
                  ))}
                </div>
              )}

              {/* Resolved */}
              {resolved.length > 0 && (
                <div>
                  <div className="px-6 pt-5 pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#333" }}>
                      Resolved · {resolved.length}
                    </span>
                  </div>
                  {resolved.map((chase) => (
                    <ChaseRow key={chase.id} chase={chase} showHistory={true} />
                  ))}

                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-3"
          style={{ borderTop: "1px solid #1A1A1A" }}
        >
          <span className="text-[12px]" style={{ color: "#333" }}>
            {chases.length} {chases.length === 1 ? "request" : "requests"} total
          </span>
          <Link
            href="/documents"
            className="text-[12px] transition-colors"
            style={{ color: "#444" }}
          >
            View all documents →
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes dcExpand {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}


// ── Main export ────────────────────────────────────────────────────────────────

export function DocChasePanel({ clientName, clientEmail, chases, startChaseHref }: DocChasePanelProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const active = chases.filter((c) => ["pending", "active"].includes(c.status));
  const hasReplies = chases.some((c) => c.last_client_reply);

  const openModal = useCallback(() => setModalOpen(true), []);

  return (
    <>
      {/* ── Card ─────────────────────────────────────────────────── */}
      <button
        onClick={openModal}
        className="w-full text-left rounded-xl p-6 flex flex-col gap-5 transition-colors group"
        style={{
          background: "#111111",
          border: "1px solid #1C1C1C",
          cursor: "pointer",
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div
            className="text-[12px] font-semibold uppercase tracking-widest transition-colors"
            style={{ color: "#444" }}
          >
            Doc Chase
          </div>
          {hasReplies && (
            <div className="flex items-center gap-1 text-[11px]" style={{ color: "#7BAFD4" }}>
              <MessageSquare size={10} />
              <span>Reply</span>
            </div>
          )}
        </div>

        {active.length > 0 ? (
          <>
            {/* Count */}
            <div className="flex items-end gap-2">
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 48,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: active.length > 0 ? "#FAFAFA" : "#333",
                }}
              >
                {active.length}
              </span>
              <span className="text-[13px] pb-1.5" style={{ color: "#444" }}>
                {active.length === 1 ? "active" : "active"}
              </span>
            </div>

            {/* Chase list — up to 3 */}
            <div className="flex flex-col gap-2">
              {active.slice(0, 3).map((chase) => (
                <div key={chase.id} className="flex items-center gap-2">
                  <EscalationIcon level={chase.escalation_level} size={11} />
                  <span
                    className="text-[12px] truncate flex-1"
                    style={{ color: "#AAAAAA" }}
                  >
                    {chase.document_type}
                  </span>
                  {chase.last_client_reply && (
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#7BAFD4" }} title="Client replied" />
                  )}
                </div>
              ))}
              {active.length > 3 && (
                <div className="text-[11px]" style={{ color: "#333" }}>
                  +{active.length - 3} more
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-auto">
              <span className="text-[13px]" style={{ color: "#333" }}>
                {chases.length} {chases.length === 1 ? "request" : "requests"} total
              </span>
              <span
                className="text-[13px] transition-colors group-hover:text-[#FAFAFA]"
                style={{ color: "#555" }}
              >
                Expand →
              </span>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2">
            <FileText size={18} style={{ color: "#252525" }} />
            <span className="text-[13px]" style={{ color: "#333" }}>No active chases</span>
            <Link
              href={startChaseHref}
              onClick={(e) => e.stopPropagation()}
              className="text-[12px] transition-colors text-[#444] hover:text-[#FAFAFA] mt-1"
            >
              + Start a chase
            </Link>
          </div>
        )}
      </button>

      {/* ── Expanded modal ────────────────────────────────────────── */}
      {modalOpen && (
        <ExpandedModal
          clientName={clientName}
          clientEmail={clientEmail}
          startChaseHref={startChaseHref}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
