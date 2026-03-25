"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, CheckCircle2, AlertTriangle, BadgeCheck } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";
import type { Policy, CampaignStage } from "@/types/renewals";

const TERMINAL_STAGES: CampaignStage[] = ["confirmed", "lapsed", "complete"];

interface RenewalOverrideControlsProps {
  policy: Pick<Policy, "id" | "renewal_paused" | "renewal_paused_until" | "renewal_manual_override" | "campaign_stage">;
}

export function RenewalOverrideControls({ policy }: RenewalOverrideControlsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseUntil, setPauseUntil] = useState(policy.renewal_paused_until ?? "");
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualNote, setManualNote] = useState(policy.renewal_manual_override ?? "");

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
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to confirm", "error");
      }
    });
  };

  const canConfirm = !TERMINAL_STAGES.includes(policy.campaign_stage as CampaignStage);

  return (
    <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 space-y-4">
      <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest">
        Campaign Controls
      </div>

      {/* Manual override notice */}
      {policy.renewal_manual_override && (
        <div className="flex items-start gap-3 rounded-lg bg-[#1C1C1C] border border-[#1C1C1C] px-4 py-3">
          <AlertTriangle size={14} className="text-[#9e9e9e] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[#9e9e9e]">Manually handled</div>
            <div className="text-[12px] text-[#9e9e9e]/80 mt-0.5">{policy.renewal_manual_override}</div>
          </div>
          <button
            onClick={handleClearManual}
            disabled={isPending}
            className="text-[11px] text-[#9e9e9e] hover:text-[#9e9e9e] transition-colors shrink-0 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Paused notice */}
      {policy.renewal_paused && !policy.renewal_manual_override && (
        <div className="flex items-start gap-3 rounded-lg bg-[#ffffff06] border border-[#1C1C1C] px-4 py-3">
          <PauseCircle size={14} className="text-[#8a8a8a] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-[12px] text-[#8a8a8a]">
            Automation paused
            {policy.renewal_paused_until && (
              <> until{" "}
                <span className="text-[#FAFAFA]">
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
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#FAFAFA]/[0.06] text-[#FAFAFA] hover:bg-[#FAFAFA]/20 transition-colors disabled:opacity-50"
          >
            <PlayCircle size={13} />
            Resume Automation
          </button>
        ) : (
          <button
            onClick={() => setShowPauseForm(v => !v)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff06] text-[#8a8a8a] hover:bg-[#ffffff0a] hover:text-[#FAFAFA] transition-colors disabled:opacity-50"
          >
            <PauseCircle size={13} />
            Pause Automation
          </button>
        )}

        {!policy.renewal_manual_override && (
          <button
            onClick={() => setShowManualForm(v => !v)}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff06] text-[#8a8a8a] hover:bg-[#ffffff0a] hover:text-[#FAFAFA] transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={13} />
            Mark Manually Handled
          </button>
        )}

        {canConfirm && (
          <button
            onClick={handleConfirmRenewal}
            disabled={isPending}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#FAFAFA]/[0.06] text-[#FAFAFA] hover:bg-[#FAFAFA]/[0.1] transition-colors disabled:opacity-50"
          >
            <BadgeCheck size={13} />
            Confirm Renewal
          </button>
        )}
      </div>

      {/* Pause form */}
      {showPauseForm && (
        <div className="rounded-lg bg-[#0C0C0C] border border-[#1C1C1C] p-4 space-y-3">
          <div className="text-[12px] text-[#8a8a8a]">
            Pause until a specific date, or leave blank to pause indefinitely.
          </div>
          <input
            type="date"
            value={pauseUntil}
            onChange={e => setPauseUntil(e.target.value)}
            className="block w-full text-[13px] bg-[#111111] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[#FAFAFA] focus:outline-none focus:border-[#555555]"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePause}
              disabled={isPending}
              className="text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff0a] text-[#FAFAFA] hover:bg-[#ffffff14] transition-colors disabled:opacity-50"
            >
              {isPending ? "Pausing…" : "Confirm Pause"}
            </button>
            <button
              onClick={() => setShowPauseForm(false)}
              className="text-[12px] px-3 py-1.5 rounded-lg text-[#8a8a8a] hover:text-[#8a8a8a] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual handled form */}
      {showManualForm && (
        <div className="rounded-lg bg-[#0C0C0C] border border-[#1C1C1C] p-4 space-y-3">
          <div className="text-[12px] text-[#8a8a8a]">
            Add a note about how this renewal was handled outside the system.
          </div>
          <textarea
            value={manualNote}
            onChange={e => setManualNote(e.target.value)}
            placeholder="e.g. Bound with new carrier, called client directly…"
            rows={2}
            className="block w-full text-[13px] bg-[#111111] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[#FAFAFA] placeholder-[#6b6b6b] focus:outline-none focus:border-[#555555] resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleMarkManual}
              disabled={isPending}
              className="text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff0a] text-[#FAFAFA] hover:bg-[#ffffff14] transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Confirm"}
            </button>
            <button
              onClick={() => setShowManualForm(false)}
              className="text-[12px] px-3 py-1.5 rounded-lg text-[#8a8a8a] hover:text-[#8a8a8a] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
