"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface FollowUpMessage {
  id: string;
  touch_number: number;
  scheduled_for: string;
  sent_at: string | null;
  status: "scheduled" | "sent" | "cancelled";
  subject: string;
  body: string;
}

interface FollowUpSequence {
  id: string;
  certificate_id: string;
  holder_name: string;
  holder_email: string;
  sequence_status: "active" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  holder_followup_messages: FollowUpMessage[];
}

interface Props {
  certificateId: string;
  holderName: string;
  holderEmail: string | null;
  expirationDate: string | null;
}

// ── Helpers ──────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_DOT: Record<FollowUpMessage["status"], string> = {
  scheduled: "bg-[#888888]",
  sent:      "bg-[#FAFAFA]",
  cancelled: "bg-[#333333]",
};

const SEQ_STATUS_CHIP: Record<
  FollowUpSequence["sequence_status"],
  { label: string; className: string }
> = {
  active:    { label: "Active",    className: "bg-[#FAFAFA]/[0.06] text-[#FAFAFA] border border-[#1C1C1C]" },
  completed: { label: "Completed", className: "bg-[#ffffff08] text-[#8a8a8a] border border-[#ffffff10]" },
  cancelled: { label: "Cancelled", className: "bg-[#ffffff08] text-[#6b6b6b] border border-[#ffffff10]" },
};

// ── Component ────────────────────────────────────────────────

