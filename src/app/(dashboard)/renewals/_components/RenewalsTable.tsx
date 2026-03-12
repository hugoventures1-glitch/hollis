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
  questionnaire_sent: "View",
  submission_sent: "View",
  recommendation_sent: "View",
  final_notice_sent: "View",
  confirmed: "Confirmed",
  lapsed: "Lapsed",
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
  showHealth: boolean;
}

function RenewalRow({
  policy,
  optimisticStage,
  onStageUpdate,
  onStageRevert,
  showHealth,
}: RenewalRowProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [sendLoading, setSendLoading] = useState(false);
  const [coiLoading, setCoiLoading] = useState(false);

  const days = daysUntilExpiry(policy.expiration_date);
  const rowUrgent = days <= 14 && policy.status === "active";
  const effectiveStage = optimisticStage ?? policy.campaign_stage;
  const TERMINAL_STAGES: CampaignStage[] = ["complete", "confirmed", "lapsed"];
  const NEW_STAGES: CampaignStage[] = [
    "questionnaire_sent", "submission_sent", "recommendation_sent", "final_notice_sent",
  ];
  const canSend = !TERMINAL_STAGES.includes(effectiveStage) && !NEW_STAGES.includes(effectiveStage);

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
      // New stages navigate to the detail page — no direct send action
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
      className="group transition-colors"
      style={{ borderBottom: "1px solid #1C1C1C" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#161616"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      <td className="px-10 py-3">
        <Link href={`/renewals/${policy.id}`} className="block">
          <div className="flex items-center gap-1.5">
            {rowUrgent && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#FF4444" }} />
            )}
            <span className="text-[13px] font-medium leading-snug transition-colors" style={{ color: "#FAFAFA" }}>
              {policy.policy_name}
            </span>
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "#555555" }}>
            {policy.client_name}
            {policy.client_email && (
              <span style={{ color: "#333333", margin: "0 4px" }}>·</span>
            )}
            <span style={{ color: "#333333" }}>{policy.client_email}</span>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px]" style={{ color: "#555555" }}>{policy.carrier}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px] tabular-nums" style={{ color: "#555555" }}>
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
      {showHealth && (
        <td className="px-4 py-3">
          <HealthBadge label={policy.health_label} />
        </td>
      )}
      <td className="px-4 py-3">
        <span className="text-[12px]" style={{ color: "#555555" }}>
          {policy.last_contact_at
            ? new Date(policy.last_contact_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : <span style={{ color: "#333333" }}>Never</span>}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[13px]" style={{ color: "#555555" }}>
          {policy.premium ? `$${Number(policy.premium).toLocaleString()}` : "—"}
        </span>
      </td>

      {/* Actions column */}
      <td className="px-4 py-3 w-[140px]">
        <div className="flex items-center gap-1">
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
            className="inline-flex items-center h-7 px-2 transition-colors"
            style={{ color: "#333333" }}
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
  const showHealth = policies.some((p) => p.health_label);

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
      <thead className="sticky top-0 z-10" style={{ background: "var(--background)" }}>
        <tr style={{ borderBottom: "1px solid #1C1C1C" }}>
          <th className="px-10 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Policy
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Carrier
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Expiry
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Days
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Stage
          </th>
          {showHealth && (
            <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
              Health
            </th>
          )}
          <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Last Contact
          </th>
          <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
            Premium
          </th>
          <th className="px-4 py-3 w-[140px] text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
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
            showHealth={showHealth}
          />
        ))}
      </tbody>
    </table>
  );
}

// ── Breadcrumb helper (re-exported so the server page can use it) ─────────────

export function RenewalsBreadcrumb() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[#555555]">
      <span>Hollis</span>
      <ChevronRight size={12} />
      <span className="text-[#FAFAFA]">Renewals</span>
    </div>
  );
}
