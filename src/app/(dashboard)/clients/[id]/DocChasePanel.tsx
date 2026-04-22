"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, Mail, Phone, PhoneCall, X, MessageSquare,
  Clock, AlertCircle, CheckCircle, Loader2, Upload, ShieldCheck, ShieldAlert, ShieldX
} from "lucide-react";
import Link from "next/link";
import type { DocChaseRequestSummary } from "@/types/doc-chase";

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const ESCALATION_ORDER = ["email", "sms", "phone_script"] as const;

function EscalationIcon({ level, size = 11 }: { level: string; size?: number }) {
  if (level === "sms") return <MessageSquare size={size} />;
  if (level === "phone_script") return <PhoneCall size={size} />;
  return <Mail size={size} />;
}

function escalationLabel(level: string): string {
  if (level === "sms") return "SMS";
  if (level === "phone_script") return "Phone";
  return "Email";
}

function urgencyColor(chase: DocChaseRequestSummary): string {
  const days = daysSince(chase.created_at);
  if (chase.touches_sent >= chase.touches_total) return "#FF4444";
  if (days > 14) return "#F59E0B";
  return "#AAAAAA";
}

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

// ── Touch progress dots ────────────────────────────────────────────────────────

function TouchDots({ sent, total }: { sent: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full transition-colors"
          style={{ background: i < sent ? "#FAFAFA" : "#252525" }}
        />
      ))}
      <span className="text-[11px] ml-1" style={{ color: "#444" }}>
        {sent}/{total}
      </span>
    </div>
  );
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
                    <ChaseRow key={chase.id} chase={chase} onForceSent={fetchChases} />
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
                    <ChaseRow key={chase.id} chase={chase} />
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

// ── Individual chase row ───────────────────────────────────────────────────────

