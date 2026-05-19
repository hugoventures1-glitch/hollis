"use client";

import { useState, useCallback, useEffect, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MessageSquare, Trash2, Flag } from "lucide-react";
import { ActionButton } from "@/components/actions/ActionButton";
import { useToast } from "@/components/actions/MicroToast";
import { SignalModal } from "@/components/renewals/SignalModal";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage, HealthLabel } from "@/types/renewals";
import { useHollisStore } from "@/stores/hollisStore";
import { buildTrailParam } from "@/lib/trail";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ViewTab = "action" | "progress" | "completed";

// ── Send label ────────────────────────────────────────────────────────────────

const SEND_LABEL: Record<CampaignStage, string> = {
  pending:            "Start",
  email_90_sent:      "60-day",
  email_60_sent:      "SMS",
  sms_30_sent:        "Script",
  script_14_ready:    "Complete",
  complete:           "Complete",
  submission_sent:    "View",
  recommendation_sent:"View",
  final_notice_sent:  "View",
  confirmed:          "Confirmed",
  lapsed:             "Lapsed",
};

function toastMessageForAction(
  channel: string,
  recipient: string,
  newStage: string,
  clientName: string,
): string {
  if (newStage === "complete") return `${clientName} marked as complete`;
  if (newStage === "script_14_ready") return `Call script ready for ${clientName}`;
  if (channel === "sms") return `SMS sent to ${recipient}`;
  return `Renewal email sent to ${clientName}`;
}

// ── Health glow dot ───────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<HealthLabel, { color: string; pulse: boolean }> = {
  healthy:  { color: "#00D97E", pulse: false },
  at_risk:  { color: "#F59E0B", pulse: true  },
  critical: { color: "var(--danger)", pulse: true  },
  stalled:  { color: "var(--border)", pulse: false },
};

function HealthDot({ label }: { label: HealthLabel | null | undefined }) {
  if (!label) {
    return <div className="w-2 h-2 shrink-0 rounded-full" style={{ background: "var(--border)" }} />;
  }
  const { color, pulse } = HEALTH_CONFIG[label];
  return (
    <div
      className={`w-2 h-2 shrink-0 rounded-full${pulse ? " animate-pulse" : ""}`}
      style={{ background: color, boxShadow: `0 0 7px ${color}88` }}
      title={label.replace("_", " ")}
    />
  );
}

// ── Stage progress dots ───────────────────────────────────────────────────────

const STAGE_ORDER: CampaignStage[] = [
  "pending",
  "email_90_sent",
  "email_60_sent",
  "sms_30_sent",
  "script_14_ready",
  "complete",
];

const STAGE_DOT_LABELS = ["90d", "60d", "SMS", "Script", "Done"];

// Map every stage to a progress index (how many milestones are "done")
const STAGE_PROGRESS: Record<CampaignStage, number> = {
  pending:            0,
  email_90_sent:      1,
  email_60_sent:      2,
  sms_30_sent:        3,
  script_14_ready:    4,
  submission_sent:    4,
  recommendation_sent:4,
  final_notice_sent:  4,
  complete:           5,
  confirmed:          5,
  lapsed:             5,
};

function StageDots({ stage }: { stage: CampaignStage }) {
  const progress = STAGE_PROGRESS[stage];
  return (
    <div className="flex items-center gap-1.5 shrink-0" aria-label={`Stage: ${stage}`}>
      {STAGE_DOT_LABELS.map((label, i) => {
        const done    = i < progress;
        const current = i === progress - 1 && progress > 0 && progress < 5;
        return (
          <div
            key={label}
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: done
                ? current ? "var(--text-secondary)" : "#3A3A3A"
                : progress === 5 ? "#00D97E33" : "var(--border)",
              boxShadow: done && current ? "0 0 4px var(--text-secondary)" : "none",
            }}
            title={label}
          />
        );
      })}
    </div>
  );
}

// ── Expiry flag (≤7 days) ─────────────────────────────────────────────────────

