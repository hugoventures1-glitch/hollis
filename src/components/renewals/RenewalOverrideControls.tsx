"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, CheckCircle2, AlertTriangle, BadgeCheck, ShieldCheck, X, Mail } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";
import type { Policy, CampaignStage } from "@/types/renewals";

const TERMINAL_STAGES: CampaignStage[] = ["confirmed", "lapsed", "complete"];

interface RenewalOverrideControlsProps {
  policy: Pick<Policy, "id" | "renewal_paused" | "renewal_paused_until" | "renewal_manual_override" | "require_approval" | "campaign_stage"> & {
    client_name?: string;
    client_email?: string | null;
  };
}

export function RenewalOverrideControls({ policy }: RenewalOverrideControlsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseUntil, setPauseUntil] = useState(policy.renewal_paused_until ?? "");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualNote, setManualNote] = useState(policy.renewal_manual_override ?? "");
  const [showConfirmEmailModal, setShowConfirmEmailModal] = useState(false);
  const [confirmEmailSubject, setConfirmEmailSubject] = useState("");
  const [confirmEmailBody, setConfirmEmailBody] = useState("");
  const [isSendingEmail, startEmailTransition] = useTransition();

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/renewals/${policy.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Update failed");
    }
  };

  const handlePause = () => {
    startTransition(async () => {
      try {
        await patch({
          renewal_paused: true,
          renewal_paused_until: pauseUntil || null,
        });
        toast("Renewal campaign paused");
        setShowPauseForm(false);
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to pause", "error");
      }
    });
  };

  const handleResume = () => {
    startTransition(async () => {
      try {
        await patch({ renewal_paused: false, renewal_paused_until: null });
        toast("Renewal campaign resumed");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to resume", "error");
      }
    });
  };

  const handleMarkManual = () => {
    startTransition(async () => {
      try {
        await patch({ renewal_manual_override: manualNote || "Handled manually" });
        toast("Marked as manually handled");
        setShowManualForm(false);
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to update", "error");
      }
    });
  };

  const handleClearManual = () => {
    startTransition(async () => {
      try {
        await patch({ renewal_manual_override: null });
        toast("Manual override cleared");
        setManualNote("");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to clear", "error");
      }
    });
  };

  const handleConfirmRenewal = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policy.id}/confirm`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Confirm failed");
        }
        toast("Renewal confirmed", "success");
        router.refresh();
        if (policy.client_email) {
          const name = policy.client_name ?? "there";
          setConfirmEmailSubject("Your renewal has been confirmed");
          setConfirmEmailBody(
            `Hi ${name},\n\nYour renewal has been confirmed and is all sorted on our end.\n\nPlease don't hesitate to reach out if you have any questions.\n\nMany thanks`
          );
          setShowConfirmEmailModal(true);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to confirm", "error");
      }
    });
  };

  const handleSendConfirmEmail = () => {
    startEmailTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policy.id}/confirm-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: confirmEmailSubject, body: confirmEmailBody }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to send");
        }
        toast("Confirmation email sent");
        setShowConfirmEmailModal(false);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to send email", "error");
      }
    });
  };

  const canConfirm = !TERMINAL_STAGES.includes(policy.campaign_stage as CampaignStage);

  const handleToggleRequireApproval = () => {
    startTransition(async () => {
      try {
        await patch({ require_approval: !policy.require_approval });
        toast(policy.require_approval ? "High-touch mode disabled" : "High-touch mode enabled — all communications will require approval");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to update", "error");
      }
    });
  };

  return (
    <div className="rounded-xl bg-surface border border-border p-5 space-y-4">
      <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-widest">
        Campaign Controls
      </div>

      {/* High-touch notice */}
      {policy.require_approval && (
        <div className="flex items-start gap-3 rounded-lg bg-[#1a1200] border border-[#3d2e00] px-4 py-3">
          <ShieldCheck size={14} className="text-[#f59e0b] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[#f59e0b]">High-touch client</div>
            <div className="text-[12px] text-[#f59e0b]/70 mt-0.5">All outbound messages will appear in your inbox for approval before sending.</div>
          </div>
        </div>
      )}

      {/* Manual override notice */}
      {policy.renewal_manual_override && (
        <div className="flex items-start gap-3 rounded-lg bg-border border border-border px-4 py-3">
          <AlertTriangle size={14} className="text-text-secondary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-text-secondary">Manually handled</div>
            <div className="text-[12px] text-text-secondary/80 mt-0.5">{policy.renewal_manual_override}</div>
          </div>
          <button
            onClick={handleClearManual}
            disabled={isPending}
            className="text-[11px] text-text-secondary hover:text-text-primary transition-colors shrink-0 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Paused notice */}
      {policy.renewal_paused && !policy.renewal_manual_override && (
        <div className="flex items-start gap-3 rounded-lg bg-hover-overlay border border-border px-4 py-3">
          <PauseCircle size={14} className="text-text-secondary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-[12px] text-text-secondary">
            Automation paused
            {policy.renewal_paused_until && (
              <> until{" "}
                <span className="text-text-primary">
                  {new Date(policy.renewal_paused_until + "T00:00:00").toLocaleDateString("en-AU", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {policy.renewal_paused ? (
          <button
            onClick={handleResume}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-hover-overlay text-text-primary hover:bg-hover-overlay transition-colors disabled:opacity-50"
          >
            <PlayCircle size={13} />
            Resume Automation
          </button>
        ) : (
          <button
            onClick={() => setShowPauseForm(v => !v)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-hover-overlay text-text-secondary hover:bg-hover-overlay hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <PauseCircle size={13} />
            Pause Automation
          </button>
        )}

        {!policy.renewal_manual_override && (
          <button
            onClick={() => setShowManualForm(v => !v)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-hover-overlay text-text-secondary hover:bg-hover-overlay hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            Mark Manually Handled
          </button>
        )}

        <button
          onClick={handleToggleRequireApproval}
          disabled={isPending}
          className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
            policy.require_approval
              ? "bg-[#3d2e00] text-[#f59e0b] hover:bg-[#4a3800]"
              : "bg-hover-overlay text-text-secondary hover:bg-hover-overlay hover:text-text-primary"
          }`}
        >
          <ShieldCheck size={13} />
          {policy.require_approval ? "High-touch On" : "Require Approval"}
        </button>

        {canConfirm && (
          <button
            onClick={handleConfirmRenewal}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-hover-overlay text-text-primary hover:bg-hover-overlay transition-colors disabled:opacity-50"
          >
            <BadgeCheck size={13} />
            Confirm Renewal
          </button>
        )}
      </div>

      {/* Pause form */}
      {showPauseForm && (
        <div className="rounded-lg bg-background border border-border p-4 space-y-3">
          <div className="text-[12px] text-text-secondary">
            Pause until a specific date, or leave blank to pause indefinitely.
          </div>
          <input
            type="date"
            value={pauseUntil}
            onChange={e => setPauseUntil(e.target.value)}
            className="block w-full text-[13px] bg-surface border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-border"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePause}
              disabled={isPending}
              className="text-[12px] px-3 py-1.5 rounded-lg bg-hover-overlay text-text-primary hover:bg-hover-overlay transition-colors disabled:opacity-50"
            >
              {isPending ? "Pausing…" : "Confirm Pause"}
            </button>
            <button
              onClick={() => setShowPauseForm(false)}
              className="text-[12px] px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmation email modal */}
      {showConfirmEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-text-secondary" />
                <span className="text-[14px] font-semibold text-text-primary">Send confirmation to client?</span>
              </div>
              <button
                onClick={() => setShowConfirmEmailModal(false)}
                className="text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={confirmEmailSubject}
                onChange={e => setConfirmEmailSubject(e.target.value)}
                className="block w-full text-[13px] bg-background border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-tertiary focus:outline-none focus:border-border"
              />
              <textarea
                value={confirmEmailBody}
                onChange={e => setConfirmEmailBody(e.target.value)}
                rows={6}
                className="block w-full text-[13px] bg-background border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-tertiary focus:outline-none focus:border-border resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSendConfirmEmail}
                disabled={isSendingEmail || !confirmEmailSubject.trim() || !confirmEmailBody.trim()}
                className="flex-1 text-[13px] py-2 rounded-lg bg-hover-overlay text-text-primary hover:bg-hover-overlay transition-colors disabled:opacity-40"
              >
                {isSendingEmail ? "Sending…" : "Send Email"}
              </button>
              <button
                onClick={() => setShowConfirmEmailModal(false)}
                className="text-[13px] px-4 py-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual handled form */}
      {showManualForm && (
        <div className="rounded-lg bg-background border border-border p-4 space-y-3">
          <div className="text-[12px] text-text-secondary">
            Add a note about how this renewal was handled outside the system.
          </div>
          <textarea
            value={manualNote}
            onChange={e => setManualNote(e.target.value)}
            placeholder="e.g. Bound with new carrier, called client directly…"
            rows={2}
            className="block w-full text-[13px] bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-tertiary focus:outline-none focus:border-border resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleMarkManual}
              disabled={isPending}
              className="text-[12px] px-3 py-1.5 rounded-lg bg-hover-overlay text-text-primary hover:bg-hover-overlay transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Confirm"}
            </button>
            <button
              onClick={() => setShowManualForm(false)}
              className="text-[12px] px-3 py-1.5 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
