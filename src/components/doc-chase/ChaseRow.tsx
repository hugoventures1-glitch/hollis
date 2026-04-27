"use client";

import { useState, useRef } from "react";
import {
  FileText, Mail, Phone, PhoneCall, X, MessageSquare,
  Clock, AlertCircle, CheckCircle, Loader2, Upload, ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronUp
} from "lucide-react";
import type { DocChaseRequestSummary, DocChaseRequestDetail, DocChaseMessage } from "@/types/doc-chase";

// ── Helpers ────────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export const ESCALATION_ORDER = ["email", "sms", "phone_script"] as const;

export function EscalationIcon({ level, size = 11 }: { level: string; size?: number }) {
  if (level === "sms") return <MessageSquare size={size} />;
  if (level === "phone_script") return <PhoneCall size={size} />;
  return <Mail size={size} />;
}

export function escalationLabel(level: string): string {
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

// ── Touch progress dots ────────────────────────────────────────────────────────

export function TouchDots({ sent, total }: { sent: number; total: number }) {
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

// ── Message history item ───────────────────────────────────────────────────────

function MessageHistoryItem({ msg }: { msg: DocChaseMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isSent = msg.status === "sent";
  const isScheduled = msg.status === "scheduled";
  const isCancelled = msg.status === "cancelled";

  const timestamp = isSent ? msg.sent_at : msg.scheduled_for;

  return (
    <div
      className="px-3 py-2 border-l-2 space-y-1"
      style={{
        borderColor: isCancelled ? "#252525" : "#1C1C1C",
        opacity: isCancelled ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Touch badge */}
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
          style={{ background: "#1A1A1A", color: "#555" }}
        >
          T{msg.touch_number}
        </span>

        {/* Channel icon + label */}
        <div className="flex items-center gap-0.5 text-[11px]" style={{ color: "#888" }}>
          <EscalationIcon level={msg.channel} size={9} />
          <span>{escalationLabel(msg.channel)}</span>
        </div>

        {/* Timestamp */}
        {timestamp && (
          <span className="text-[10px]" style={{ color: "#555" }}>
            {timeAgo(timestamp)}
          </span>
        )}

        {/* Status indicator */}
        <div className="flex items-center gap-1 ml-auto">
          {isSent && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#FAFAFA" }} />}
          {isScheduled && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#555" }} />}
          <span className="text-[10px]" style={{ color: isSent ? "#888" : isCancelled ? "#333" : "#666" }}>
            {isCancelled ? "Cancelled" : isSent ? "Sent" : "Scheduled"}
          </span>
        </div>
      </div>

      {/* Subject (email only) */}
      {msg.channel === "email" && msg.subject && (
        <div className="text-[11px] font-medium" style={{ color: "#AAAAAA" }}>
          {msg.subject}
        </div>
      )}

      {/* Body or phone script */}
      {msg.channel === "phone_script" && msg.phone_script ? (
        <div className="text-[11px]" style={{ color: "#777" }}>
          <div className="space-y-1 mt-1">
            {msg.phone_script.split("\n").map((line, i) => (
              <div key={i} className="flex gap-2">
                <span style={{ color: "#333" }}>•</span>
                <span>{line.trim()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : msg.body ? (
        <div
          className="text-[11px] leading-snug overflow-hidden cursor-pointer transition-all"
          style={{
            color: "#777",
            display: "-webkit-box",
            WebkitLineClamp: expanded ? "none" : 3,
            WebkitBoxOrient: "vertical",
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {msg.body}
          {msg.body.split("\n").length > 3 && !expanded && (
            <span style={{ color: "#444", marginLeft: 4 }}>...</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Main ChaseRow component ────────────────────────────────────────────────────

interface ChaseRowProps {
  chase: DocChaseRequestSummary;
  onForceSent?: () => void;
  onStatusChange?: (id: string, status: "received" | "cancelled") => void;
  showHistory?: boolean;
}

export function ChaseRow({ chase, onForceSent, onStatusChange, showHistory = false }: ChaseRowProps) {
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ verdict: string; summary: string; issues: string[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<DocChaseMessage[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirming, setConfirming] = useState<"received" | "cancelled" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isResolved = chase.status === "received" || chase.status === "cancelled";
  const isOverdue = !isResolved && chase.touches_sent >= chase.touches_total;
  const hasReply = !!chase.last_client_reply;
  const escalIdx = ESCALATION_ORDER.indexOf(chase.escalation_level as typeof ESCALATION_ORDER[number]);
  const daysIn = daysSince(chase.created_at);
  const canForceSend = !isResolved && chase.touches_sent < chase.touches_total;
  const canUpload = !isResolved;

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
          onForceSent?.();
        }
      }
    } catch {
      setUploadResult({ verdict: "unreadable", summary: "Upload failed — please try again", issues: [] });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleToggleHistory() {
    if (!showHistory) return;
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    if (history) {
      setHistoryOpen(true);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/doc-chase/${chase.id}`);
      const json = await res.json();
      if (res.ok) {
        setHistory(json.messages ?? []);
        setHistoryOpen(true);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleStatusChange(status: "received" | "cancelled") {
    onStatusChange?.(chase.id, status);
    setConfirming(null);
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
          {showHistory && (
            <button
              onClick={handleToggleHistory}
              disabled={historyLoading}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{
                background: "#1A1A1A",
                border: "1px solid #252525",
                color: "#AAAAAA",
                cursor: historyLoading ? "not-allowed" : "pointer",
              }}
            >
              {historyLoading ? (
                <Loader2 size={9} className="animate-spin" />
              ) : historyOpen ? (
                <ChevronUp size={9} />
              ) : (
                <ChevronDown size={9} />
              )}
              {historyLoading ? "Loading…" : historyOpen ? "Hide" : "Show"} history
            </button>
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

        {/* Validation result */}
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

        {/* Message history */}
        {showHistory && historyOpen && history && (
          <div className="mt-2 rounded-md" style={{ background: "#0A0A0A", border: "1px solid #0F0F0F" }}>
            {history.length === 0 ? (
              <div className="px-3 py-2 text-[11px]" style={{ color: "#333" }}>
                No messages yet
              </div>
            ) : (
              history.map((msg) => (
                <MessageHistoryItem key={msg.id} msg={msg} />
              ))
            )}
          </div>
        )}

        {/* Mark Received / Cancel actions */}
        {onStatusChange && !isResolved && (
          <div className="mt-2 flex items-center gap-2">
            {confirming ? (
              <div className="flex items-center gap-2 text-[11px]" style={{ color: "#888" }}>
                <span>Stop pending follow-ups?</span>
                <button
                  onClick={() => handleStatusChange(confirming)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                  style={{ background: "#1A1A1A", border: "1px solid #252525", color: "#FAFAFA" }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="px-2 py-0.5 rounded text-[11px] transition-colors"
                  style={{ color: "#555" }}
                >
                  Back
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setConfirming("received")}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: "#1A1A1A",
                    border: "1px solid #252525",
                    color: "#AAAAAA",
                    cursor: "pointer",
                  }}
                >
                  Mark Received
                </button>
                <button
                  onClick={() => setConfirming("cancelled")}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: "transparent",
                    border: "1px solid #252525",
                    color: "#666",
                    cursor: "pointer",
                  }}
                >
                  Cancel chase
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