function ExpiryFlag() {
  return (
    <div
      className="shrink-0 flex items-center gap-1 animate-pulse"
      title="Expiring within 7 days"
      style={{ color: "var(--danger)" }}
    >
      <Flag size={11} fill="currentColor" />
    </div>
  );
}

// ── Urgency helpers ───────────────────────────────────────────────────────────

function urgencyColor(days: number): string {
  if (days <= 7)  return "var(--danger)";
  if (days <= 14) return "var(--danger)";
  if (days <= 30) return "#F59E0B";
  if (days <= 60) return "var(--text-secondary)";
  return "#3A3A3A";
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  policy: Policy;
  clientId: string | undefined;
  optimisticStage: CampaignStage | null;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
  onStageConfirm: (id: string, stage: CampaignStage) => void;
  onLogSignal: (policyId: string, clientName: string) => void;
  onArchive: (id: string) => void;
}

const RenewalRow = memo(function RenewalRow({ policy, clientId, optimisticStage, onStageUpdate, onStageRevert, onStageConfirm, onLogSignal, onArchive }: RowProps) {
  const { toast }          = useToast();
  const router             = useRouter();
  const [loading, setLoading] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  // Reset confirm state after 3s of no interaction
  useEffect(() => {
    if (!archiveConfirm) return;
    const t = setTimeout(() => setArchiveConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [archiveConfirm]);

  const days           = daysUntilExpiry(policy.expiration_date);
  const effectiveStage = optimisticStage ?? policy.campaign_stage;

  const TERMINAL_STAGES: CampaignStage[] = ["complete", "confirmed", "lapsed"];
  const NEW_STAGES: CampaignStage[]      = [
    "submission_sent", "recommendation_sent", "final_notice_sent",
  ];
  const canSend = !TERMINAL_STAGES.includes(effectiveStage) && !NEW_STAGES.includes(effectiveStage);

  const handleSendNow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canSend || loading) return;
    setLoading(true);

    const nextStageMap: Partial<Record<CampaignStage, CampaignStage>> = {
      pending:         "email_90_sent",
      email_90_sent:   "email_60_sent",
      email_60_sent:   "sms_30_sent",
      sms_30_sent:     "script_14_ready",
      script_14_ready: "complete",
    };
    const predictedStage = nextStageMap[effectiveStage];
    if (predictedStage) onStageUpdate(policy.id, predictedStage);

    try {
      const hasOverride = pendingOverride !== null;
      const res = await fetch(`/api/actions/renew/${policy.id}`, {
        method: "POST",
        ...(hasOverride && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ override: true }),
        }),
      });
      const data = await res.json();

      // Tier 3: hard block — no retry
      if (data.blocked) {
        onStageRevert(policy.id);
        setPendingOverride(null);
        toast(`Blocked — ${data.reason}`, "error");
        return;
      }

      // Tier 2: queue for approval, require re-click to override
      if (data.flagged) {
        onStageRevert(policy.id);
        setPendingOverride(data.reason);
        const msg = data.mode === "learning"
          ? "Queued for your approval — or click again to send now."
          : `Queued for your approval — ${data.reason}. Click again to send now.`;
        toast(msg, "info");
        return;
      }

      // Generic error
      if (!res.ok || data.error) {
        onStageRevert(policy.id);
        setPendingOverride(null);
        toast(data.error ?? "Action failed", "error");
        return;
      }

      // Success (Tier 1 or Tier 2 override)
      setPendingOverride(null);
      if (data.newStage) {
        onStageUpdate(policy.id, data.newStage as CampaignStage);
        onStageConfirm(policy.id, data.newStage as CampaignStage);
      }
      toast(
        toastMessageForAction(data.channel, data.recipient, data.newStage, policy.client_name),
        "success",
      );
    } catch {
      onStageRevert(policy.id);
      setPendingOverride(null);
      toast("Connection error — please try again", "error");
    } finally {
      setLoading(false);
    }
  }, [canSend, loading, pendingOverride, effectiveStage, policy, onStageUpdate, onStageRevert, onStageConfirm, toast]);

  const dColor = urgencyColor(days);
  const expiry = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-AU", {
    month: "short",
    day:   "numeric",
  });

  return (
    <div
      className="group flex items-center gap-5 px-14 cursor-pointer select-none transition-colors duration-100"
      style={{
        minHeight: 72,
        backgroundImage: "linear-gradient(to right, transparent 0%, transparent 56px, #353535 56px, #353535 calc(100% - 56px), transparent calc(100% - 56px), transparent 100%)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 1px",
        backgroundPosition: "0 100%",
      }}
      onClick={() => router.push(`/renewals/${policy.id}?trail=${buildTrailParam([], "Renewals", "/renewals")}`)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.018)";
        const clientInfo = (e.currentTarget as HTMLElement).querySelector('[data-client-info]') as HTMLElement;
        if (clientInfo) {
          const policyId = clientInfo.querySelector('[data-policy-id]') as HTMLElement;
          if (policyId) policyId.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "";
        const clientInfo = (e.currentTarget as HTMLElement).querySelector('[data-client-info]') as HTMLElement;
        if (clientInfo) {
          const policyId = clientInfo.querySelector('[data-policy-id]') as HTMLElement;
          if (policyId) policyId.style.color = "var(--text-tertiary)";
        }
      }}
    >
      {/* Client name + policy ID — primary info (health dot moves with expansion) */}
      <div className="flex-1 min-w-0 flex items-center gap-3 py-4 transition-transform duration-200 group-hover:scale-105" data-client-info>
        <HealthDot label={policy.health_label} />
        {days <= 7 && <ExpiryFlag />}
        <div className="min-w-0">
          <div
            className="truncate leading-snug transition-colors duration-200"
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   15,
              fontWeight: 600,
              color:      "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            {policy.client_name}
          </div>
          <div
            className="truncate mt-0.5 flex items-center gap-2 transition-colors duration-200"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   11,color: "var(--text-tertiary)",
            }}
            data-policy-id
          >
            {policy.policy_name}
            {policy.carrier && (
              <span style={{ color: "var(--text-tertiary)" }}>· {policy.carrier}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stage progress dots */}
      <StageDots stage={effectiveStage} />

      {/* Expiry date */}
      <div className="shrink-0 hidden sm:block" style={{ width: 68 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          {expiry}
        </span>
      </div>

      {/* Days remaining — visual anchor */}
      <div className="shrink-0 text-right" style={{ width: 52 }}>
        <div
          className={days <= 7 && days >= 0 ? "animate-pulse" : ""}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize:   20,
            fontWeight: 700,
            lineHeight: 1,
            color:      dColor,
          }}
        >
          {Math.abs(days)}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: days <= 7 && days >= 0 ? "var(--danger)" : "var(--text-tertiary)", marginTop: 2, letterSpacing: "0.04em" }}>
          {days < 0 ? "PAST" : days <= 7 ? "URGENT" : "DAYS"}
        </div>
      </div>

      {/* Premium */}
      <div className="shrink-0 text-right hidden md:block" style={{ width: 72 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
          {policy.premium ? `$${Number(policy.premium).toLocaleString()}` : "—"}
        </span>
      </div>

      {/* Actions — hover only, slides in from right */}
      <div
        className="shrink-0 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: 140 }}
      >
        {/* Archive button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (archiveConfirm) {
              onArchive(policy.id);
            } else {
              setArchiveConfirm(true);
            }
          }}
          title={archiveConfirm ? "Click again to delete" : "Delete policy"}
          className="flex items-center justify-center h-7 rounded-md transition-all duration-150 shrink-0"
          style={{
            background: archiveConfirm ? "#2A0A0A" : "var(--surface-raised)",
            color: archiveConfirm ? "#FF6666" : "var(--text-tertiary)",
            border: `1px solid ${archiveConfirm ? "#FF444433" : "var(--border)"}`,
            width: archiveConfirm ? 80 : 28,
            gap: 4,
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            paddingLeft: archiveConfirm ? 8 : 0,
            paddingRight: archiveConfirm ? 8 : 0,
          }}
          onMouseEnter={(e) => {
            if (!archiveConfirm) {
              (e.currentTarget as HTMLElement).style.color = "#FF6666";
              (e.currentTarget as HTMLElement).style.borderColor = "#FF444433";
            }
          }}
          onMouseLeave={(e) => {
            if (!archiveConfirm) {
              (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            }
          }}
        >
          <Trash2 size={12} style={{ flexShrink: 0 }} />
          {archiveConfirm && <span>confirm</span>}
        </button>

        {/* Log response button */}
        <button
          onClick={(e) => { e.stopPropagation(); onLogSignal(policy.id, policy.client_name); }}
          title="Log client response"
          className="flex items-center justify-center h-7 w-7 rounded-md transition-colors shrink-0"
          style={{ background: "var(--surface-raised)", color: "var(--text-tertiary)", border: "1px solid var(--border)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#00d4aa";
            (e.currentTarget as HTMLElement).style.borderColor = "#00d4aa33";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          }}
        >
          <MessageSquare size={12} />
        </button>

        {canSend ? (
          <ActionButton
            label={pendingOverride !== null ? `Confirm ${SEND_LABEL[effectiveStage]}` : SEND_LABEL[effectiveStage]}
            onClick={handleSendNow as unknown as () => void}
            loading={loading}
            variant={pendingOverride !== null ? "ghost" : "default"}
          />
        ) : (
          <div
            className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
            style={{ background: "var(--surface)", color: "var(--text-tertiary)" }}
          >
            <ChevronRight size={13} />
          </div>
        )}
      </div>
    </div>
  );
});