function ChaseRow({ chase, onForceSent }: { chase: DocChaseRequestSummary; onForceSent?: () => void }) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ verdict: string; summary: string; issues: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isResolved  = chase.status === "received" || chase.status === "cancelled";
  const isOverdue   = !isResolved && chase.touches_sent >= chase.touches_total;
  const hasReply    = !!chase.last_client_reply;
  const escalIdx    = ESCALATION_ORDER.indexOf(chase.escalation_level as typeof ESCALATION_ORDER[number]);
  const daysIn      = daysSince(chase.created_at);
  const canForceSend = !isResolved && chase.touches_sent < chase.touches_total;
  const canUpload    = !isResolved;

  // Validation result — prefer fresh uploadResult over DB value
  const validationStatus = uploadResult?.verdict ?? chase.validation_status ?? null;
  const validationSummary = uploadResult?.summary ?? chase.validation_summary ?? null;
  const validationIssues = uploadResult?.issues ?? chase.validation_issues ?? null;

  async function handleForceSend(e: React.MouseEvent) {
    e.stopPropagation();
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/doc-chase/${chase.id}/send-next`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        setSendError(json.error ?? "Send failed");
      } else {
        onForceSent?.();
      }
    } catch {
      setSendError("Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/doc-chase/${chase.id}/validate-document`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadResult({ verdict: "unreadable", summary: json.error ?? "Upload failed", issues: [] });
      } else {
        setUploadResult({ verdict: json.verdict, summary: json.summary, issues: json.issues ?? [] });
        if (json.verdict === "pass") {
          onForceSent?.(); // refresh — chase moves to resolved
        }
      }
    } catch {
      setUploadResult({ verdict: "unreadable", summary: "Upload failed — please try again", issues: [] });
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-uploaded
      e.target.value = "";
    }
  }

  return (
    <div
      className="px-6 py-4 flex items-start gap-4 transition-colors hover:bg-white/[0.02]"
      style={{ borderBottom: "1px solid #111111" }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isResolved ? "#0D1A0D" : isOverdue ? "#1A0D0D" : "#111",
          border: `1px solid ${isResolved ? "#1A3A1A" : isOverdue ? "#3A1A1A" : "#1C1C1C"}`,
        }}
      >
        <FileText size={13} style={{ color: isResolved ? "#00D97E" : isOverdue ? "#FF4444" : "#555" }} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[13px] font-medium leading-tight"
            style={{ color: isResolved ? "#555" : "#FAFAFA" }}
          >
            {chase.document_type}
          </span>
          {/* Status badges */}
          <div className="flex items-center gap-2 shrink-0">
            {chase.status === "received" && validationStatus === "pass" && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#00D97E" }}>
                <ShieldCheck size={10} /> Validated
              </span>
            )}
            {chase.status === "received" && validationStatus === "partial" && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#F59E0B" }}>
                <ShieldAlert size={10} /> Partial match
              </span>
            )}
            {chase.status === "received" && (validationStatus === "fail" || validationStatus === "unreadable") && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#FF6B6B" }}>
                <ShieldX size={10} /> Review needed
              </span>
            )}
            {chase.status === "received" && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#00D97E" }}>
                <CheckCircle size={10} /> Received
              </span>
            )}
            {chase.status === "cancelled" && (
              <span className="text-[11px] font-medium" style={{ color: "#3A3A3A" }}>Cancelled</span>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#FF4444" }}>
                <AlertCircle size={10} /> Overdue
              </span>
            )}
          </div>
        </div>

        {/* Touch progress + escalation */}
        {!isResolved && (
          <div className="flex items-center gap-3 flex-wrap">
            <TouchDots sent={chase.touches_sent} total={chase.touches_total} />

            {/* Escalation funnel */}
            <div className="flex items-center gap-1">
              {ESCALATION_ORDER.map((lvl, idx) => (
                <div
                  key={lvl}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                  style={{
                    background: idx <= escalIdx ? "#1A1A1A" : "transparent",
                    border: idx <= escalIdx ? "1px solid #252525" : "1px solid transparent",
                    color: idx === escalIdx ? "#AAAAAA" : idx < escalIdx ? "#555" : "#2A2A2A",
                  }}
                >
                  <EscalationIcon level={lvl} size={9} />
                  <span className="ml-0.5">{escalationLabel(lvl)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-[11px]" style={{ color: "#333" }}>
            <Clock size={9} />
            {daysIn === 0 ? "Started today" : `${daysIn}d in chase`}
          </span>
          {chase.last_contact && (
            <span className="text-[11px]" style={{ color: "#333" }}>
              Last touch: {timeAgo(chase.last_contact)}
            </span>
          )}
          {canForceSend && (
            <button
              onClick={handleForceSend}
              disabled={sending || uploading}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{
                background: sending ? "#151515" : "#1A1A1A",
                border: "1px solid #252525",
                color: sending ? "#444" : "#AAAAAA",
                cursor: (sending || uploading) ? "not-allowed" : "pointer",
              }}
            >
              {sending ? (
                <Loader2 size={9} className="animate-spin" />
              ) : (
                <Mail size={9} />
              )}
              {sending ? "Sending…" : "Force send"}
            </button>
          )}
          {canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={uploading || sending}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors"
                style={{
                  background: uploading ? "#151515" : "#1A1A1A",
                  border: "1px solid #252525",
                  color: uploading ? "#444" : "#AAAAAA",
                  cursor: (uploading || sending) ? "not-allowed" : "pointer",
                }}
              >
                {uploading ? (
                  <Loader2 size={9} className="animate-spin" />
                ) : (
                  <Upload size={9} />
                )}
                {uploading ? "Validating…" : "Upload doc"}
              </button>
            </>
          )}
          {sendError && (
            <span className="text-[11px]" style={{ color: "#FF4444" }}>{sendError}</span>
          )}
        </div>

        {/* Validation result (from upload or existing DB value) */}
        {validationStatus && validationStatus !== "pass" && validationSummary && (
          <div
            className="mt-1 px-2.5 py-1.5 rounded-md text-[12px] leading-snug"
            style={{
              background: validationStatus === "partial" ? "#1A1500" : "#1A0A0A",
              border: `1px solid ${validationStatus === "partial" ? "#3A2A00" : "#3A1A1A"}`,
              color: validationStatus === "partial" ? "#D4A800" : "#FF8888",
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: validationStatus === "partial" ? "#6A5000" : "#6A2A2A" }}
            >
              {validationStatus === "partial" ? "Partial match" : validationStatus === "unreadable" ? "Unreadable" : "Wrong document"}
            </span>
            {validationSummary}
            {validationIssues && validationIssues.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {validationIssues.map((issue, i) => (
                  <li key={i} className="text-[11px]">{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Validation summary for resolved + passed */}
        {isResolved && validationStatus === "pass" && validationSummary && (
          <div
            className="mt-1 px-2.5 py-1.5 rounded-md text-[12px] leading-snug"
            style={{ background: "#0D1A0D", border: "1px solid #1A3A1A", color: "#5A9A5A" }}
          >
            {validationSummary}
          </div>
        )}

        {/* Client reply */}
        {hasReply && (
          <div
            className="mt-1 px-2.5 py-1.5 rounded-md text-[12px] leading-snug"
            style={{
              background: "#0D1A2A",
              border: "1px solid #1A2A3A",
              color: "#7BAFD4",
            }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#2A4A6A", display: "block", marginBottom: 2 }}>
              Client replied {chase.last_client_reply_at ? timeAgo(chase.last_client_reply_at) : ""}
            </span>
            {chase.last_client_reply}
          </div>
        )}
      </div>
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
              {active.slice(0, 3).map((chase) => {
                const isOverdue = false; // touches not computed server-side — shown in modal
                return (
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
                );
              })}
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