export function FollowUpSection({
  certificateId,
  holderName,
  holderEmail: initialHolderEmail,
  expirationDate,
}: Props) {
  const [sequence, setSequence] = useState<FollowUpSequence | null>(null);
  const [loadingSeq, setLoadingSeq] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState(initialHolderEmail ?? "");

  // Load existing sequence for this certificate
  const loadSequence = useCallback(async () => {
    setLoadingSeq(true);
    try {
      // We query via the certificate_id — use the sequences list endpoint
      const res = await fetch(
        `/api/holder-followup/by-certificate/${certificateId}`
      );
      if (res.ok) {
        const data = await res.json();
        setSequence(data ?? null);
      } else {
        setSequence(null);
      }
    } catch {
      setSequence(null);
    } finally {
      setLoadingSeq(false);
    }
  }, [certificateId]);

  useEffect(() => {
    loadSequence();
  }, [loadSequence]);

  async function handleStart() {
    const email = emailOverride.trim();
    if (!email) return;

    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/holder-followup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificate_id: certificateId,
          holder_name: holderName,
          holder_email: email,
          expiry_date: expirationDate ?? "",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create sequence");
        return;
      }
      setSuccessMsg(
        "3-touch sequence scheduled — touches at day 0, 7, and 14"
      );
      // Reload sequence state
      await loadSequence();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel() {
    if (!sequence) return;
    if (!confirm("Cancel this follow-up sequence? Pending emails will not be sent.")) return;

    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/holder-followup/${sequence.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence_status: "cancelled" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to cancel");
        return;
      }
      setSequence((prev) =>
        prev ? { ...prev, sequence_status: "cancelled", holder_followup_messages: prev.holder_followup_messages.map(m => m.status === "scheduled" ? { ...m, status: "cancelled" as const } : m) } : null
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────

  if (loadingSeq) {
    return (
      <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5">
        <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-3">
          Certificate Holder Follow-Up
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#6b6b6b]">
          <Loader2 size={12} className="animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  // ── Active / completed / cancelled sequence ───────────────

  if (sequence) {
    const messages = (sequence.holder_followup_messages ?? []).sort(
      (a, b) => a.touch_number - b.touch_number
    );
    const sentCount = messages.filter((m) => m.status === "sent").length;
    const chip = SEQ_STATUS_CHIP[sequence.sequence_status];

    return (
      <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest">
            Certificate Holder Follow-Up
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${chip.className}`}
          >
            {chip.label}
          </span>
        </div>

        {/* Sequence meta */}
        <div className="text-[12px] text-[#8a8a8a] mb-1">
          <span className="text-[#FAFAFA] font-medium">{sequence.holder_name}</span>
          {" · "}
          <span className="font-mono">{sequence.holder_email}</span>
        </div>
        <div className="text-[11px] text-[#6b6b6b] mb-4">
          Started {fmtDate(sequence.created_at)} · {sentCount} of{" "}
          {messages.length} touches sent
          {sequence.completed_at
            ? ` · Completed ${fmtDate(sequence.completed_at)}`
            : ""}
        </div>

        {/* Touch list */}
        <div className="space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-3 rounded-lg bg-[#0C0C0C] border border-[#1C1C1C] px-3 py-2.5"
            >
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[msg.status]}`}
                />
                <span className="text-[11px] font-semibold text-[#6b6b6b] w-12">
                  Day {msg.touch_number === 1 ? "0" : msg.touch_number === 2 ? "7" : "14"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[#FAFAFA] font-medium truncate">
                  {msg.subject}
                </div>
                <div className="text-[11px] text-[#6b6b6b] mt-0.5">
                  {msg.status === "sent" && msg.sent_at ? (
                    <span className="text-[#FAFAFA]">
                      Sent {fmtDate(msg.sent_at)} at {fmtTime(msg.sent_at)}
                    </span>
                  ) : msg.status === "cancelled" ? (
                    <span>Cancelled</span>
                  ) : (
                    <span className="text-[#9e9e9e]/70">
                      Scheduled for {fmtDate(msg.scheduled_for)}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {msg.status === "sent" ? (
                  <CheckCircle2 size={13} className="text-[#FAFAFA]" />
                ) : msg.status === "cancelled" ? (
                  <XCircle size={13} className="text-[#6b6b6b]" />
                ) : (
                  <Clock size={13} className="text-[#9e9e9e]/60" />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-red-400">
            <AlertTriangle size={12} />
            {error}
          </div>
        )}

        {/* Cancel button — only for active sequences */}
        {sequence.sequence_status === "active" && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="h-7 px-3 flex items-center gap-1.5 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-red-400 hover:border-red-800/40 transition-colors disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <XCircle size={11} />
              )}
              {cancelling ? "Cancelling…" : "Cancel Sequence"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── No sequence yet — start form ─────────────────────────

  const missingEmail = !initialHolderEmail;

  return (
    <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5">
      <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-4">
        Certificate Holder Follow-Up
      </div>

      {/* Holder info */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="text-[11px] font-medium text-[#6b6b6b] uppercase tracking-wider mb-0.5">
            Holder
          </div>
          <div className="text-[13px] text-[#FAFAFA]">{holderName}</div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-[#6b6b6b] uppercase tracking-wider mb-1">
            Email
          </div>
          {missingEmail ? (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#9e9e9e] mb-2">
                <AlertTriangle size={11} />
                Add holder email to enable automated follow-up
              </div>
              <input
                type="email"
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                placeholder="holder@example.com"
                className="w-full h-8 bg-[#0C0C0C] border border-[#1C1C1C] rounded-md px-3 text-[13px] text-[#FAFAFA] placeholder:text-[#6b6b6b] outline-none focus:border-[#555555]"
              />
            </div>
          ) : (
            <div className="text-[13px] font-mono text-[#FAFAFA]">
              {initialHolderEmail}
            </div>
          )}
        </div>

        {expirationDate && (
          <div>
            <div className="text-[11px] font-medium text-[#6b6b6b] uppercase tracking-wider mb-0.5">
              COI Expires
            </div>
            <div className="text-[13px] text-[#FAFAFA]">
              {new Date(expirationDate + "T00:00:00").toLocaleDateString(
                "en-AU",
                { month: "long", day: "numeric", year: "numeric" }
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info blurb */}
      <p className="text-[11px] text-[#6b6b6b] leading-relaxed mb-4">
        Starting a sequence sends 3 follow-up emails to the certificate holder —
        immediately, then at 7 and 14 days — to confirm they have the renewed
        COI on file. Emails are AI-drafted and sent automatically. No manual
        action required after starting.
      </p>

      {/* Success state */}
      {successMsg && (
        <div className="flex items-center gap-2 text-[12px] text-[#FAFAFA] mb-3">
          <CheckCircle2 size={13} />
          {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-[12px] text-red-400 mb-3">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleStart}
          disabled={creating || !emailOverride.trim()}
          className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Mail size={12} />
          )}
          {creating ? "Drafting…" : "Start Follow-Up Sequence"}
        </button>

        {!creating && sequence === null && !loadingSeq && (
          <button
            onClick={loadSequence}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-[#1C1C1C] text-[#6b6b6b] hover:text-[#FAFAFA] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
