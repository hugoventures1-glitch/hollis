"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import {
  CheckCircle2,
  XCircle,
  Pencil,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  ListChecks,
  FileText,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import type { InboxItem, DocChaseReplyItem } from "./page";

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

function intentLabel(intent: string): string {
  return intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceBadge(score: number): { label: string; color: string; showSuffix: boolean } {
  const pct = Math.round(score * 100);
  if (score >= 0.85) return { label: `${pct}%`, color: "text-[#4ade80] bg-[#16a34a]/10 border-[#16a34a]/20", showSuffix: true };
  if (score >= 0.60) return { label: `${pct}%`, color: "text-[#fbbf24] bg-[#f59e0b]/10 border-[#f59e0b]/20", showSuffix: true };
  return { label: `${pct}%`, color: "text-[#f87171] bg-[#dc2626]/10 border-[#dc2626]/20", showSuffix: true };
}

function sourceBadge(item: InboxItem): { label: string; color: string; showSuffix: boolean } {
  if (item.signal_id === null) {
    const flagReason = item.proposed_action?.payload?.flag_reason as string | undefined;
    const isLearning = typeof flagReason === "string" && flagReason.toLowerCase().includes("learning");
    if (isLearning) {
      return { label: "Learning", color: "text-[#fbbf24] bg-[#f59e0b]/10 border-[#f59e0b]/20", showSuffix: false };
    }
    return { label: "Scheduled", color: "text-white/40 bg-white/5 border-white/10", showSuffix: false };
  }
  return confidenceBadge(item.confidence_score);
}

// ── Tier pill ─────────────────────────────────────────────────────────────────

function TierPill({ tier }: { tier: 2 | 3 }) {
  return tier === 3 ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/40 border border-red-800/30 text-red-400 uppercase tracking-wide">
      <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
      T3 — Escalation
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-tertiary)] uppercase tracking-wide">
      T2 — Review
    </span>
  );
}

// ── Inbox row ─────────────────────────────────────────────────────────────────

function InboxRow({
  item,
  selected,
  onClick,
}: {
  item: InboxItem;
  selected: boolean;
  onClick: () => void;
}) {
  const isUrgent = item.tier === 3;
  const policy = item.policies;
  const policyRef = policy?.policy_number ?? null;
  const policyName = policy?.policy_name ?? "";
  const carrier = policy?.carrier ?? null;
  const carrierShort = carrier ? carrier.split(" ")[0] : null;
  const clientName = policy?.client_name ?? "Unknown Client";

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 transition-colors"
      style={{
        background: selected ? "var(--surface-raised)" : "transparent",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[12px] font-semibold truncate mb-1 leading-tight"
        style={{ color: isUrgent ? "#FF4444" : "var(--text-primary)" }}
      >
        {policyRef && (
          <>
            <span>{policyRef}</span>
            <span className="mx-1.5 font-normal" style={{ color: isUrgent ? "#FF4444" : "var(--text-tertiary)" }}>—</span>
          </>
        )}
        {policyName}
      </p>
      <div className="flex items-center gap-2">
        {!selected && (
          <span
            className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: isUrgent ? "#FF4444" : "var(--text-tertiary)" }}
          />
        )}
        {carrierShort && (
          <span
            className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{
              background: isUrgent ? "#FF4444" : "var(--text-primary)",
              color: "var(--background)",
            }}
          >
            {carrierShort}
          </span>
        )}
        <span
          className="text-[11px] truncate flex-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {clientName}
        </span>
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {timeAgo(item.created_at)}
        </span>
      </div>
    </button>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  item: InboxItem;
  busy: boolean;
  sent: boolean;
  sentAction?: "approved" | "rejected" | "edited";
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  isEditing: boolean;
  editedIntent: string;
  editNotes: string;
  editedBody: string;
  onEditedIntentChange: (v: string) => void;
  onEditNotesChange: (v: string) => void;
  onEditedBodyChange: (v: string) => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  isTodo?: boolean;
}