// ── Group section ─────────────────────────────────────────────────────────────

interface Group {
  title: string;
  policies: Policy[];
  urgent?: boolean;
}

function PolicyGroup({
  group,
  optimisticStages,
  clientIdByName,
  onStageUpdate,
  onStageRevert,
  onStageConfirm,
  onLogSignal,
  onArchive,
}: {
  group: Group;
  optimisticStages: Record<string, CampaignStage>;
  clientIdByName: Map<string, string>;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
  onStageConfirm: (id: string, stage: CampaignStage) => void;
  onLogSignal: (policyId: string, clientName: string) => void;
  onArchive: (id: string) => void;
}) {
  if (group.policies.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Group header */}
      <div
        className="flex items-center gap-1.5 px-14 py-3"
        style={{
          backgroundImage: "linear-gradient(to right, transparent 0%, transparent 56px, #353535 56px, #353535 calc(100% - 56px), transparent calc(100% - 56px), transparent 100%)",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 1px",
          backgroundPosition: "0 100%",
        }}
      >
        {group.urgent && (
          <span
            className="w-2 h-2 rounded-full animate-pulse shrink-0"
            style={{ background: "var(--danger)", boxShadow: "0 0 6px rgba(204,41,41,0.53)" }}
          />
        )}
        <span
          style={{
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: "0.02em",
            textTransform: "capitalize",
            color:         group.urgent ? "#FF6666" : "var(--text-primary)",
            fontFamily:    "var(--font-sans)",
          }}
        >
          {group.title}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
          {group.policies.length}
        </span>
      </div>

      {/* Rows */}
      {group.policies.map((p) => (
        <RenewalRow
          key={p.id}
          policy={p}
          clientId={clientIdByName.get(p.client_name)}
          optimisticStage={optimisticStages[p.id] ?? null}
          onStageUpdate={onStageUpdate}
          onStageRevert={onStageRevert}
          onStageConfirm={onStageConfirm}
          onLogSignal={onLogSignal}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface RenewalsTableProps {
  policies:    Policy[];
  view:        ViewTab;
  searchQuery: string;
}

export function RenewalsTable({ policies, view, searchQuery }: RenewalsTableProps) {
  const [optimisticStages, setOptimisticStages] = useState<Record<string, CampaignStage>>({});
  const [signalPolicy, setSignalPolicy] = useState<{ id: string; clientName: string } | null>(null);

  const { toast } = useToast();
  const storeClients = useHollisStore(s => s.clients);
  const removePolicy = useHollisStore(s => s.removePolicy);
  const updatePolicyStage = useHollisStore(s => s.updatePolicyStage);
  const clientIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of storeClients) map.set(c.name, c.id);
    return map;
  }, [storeClients]);

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

  const confirmStage = useCallback((id: string, stage: CampaignStage) => {
    updatePolicyStage(id, stage);
  }, [updatePolicyStage]);

  const openSignal = useCallback((policyId: string, clientName: string) => {
    setSignalPolicy({ id: policyId, clientName });
  }, []);

  const archivePolicy = useCallback(async (id: string) => {
    // Optimistically remove from store immediately
    removePolicy(id);
    try {
      const res = await fetch(`/api/renewals/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast("Failed to delete policy", "error");
        // Re-fetch to restore if it failed
        useHollisStore.getState().fetchAll();
      } else {
        toast("Policy deleted", "success");
      }
    } catch {
      toast("Connection error", "error");
      useHollisStore.getState().fetchAll();
    }
  }, [removePolicy, toast]);

  // Build groups based on view tab — single pass per group set, memoized
  const groups = useMemo<Group[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? policies.filter(
          (p) =>
            p.client_name.toLowerCase().includes(q) ||
            p.policy_name.toLowerCase().includes(q) ||
            (p.carrier ?? "").toLowerCase().includes(q) ||
            (p.client_email ?? "").toLowerCase().includes(q),
        )
      : policies;

    if (view === "action") {
      const buckets: [Group, Group, Group] = [
        { title: "Expiring in < 30 Days", policies: [], urgent: true },
        { title: "Expiring in 30–60 Days", policies: [] },
        { title: "On Track", policies: [] },
      ];
      for (const p of filtered) {
        const d = daysUntilExpiry(p.expiration_date);
        if (d <= 30) buckets[0].policies.push(p);
        else if (d <= 60) buckets[1].policies.push(p);
        else buckets[2].policies.push(p);
      }
      return buckets;
    }

    if (view === "progress") {
      const buckets: [Group, Group, Group] = [
        { title: "Submission Out",      policies: [] },
        { title: "Recommendation Sent", policies: [] },
        { title: "Final Notice",        policies: [] },
      ];
      const stageIndex: Partial<Record<string, number>> = {
        submission_sent:     0,
        recommendation_sent: 1,
        final_notice_sent:   2,
      };
      for (const p of filtered) {
        const i = stageIndex[p.campaign_stage];
        if (i !== undefined) buckets[i].policies.push(p);
      }
      return buckets;
    }

    // "completed" tab
    const buckets: [Group, Group, Group] = [
      { title: "Confirmed", policies: [] },
      { title: "Complete",  policies: [] },
      { title: "Lapsed",    policies: [] },
    ];
    const stageIndex: Partial<Record<string, number>> = {
      confirmed: 0,
      complete:  1,
      lapsed:    2,
    };
    for (const p of filtered) {
      const i = stageIndex[p.campaign_stage];
      if (i !== undefined) buckets[i].policies.push(p);
    }
    return buckets;
  }, [policies, view, searchQuery]);

  if (groups.every(g => g.policies.length === 0)) return null;

  return (
    <>
      <div className="pb-4">
        {groups.map((g) => (
          <PolicyGroup
            key={g.title}
            group={g}
            optimisticStages={optimisticStages}
            clientIdByName={clientIdByName}
            onStageUpdate={updateStage}
            onStageRevert={revertStage}
            onStageConfirm={confirmStage}
            onLogSignal={openSignal}
            onArchive={archivePolicy}
          />
        ))}
      </div>

      {signalPolicy && (
        <SignalModal
          policyId={signalPolicy.id}
          clientName={signalPolicy.clientName}
          onClose={() => setSignalPolicy(null)}
          onSignalLogged={() => setSignalPolicy(null)}
        />
      )}
    </>
  );
}

// ── Breadcrumb helper ─────────────────────────────────────────────────────────

export function RenewalsBreadcrumb() {
  return (
    <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>Renewals</span>
  );
}
