"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight } from "lucide-react";
import { StageBadge } from "@/components/renewals/stage-badge";
import { DaysBadge } from "@/components/renewals/days-badge";
import { HealthBadge } from "@/components/renewals/health-badge";
import { ActionButton } from "@/components/actions/ActionButton";
import { useToast } from "@/components/actions/MicroToast";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage } from "@/types/renewals";

// ── Label for the "Send Now" button based on campaign stage ───────────────────

const SEND_LABEL: Record<CampaignStage, string> = {
  pending: "Start Campaign",
  email_90_sent: "Send 60-day",
  email_60_sent: "Send SMS",
  sms_30_sent: "View Script",
  script_14_ready: "Mark Complete",
  complete: "Complete",
};

function toastMessageForAction(
  channel: string,
  recipient: string,
  newStage: string,
  clientName: string
): string {
  if (newStage === "complete") return `${clientName} marked as complete`;
  if (newStage === "script_14_ready") return `Call script ready for ${clientName}`;
  if (channel === "sms") return `SMS sent to ${recipient}`;
  return `Renewal email sent to ${clientName}`;
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RenewalRowProps {
  policy: Policy;
  optimisticStage: CampaignStage | null;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
}

function RenewalRow({
  policy,
  optimisticStage,
  onStageUpdate,
  onStageRevert,
}: RenewalRowProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [sendLoading, setSendLoading] = useState(false);
  const [coiLoading, setCoiLoading] = useState(false);

  const days = daysUntilExpiry(policy.expiration_date);
  const rowUrgent = days <= 14 && policy.status === "active";
  const effectiveStage = optimisticStage ?? policy.campaign_stage;
  const canSend = effectiveStage !== "complete";

  const handleSendNow = useCallback(async () => {
    if (!canSend || sendLoading) return;
    setSendLoading(true);

    // Optimistic update
    const nextStageMap: Partial<Record<CampaignStage, CampaignStage>> = {
      pending: "email_90_sent",
      email_90_sent: "email_60_sent",
      email_60_sent: "sms_30_sent",
      sms_30_sent: "script_14_ready",
      script_14_ready: "complete",
    };
    const predictedStage = nextStageMap[effectiveStage];
    if (predictedStage) onStageUpdate(policy.id, predictedStage);

    try {
      const res = await fetch(`/api/actions/renew/${policy.id}`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        onStageRevert(policy.id);
        toast(data.error ?? "Action failed", "error");
        return;
      }

      // Confirm optimistic stage with server response
      if (data.newStage) onStageUpdate(policy.id, data.newStage as CampaignStage);
      toast(
        toastMessageForAction(data.channel, data.recipient, data.newStage, policy.client_name),
        "success"
      );
    } catch {
      onStageRevert(policy.id);
      toast("Connection error — please try again", "error");
    } finally {
      setSendLoading(false);
    }
  }, [canSend, sendLoading, effectiveStage, policy, onStageUpdate, onStageRevert, toast]);

  const handleRequestCOI = useCallback(async () => {
    if (coiLoading) return;
    setCoiLoading(true);
    try {
      // Find the client by name using the policy's client_name
      // We need the clientId — for now navigate to certs/new with insured_name pre-filled
      // via the policy-level COI action (uses insured name match)
      const res = await fetch(`/api/actions/coi/request/${encodeURIComponent(policy.id)}`, {
        method: "POST",
      });

      // Fallback: if the action uses a clientId but we only have policy here,
      // we create a request based on the policy's client details via a different approach.
      // For renewals, we'll call with the policy ID and let the API resolve the client.
      const data = await res.json();
      if (!res.ok || data.error) {
        toast(data.error ?? "Could not create COI request", "error");
        return;
      }
      router.push(`/certificates/new?request=${data.requestId}`);
    } catch {
      toast("Connection error — please try again", "error");
    } finally {
      setCoiLoading(false);
    }
  }, [coiLoading, policy, toast, router]);

  return (
    <tr
      className={`group border-b border-[#1e1e2a]/60 hover:bg-white/[0.02] transition-colors ${
        rowUrgent ? "bg-red-950/[0.08]" : ""
      }`}
    >
      <td className="px-10 py-3">
        <Link href={`/renewals/${policy.id}`} className="block">
          <div className="text-[14px] font-medium text-[#f5f5f7] group-hover:text-[#00d4aa] transition-colors leading-snug">
            {policy.policy_name}
          </div>
          <div className="text-[12px] text-[#8a8b91] mt-0.5">
            {policy.client_name}
            {policy.client_email && (
              <span className="text-[#ffffff30] mx-1">·</span>
            )}
            <span className="text-[#505057]">{policy.client_email}</span>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px] text-[#c5c5cb]">{policy.carrier}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px] text-[#c5c5cb] tabular-nums">
          {new Date(policy.expiration_date + "T00:00:00").toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" }
          )}
        </span>
      </td>
      <td className="px-4 py-3">
        <DaysBadge days={days} />
      </td>
      <td className="px-4 py-3">
        <StageBadge stage={effectiveStage} />
      </td>
      <td className="px-4 py-3">
        <HealthBadge label={policy.health_label} />
      </td>
      <td className="px-4 py-3">
        <span className="text-[12px] text-[#8a8b91]">
          {policy.last_contact_at
            ? new Date(policy.last_contact_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "Never contacted"}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px] text-[#c5c5cb]">
          {policy.premium ? `$${Number(policy.premium).toLocaleString()}` : "—"}
        </span>
      </td>

      {/* Actions column — fixed 120px, fade in on hover */}
      <td className="px-4 py-3 w-[120px]">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {canSend ? (
            <ActionButton
              label={SEND_LABEL[effectiveStage]}
              onClick={handleSendNow}
              loading={sendLoading}
              variant="default"
            />
          ) : null}
          <Link
            href={`/renewals/${policy.id}`}
            className="inline-flex items-center h-7 px-2 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="View policy"
          >
            <ArrowRight size={13} />
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface RenewalsTableProps {
  policies: Policy[];
}

export function RenewalsTable({ policies }: RenewalsTableProps) {
  // Per-row optimistic stage overrides
  const [optimisticStages, setOptimisticStages] = useState<
    Record<string, CampaignStage>
  >({});

  const updateStage = useCallback((id: string, stage: CampaignStage) => {
    setOptimisticStages((prev) => ({ ...prev, [id]: stage }));
  }, []);

  const revertStage = useCallback((id: string) => {
    setOptimisticStages((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  if (policies.length === 0) return null;

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-[#0d0d12] z-10">
        <tr className="border-b border-[#1e1e2a]">
          <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Policy
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Carrier
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Expiry
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Days
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Stage
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Health
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Last Contact
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            Premium
          </th>
          {/* Fixed-width actions column — always present, buttons fade on hover */}
          <th className="px-4 py-3 w-[120px] text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {policies.map((policy) => (
          <RenewalRow
            key={policy.id}
            policy={policy}
            optimisticStage={optimisticStages[policy.id] ?? null}
            onStageUpdate={updateStage}
            onStageRevert={revertStage}
          />
        ))}
      </tbody>
    </table>
  );
}

// ── Breadcrumb helper (re-exported so the server page can use it) ─────────────

export function RenewalsBreadcrumb() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[#8a8b91]">
      <span>Hollis</span>
      <ChevronRight size={12} />
      <span className="text-[#f5f5f7]">Renewals</span>
    </div>
  );
}