function DetailPanel({
  item,
  busy,
  sent,
  sentAction,
  onApprove,
  onReject,
  onEdit,
  isEditing,
  editedIntent,
  editNotes,
  editedBody,
  onEditedIntentChange,
  onEditNotesChange,
  onEditedBodyChange,
  onConfirmEdit,
  onCancelEdit,
  isTodo = false,
}: DetailPanelProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const policy    = item.policies;
  const days      = policy ? daysUntil(policy.expiration_date) : null;
  const confidence = sourceBadge(item);
  const isUrgent  = item.tier === 3;

  const expiryColor =
    days !== null && days <= 14 ? "#FF4444" :
    days !== null && days <= 30 ? "var(--text-secondary)" :
    "var(--text-tertiary)";

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-6 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <TierPill tier={item.tier} />
              {isTodo && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {intentLabel(item.classified_intent)}
                </span>
              )}
              {days !== null && (
                <span className="text-[11px] font-semibold" style={{ color: expiryColor }}>
                  {days}d until expiry
                </span>
              )}
            </div>
            {isTodo && policy ? (
              <>
                <h2
                  className="text-[18px] font-semibold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {policy.client_name}
                </h2>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {policy.policy_name}
                  {policy.carrier && (
                    <span style={{ color: "var(--text-tertiary)" }}> · {policy.carrier}</span>
                  )}
                </p>
              </>
            ) : (
              <>
                <h2
                  className="text-[18px] font-semibold leading-tight"
                  style={{ color: isUrgent ? "#FF4444" : "var(--text-primary)" }}
                >
                  {intentLabel(item.classified_intent)}
                </h2>
                {policy && (
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {policy.client_name}
                    {policy.carrier && (
                      <span style={{ color: "var(--text-tertiary)" }}> · {policy.carrier}</span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
          {policy && (
            <Link
              href={`/renewals/${policy.id}`}
              className="shrink-0 flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70"
              style={{ color: "var(--text-tertiary)" }}
            >
              Open policy <ArrowUpRight size={11} />
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div
          className="rounded-xl p-4 space-y-4"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
        >
          {!isTodo && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div
                    className="text-[10px] font-semibold uppercase tracking-widest mb-1"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Agent read
                  </div>
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {intentLabel(item.classified_intent)}
                  </span>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${confidence.color}`}>
                  {confidence.label}{confidence.showSuffix ? " conf." : ""}
                </span>
              </div>
              <div className="h-px" style={{ background: "var(--border)" }} />
            </>
          )}
          {isTodo && (
            <div className="flex items-center justify-between">
              <div
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-tertiary)" }}
              >
                Signal
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${confidence.color}`}>
                {confidence.label}{confidence.showSuffix ? " conf." : ""}
              </span>
            </div>
          )}

          {item.signal_id !== null && item.raw_signal_snippet && (
            <>
              <div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Client said
                </div>
                <blockquote
                  className="text-[13px] italic leading-relaxed pl-3"
                  style={{
                    color: "var(--text-secondary)",
                    borderLeft: "2px solid var(--border)",
                  }}
                >
                  &ldquo;{item.raw_signal_snippet}&rdquo;
                </blockquote>
              </div>
              <div className="h-px" style={{ background: "var(--border)" }} />
            </>
          )}

          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Proposed action
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {item.proposed_action.description}
            </p>
          </div>

          {typeof item.proposed_action?.payload?.body === "string" && item.proposed_action.payload.body && (
            <>
              <div className="h-px" style={{ background: "var(--border)" }} />
              <div className="space-y-2">
                <div
                  className="text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Outreach draft
                </div>
                {isEditing ? (
                  <textarea
                    value={editedBody}
                    onChange={(e) => onEditedBodyChange(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg px-4 py-3 text-[13px] leading-relaxed focus:outline-none resize-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <div
                    className="rounded-lg px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      fontFamily: "inherit",
                    }}
                  >
                    {item.proposed_action.payload.body}
                  </div>
                )}

                {isEditing && (
                  <div>
                    <button
                      onClick={() => setFeedbackOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-[11px] pt-1 transition-opacity hover:opacity-70"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <ChevronDown
                        size={11}
                        style={{
                          transform: feedbackOpen ? "rotate(180deg)" : "none",
                          transition: "transform 150ms",
                        }}
                      />
                      Feedback for agent (optional)
                    </button>
                    {feedbackOpen && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-[11px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                            Correct intent label
                          </label>
                          <input
                            type="text"
                            value={editedIntent}
                            onChange={(e) => onEditedIntentChange(e.target.value)}
                            placeholder="e.g. confirm_renewal"
                            className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
                            Notes
                          </label>
                          <textarea
                            value={editNotes}
                            onChange={(e) => onEditNotesChange(e.target.value)}
                            placeholder="Why you changed it…"
                            rows={2}
                            className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none resize-none"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {sent ? (
        <div
          className="px-6 py-5 shrink-0"
          style={{
            borderTop: `1px solid ${sentAction === "rejected" ? "rgba(220,38,38,0.15)" : "rgba(184,244,0,0.15)"}`,
            background: sentAction === "rejected" ? "rgba(220,38,38,0.05)" : "rgba(184,244,0,0.05)",
          }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: sentAction === "rejected" ? "rgba(220,38,38,0.12)" : "rgba(184,244,0,0.12)",
                border: `1px solid ${sentAction === "rejected" ? "rgba(220,38,38,0.25)" : "rgba(184,244,0,0.25)"}`,
              }}
            >
              <CheckCircle2 size={13} style={{ color: sentAction === "rejected" ? "#f87171" : "#B8F400" }} />
            </div>
            <span className="text-[14px] font-semibold" style={{ color: sentAction === "rejected" ? "#f87171" : "#B8F400" }}>
              {sentAction === "rejected" ? "Renewal rejected" : sentAction === "edited" ? "Changes saved" : "Renewal approved"}
            </span>
          </div>
          <p className="text-[12px] pl-9 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {sentAction === "rejected"
              ? `This action has been rejected. No outreach will be sent to ${item.policies?.client_name ?? "the client"}.`
              : sentAction === "edited"
                ? `Your changes have been saved and approved. Hollis will dispatch the updated outreach to ${item.policies?.client_name ?? "the client"}.`
                : `Hollis has dispatched the outreach to ${item.policies?.client_name ?? "the client"}. The renewal is now in motion.`}
          </p>
        </div>
      ) : (
        <div
          className="px-6 py-4 shrink-0 flex items-center gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {isEditing ? (
            <>
              <button
                onClick={onConfirmEdit}
                disabled={busy}
                className="h-9 flex items-center gap-2 px-4 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-40 hover:opacity-80"
                style={{ background: "var(--accent)", color: "var(--text-inverse)" }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Save &amp; Approve
              </button>
              <button
                onClick={onCancelEdit}
                disabled={busy}
                className="h-9 flex items-center px-3.5 rounded-lg text-[13px] transition-colors disabled:opacity-40"
                style={{ border: "1px solid var(--border)", color: "var(--text-tertiary)" }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onApprove}
                disabled={busy}
                className="h-9 flex items-center gap-2 px-4 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-40 hover:opacity-80"
                style={{ background: "var(--accent)", color: "var(--text-inverse)" }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Approve
              </button>
              <button
                onClick={onEdit}
                disabled={busy}
                className="h-9 flex items-center gap-2 px-3.5 rounded-lg text-[13px] transition-colors disabled:opacity-40"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
              >
                <Pencil size={13} />
                Edit
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="h-9 flex items-center gap-2 px-3.5 rounded-lg text-[13px] transition-colors disabled:opacity-40 ml-auto"
                style={{ border: "1px solid var(--border)", color: "var(--text-tertiary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#f87171";
                  e.currentTarget.style.borderColor = "rgba(220,38,38,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <XCircle size={13} />
                Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── To Do row ─────────────────────────────────────────────────────────────────

function TodoRow({
  item,
  selected,
  onClick,
}: {
  item: InboxItem;
  selected: boolean;
  onClick: () => void;
}) {
  const policy = item.policies;
  const policyRef = policy?.policy_number ?? null;
  const policyName = policy?.policy_name ?? "";
  const carrier = policy?.carrier ?? null;
  const carrierShort = carrier ? carrier.split(" ")[0] : null;
  const clientName = policy?.client_name ?? "Unknown Client";

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 transition-colors"
      style={{
        background: selected ? "var(--surface-raised)" : "transparent",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[12px] font-semibold truncate mb-1 leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {policyRef && (
          <>
            <span>{policyRef}</span>
            <span className="mx-1.5 font-normal" style={{ color: "var(--text-tertiary)" }}>—</span>
          </>
        )}
        {policyName}
      </p>
      <div className="flex items-center gap-2">
        {!selected && (
          <span
            className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--text-tertiary)" }}
          />
        )}
        {carrierShort && (
          <span
            className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{
              background: "var(--text-primary)",
              color: "var(--background)",
            }}
          >
            {carrierShort}
          </span>
        )}
        <span
          className="text-[11px] truncate flex-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {clientName}
        </span>
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {timeAgo(item.created_at)}
        </span>
      </div>
    </button>
  );
}

// ── To Do detail panel ────────────────────────────────────────────────────────

function TodoDetailPanel({
  item,
  busy,
  done,
  checked,
  onToggle,
  onComplete,
}: {
  item: InboxItem;
  busy: boolean;
  done: boolean;
  checked: Set<number>;
  onToggle: (idx: number) => void;
  onComplete: () => void;
}) {
  const policy  = item.policies;
  const days    = policy ? daysUntil(policy.expiration_date) : null;
  const changes = (item.proposed_action?.payload?.changes as string[] | undefined) ?? [];
  const allChecked = changes.length > 0 && checked.size === changes.length;

  const expiryColor =
    days !== null && days <= 14 ? "#FF4444" :
    days !== null && days <= 30 ? "var(--text-secondary)" :
    "var(--text-tertiary)";

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-tertiary)",
                }}
              >
                To Do
              </span>
              {days !== null && (
                <span className="text-[11px] font-semibold" style={{ color: expiryColor }}>
                  {days}d until expiry
                </span>
              )}
            </div>
            <h2 className="text-[18px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {policy?.client_name ?? "Unknown Client"}
            </h2>
            {policy && (
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {policy.policy_name}
                {policy.carrier && (
                  <span style={{ color: "var(--text-tertiary)" }}> · {policy.carrier}</span>
                )}
              </p>
            )}
          </div>
          {policy && (
            <Link
              href={`/renewals/${policy.id}`}
              className="shrink-0 flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70"
              style={{ color: "var(--text-tertiary)" }}
            >
              Open policy <ArrowUpRight size={11} />
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div
          className="rounded-xl p-4 space-y-4"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
        >
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Client confirmed renewal — changes needed first
            </div>
            <div className="space-y-2">
              {changes.map((change, idx) => (
                <label
                  key={idx}
                  className="flex items-start gap-3 cursor-pointer group/check"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center transition-colors"
                      style={{
                        background: checked.has(idx) ? "var(--accent)" : "var(--surface)",
                        border: `1px solid ${checked.has(idx) ? "var(--accent)" : "var(--border)"}`,
                      }}
                      onClick={() => onToggle(idx)}
                    >
                      {checked.has(idx) && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-[13px] leading-snug transition-colors"
                    style={{ color: checked.has(idx) ? "var(--text-tertiary)" : "var(--text-primary)" }}
                    onClick={() => onToggle(idx)}
                  >
                    {change}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {item.signal_id !== null && item.raw_signal_snippet && (
            <>
              <div className="h-px" style={{ background: "var(--border)" }} />
              <div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Client said
                </div>
                <blockquote
                  className="text-[13px] italic leading-relaxed pl-3"
                  style={{ color: "var(--text-secondary)", borderLeft: "2px solid var(--border)" }}
                >
                  &ldquo;{item.raw_signal_snippet}&rdquo;
                </blockquote>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="px-6 py-4 shrink-0 flex items-center gap-2"
        style={{
          borderTop: "1px solid var(--border)",
          background: done ? "rgba(184,244,0,0.06)" : undefined,
        }}
      >
        {done ? (
          <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#B8F400" }}>
            <CheckCircle2 size={14} />
            Done — renewal proceeding
          </div>
        ) : (
          <button
            onClick={onComplete}
            disabled={busy || !allChecked}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-40 hover:opacity-80"
            style={{ background: "var(--accent)", color: "var(--text-inverse)" }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {allChecked ? "Done — proceed with renewal" : `${checked.size} / ${changes.length} changes made`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Doc Chase list row ────────────────────────────────────────────────────────

function DocChaseRow({
  item,
  selected,
  onClick,
}: {
  item: DocChaseReplyItem;
  selected: boolean;
  onClick: () => void;
}) {
  const hasAttachment = Boolean(item.received_attachment_path);
  const replyAt = item.last_client_reply_at ?? item.created_at;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 transition-colors"
      style={{
        background: selected ? "var(--surface-raised)" : "transparent",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <p
        className="text-[12px] font-semibold truncate mb-1 leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {item.client_name}
      </p>
      <div className="flex items-center gap-2">
        {!selected && (
          <span
            className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--text-tertiary)" }}
          />
        )}
        <span className="text-[11px] truncate flex-1" style={{ color: "var(--text-secondary)" }}>
          {item.document_type}
        </span>
        {hasAttachment && (
          <Paperclip size={10} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
        )}
        <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {timeAgo(replyAt)}
        </span>
      </div>
    </button>
  );
}

// ── Doc Chase detail panel ────────────────────────────────────────────────────

function DocChaseDetailPanel({
  item,
  onMarkReceived,
}: {
  item: DocChaseReplyItem;
  onMarkReceived: (id: string) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);

  const hasAttachment = Boolean(item.received_attachment_path);
  const isPdf = item.received_attachment_content_type?.startsWith("application/pdf") ?? false;
  const isImage = item.received_attachment_content_type?.startsWith("image/") ?? false;
  const isReceived = item.status === "received" || marked;

  const fetchSignedUrl = useCallback(async () => {
    if (!hasAttachment) return;
    setUrlLoading(true);
    setUrlError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}/attachment`);
      if (!res.ok) throw new Error("Could not load document");
      const data = await res.json();
      setSignedUrl(data.signedUrl);
    } catch {
      setUrlError("Failed to load document");
    } finally {
      setUrlLoading(false);
    }
  }, [item.id, hasAttachment]);

  useEffect(() => {
    setSignedUrl(null);
    setUrlError(null);
    setMarked(false);
    fetchSignedUrl();
  }, [fetchSignedUrl]);

  async function handleMarkReceived() {
    setMarking(true);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "received" }),
      });
      if (res.ok) {
        setMarked(true);
        onMarkReceived(item.id);
      }
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-tertiary)",
                }}
              >
                Doc Chase
              </span>
              {item.validation_status && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    item.validation_status === "pass"
                      ? "text-[#4ade80] bg-[#16a34a]/10 border-[#16a34a]/20"
                      : item.validation_status === "fail"
                      ? "text-[#f87171] bg-[#dc2626]/10 border-[#dc2626]/20"
                      : item.validation_status === "partial"
                      ? "text-[#fbbf24] bg-[#f59e0b]/10 border-[#f59e0b]/20"
                      : "text-white/40 bg-white/5 border-white/10"
                  }`}
                >
                  {item.validation_status.charAt(0).toUpperCase() + item.validation_status.slice(1)}
                </span>
              )}
            </div>
            <h2 className="text-[18px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {item.client_name}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {item.document_type}
            </p>
          </div>
          <Link
            href="/documents"
            className="shrink-0 flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70"
            style={{ color: "var(--text-tertiary)" }}
          >
            View chase <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">

        {/* Client reply */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <div
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Client reply
            </div>
            {item.last_client_reply_at && (
              <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {timeAgo(item.last_client_reply_at)}
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            {item.last_client_reply ?? "No reply text captured."}
          </p>
        </div>

        {/* AI validation summary */}
        {item.validation_summary && (
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
          >
            <div
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              AI validation
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {item.validation_summary}
            </p>
            {item.validation_issues && item.validation_issues.length > 0 && (
              <ul className="space-y-1 pt-1">
                {item.validation_issues.map((issue, i) => (
                  <li key={i} className="text-[12px] flex items-start gap-2" style={{ color: "#f87171" }}>
                    <span className="shrink-0">·</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Document viewer */}
        {hasAttachment && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            {/* Doc header */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <span className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>
                  {item.received_attachment_filename ?? "Attachment"}
                </span>
              </div>
              {signedUrl && (
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 text-[11px] ml-3 transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Open <ExternalLink size={10} />
                </a>
              )}
            </div>

            {/* Doc body */}
            <div
              className="flex items-center justify-center"
              style={{ height: 420, background: "var(--surface)" }}
            >
              {urlLoading ? (
                <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              ) : urlError ? (
                <div className="flex flex-col items-center gap-2 text-center px-6">
                  <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{urlError}</p>
                  <button
                    onClick={fetchSignedUrl}
                    className="text-[11px] transition-opacity hover:opacity-70"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Retry
                  </button>
                </div>
              ) : signedUrl ? (
                isPdf ? (
                  <iframe
                    src={signedUrl}
                    className="w-full h-full"
                    style={{ border: "none" }}
                    title={item.received_attachment_filename ?? "Document"}
                  />
                ) : isImage ? (
                  <img
                    src={signedUrl}
                    alt={item.received_attachment_filename ?? "Attachment"}
                    className="max-w-full max-h-full object-contain p-4"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <FileText size={24} style={{ color: "var(--text-tertiary)" }} />
                    <a
                      href={signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Download <ExternalLink size={11} />
                    </a>
                  </div>
                )
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        className="px-6 py-4 shrink-0 flex items-center gap-2"
        style={{
          borderTop: "1px solid var(--border)",
          background: isReceived ? "rgba(184,244,0,0.05)" : undefined,
        }}
      >
        {isReceived ? (
          <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#B8F400" }}>
            <CheckCircle2 size={14} />
            Document received
          </div>
        ) : (
          <button
            onClick={handleMarkReceived}
            disabled={marking}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-40 hover:opacity-80"
            style={{ background: "var(--accent)", color: "var(--text-inverse)" }}
          >
            {marking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Mark Received
          </button>
        )}
      </div>
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function InboxZero() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 select-none">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4 text-[20px] font-black"
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          fontFamily: "var(--font-display)",
          color: "var(--text-tertiary)",
        }}
      >
        h
      </div>
      <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Inbox zero
      </p>
      <p className="text-[12px] leading-relaxed max-w-[220px]" style={{ color: "var(--text-tertiary)" }}>
        Hollis will surface items here when it needs your input on a Tier 2 signal.
      </p>
    </div>
  );
}

function NothingSelected() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 select-none">
      <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
        Select a message to review
      </p>
    </div>
  );
}

function TodoZero() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 select-none">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
      >
        <ListChecks size={18} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        All clear
      </p>
      <p className="text-[12px] leading-relaxed max-w-[220px]" style={{ color: "var(--text-tertiary)" }}>
        Confirmed renewals, client questions, and broker tasks will appear here.
      </p>
    </div>
  );
}

function DocChaseZero() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 select-none">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
      >
        <FileText size={18} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        No replies yet
      </p>
      <p className="text-[12px] leading-relaxed max-w-[220px]" style={{ color: "var(--text-tertiary)" }}>
        Client replies to doc chase requests will appear here.
      </p>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export default function InboxClient({
  initialItems,
  docChaseReplies: initialDocChaseReplies = [],
}: {
  initialItems: InboxItem[];
  docChaseReplies?: DocChaseReplyItem[];
}) {
  const [items,        setItems]        = useState<InboxItem[]>(initialItems);
  const [tab,          setTab]          = useState<"inbox" | "todo" | "doc_chase">("inbox");
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editedIntent, setEditedIntent] = useState("");
  const [editNotes,    setEditNotes]    = useState("");
  const [editedBody,   setEditedBody]   = useState("");
  const [busy,         setBusy]         = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [sentId,       setSentId]       = useState<string | null>(null);
  const [sentAction,   setSentAction]   = useState<"approved" | "rejected" | "edited" | null>(null);
  const [checkedMap,   setCheckedMap]   = useState<Record<string, Set<number>>>({});
  const [docChaseReplies, setDocChaseReplies] = useState<DocChaseReplyItem[]>(initialDocChaseReplies);
  const [selectedDocChaseId, setSelectedDocChaseId] = useState<string | null>(null);
  const posthog = usePostHog();

  const TODO_INTENTS = ["confirm_renewal", "soft_query"];
  const isTodoItem = (i: InboxItem) =>
    i.proposed_action?.action_type === "broker_change_required" ||
    TODO_INTENTS.includes(i.classified_intent);
  const inboxItems = items.filter((i) => !isTodoItem(i));
  const todoItems  = items.filter(isTodoItem);

  const selectedInboxItem = tab !== "doc_chase"
    ? (tab === "inbox" ? inboxItems : todoItems).find((i) => i.id === selectedId) ?? null
    : null;
  const selectedDocChase = tab === "doc_chase"
    ? docChaseReplies.find((r) => r.id === selectedDocChaseId) ?? null
    : null;

  async function resolve(
    id: string,
    action: "approved" | "rejected" | "edited",
    extra?: { edited_intent?: string; notes?: string; edited_body?: string }
  ) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/agent/review/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to resolve");
      }
      const item = items.find((i) => i.id === id);
      posthog.capture("approval_queue_actioned", {
        queue_item_id: id,
        action,
        classified_intent: item?.classified_intent,
        confidence_score: item?.confidence_score,
        tier: item?.tier,
        body_edited: action === "edited" && !!extra?.edited_body,
        source: tab === "todo" ? "inbox_todo" : "inbox",
      });
      setSentId(id);
      setSentAction(action);
      await new Promise((r) => setTimeout(r, 900));
      setSentId(null);
      setSentAction(null);
      const remaining = items.filter((i) => i.id !== id);
      setItems(remaining);
      const remainingActive = remaining.filter((i) =>
        tab === "inbox"
          ? i.proposed_action?.action_type !== "broker_change_required"
          : i.proposed_action?.action_type === "broker_change_required"
      );
      setSelectedId(remainingActive.length > 0 ? remainingActive[0].id : null);
      setEditingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function toggleCheck(itemId: string, idx: number) {
    setCheckedMap((prev) => {
      const current = new Set(prev[itemId] ?? []);
      if (current.has(idx)) current.delete(idx);
      else current.add(idx);
      return { ...prev, [itemId]: current };
    });
  }

  function startEdit(item: InboxItem) {
    setEditingId(item.id);
    setEditedIntent(item.classified_intent);
    setEditNotes("");
    setEditedBody(typeof item.proposed_action?.payload?.body === "string" ? item.proposed_action.payload.body : "");
    setErrorMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditedIntent("");
    setEditNotes("");
    setEditedBody("");
  }

  const TABS: { key: "inbox" | "todo" | "doc_chase"; label: string; count: number }[] = [
    { key: "inbox",     label: "Inbox",     count: inboxItems.length },
    { key: "todo",      label: "To Do",     count: todoItems.length },
    { key: "doc_chase", label: "Doc Chase", count: docChaseReplies.length },
  ];

  return (
    <div
      className="flex h-full"
      style={{ background: "var(--background)", color: "var(--text-primary)" }}
    >
      {/* ── Left: list ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: 300, borderRight: "1px solid var(--border)" }}
      >
        {/* Header with tab bar */}
        <header
          className="shrink-0 flex flex-col"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="h-10 flex items-center justify-between px-4">
            <span className="text-[12px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-tertiary)" }}>
              from hollis
            </span>
          </div>
          <div className="flex" style={{ borderTop: "1px solid var(--border)" }}>
            {TABS.map(({ key, label, count }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setTab(key);
                    setSelectedId(null);
                    setSelectedDocChaseId(null);
                    setEditingId(null);
                    setErrorMsg(null);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium transition-colors relative"
                  style={{ color: active ? "var(--text-primary)" : "var(--text-tertiary)" }}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums"
                      style={{
                        background: active ? "var(--surface-raised)" : "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {count}
                    </span>
                  )}
                  {active && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-px"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* List */}
        {tab === "inbox" && (
          inboxItems.length === 0 ? <InboxZero /> : (
            <div className="flex-1 overflow-y-auto">
              {inboxItems.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onClick={() => { setSelectedId(item.id); setEditingId(null); }}
                />
              ))}
            </div>
          )
        )}

        {tab === "todo" && (
          todoItems.length === 0 ? <TodoZero /> : (
            <div className="flex-1 overflow-y-auto">
              {todoItems.map((item) => (
                <TodoRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                />
              ))}
            </div>
          )
        )}

        {tab === "doc_chase" && (
          docChaseReplies.length === 0 ? <DocChaseZero /> : (
            <div className="flex-1 overflow-y-auto">
              {docChaseReplies.map((item) => (
                <DocChaseRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedDocChaseId}
                  onClick={() => setSelectedDocChaseId(item.id)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Right: detail panel ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Subheader */}
        {tab !== "doc_chase" && (
          <header
            className="h-14 shrink-0 flex items-center justify-between px-6"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              {selectedInboxItem ? (
                <>
                  <TierPill tier={selectedInboxItem.tier} />
                  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                    {selectedInboxItem.policies?.policy_name}
                  </span>
                </>
              ) : (
                <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>—</span>
              )}
            </div>
            {selectedInboxItem?.policies && (
              <Link
                href={`/renewals/${selectedInboxItem.policies.id}`}
                className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-60"
                style={{ color: "var(--text-tertiary)" }}
              >
                {selectedInboxItem.policies.client_name}
                <ChevronRight size={11} />
              </Link>
            )}
          </header>
        )}

        {/* Error banner */}
        {errorMsg && (
          <div
            className="mx-6 mt-4 px-4 py-2.5 rounded-lg text-[13px] border flex items-center gap-2"
            style={{
              background: "rgba(220,38,38,0.06)",
              borderColor: "rgba(220,38,38,0.2)",
              color: "#f87171",
            }}
          >
            <AlertTriangle size={14} />
            {errorMsg}
          </div>
        )}

        {/* Content */}
        {tab === "doc_chase" ? (
          selectedDocChase ? (
            <DocChaseDetailPanel
              item={selectedDocChase}
              onMarkReceived={(id) =>
                setDocChaseReplies((prev) =>
                  prev.map((r) => r.id === id ? { ...r, status: "received" } : r)
                )
              }
            />
          ) : (
            <NothingSelected />
          )
        ) : tab === "todo" ? (
          selectedInboxItem ? (
            selectedInboxItem.proposed_action?.action_type === "broker_change_required" ? (
              <TodoDetailPanel
                item={selectedInboxItem}
                busy={busy}
                done={sentId === selectedInboxItem.id}
                checked={checkedMap[selectedInboxItem.id] ?? new Set()}
                onToggle={(idx) => toggleCheck(selectedInboxItem.id, idx)}
                onComplete={() => resolve(selectedInboxItem.id, "approved")}
              />
            ) : (
              <DetailPanel
                item={selectedInboxItem}
                busy={busy}
                sent={sentId === selectedInboxItem.id}
                sentAction={sentId === selectedInboxItem.id ? sentAction ?? undefined : undefined}
                onApprove={() => resolve(selectedInboxItem.id, "approved")}
                onReject={() => resolve(selectedInboxItem.id, "rejected")}
                onEdit={() => startEdit(selectedInboxItem)}
                isEditing={editingId === selectedInboxItem.id}
                editedIntent={editedIntent}
                editNotes={editNotes}
                editedBody={editedBody}
                onEditedIntentChange={setEditedIntent}
                onEditNotesChange={setEditNotes}
                onEditedBodyChange={setEditedBody}
                onConfirmEdit={() =>
                  resolve(selectedInboxItem.id, "edited", {
                    edited_intent: editedIntent,
                    notes: editNotes || undefined,
                    edited_body:
                      editedBody !== (typeof selectedInboxItem.proposed_action?.payload?.body === "string" ? selectedInboxItem.proposed_action.payload.body : "")
                        ? editedBody
                        : undefined,
                  })
                }
                onCancelEdit={cancelEdit}
                isTodo
              />
            )
          ) : (
            <NothingSelected />
          )
        ) : (
          selectedInboxItem ? (
            <DetailPanel
              item={selectedInboxItem}
              busy={busy}
              sent={sentId === selectedInboxItem.id}
              sentAction={sentId === selectedInboxItem.id ? sentAction ?? undefined : undefined}
              onApprove={() => resolve(selectedInboxItem.id, "approved")}
              onReject={() => resolve(selectedInboxItem.id, "rejected")}
              onEdit={() => startEdit(selectedInboxItem)}
              isEditing={editingId === selectedInboxItem.id}
              editedIntent={editedIntent}
              editNotes={editNotes}
              editedBody={editedBody}
              onEditedIntentChange={setEditedIntent}
              onEditNotesChange={setEditNotes}
              onEditedBodyChange={setEditedBody}
              onConfirmEdit={() =>
                resolve(selectedInboxItem.id, "edited", {
                  edited_intent: editedIntent,
                  notes: editNotes || undefined,
                  edited_body:
                    editedBody !== (typeof selectedInboxItem.proposed_action?.payload?.body === "string" ? selectedInboxItem.proposed_action.payload.body : "")
                      ? editedBody
                      : undefined,
                })
              }
              onCancelEdit={cancelEdit}
            />
          ) : (
            <NothingSelected />
          )
        )}
      </div>
    </div>
  );
}
