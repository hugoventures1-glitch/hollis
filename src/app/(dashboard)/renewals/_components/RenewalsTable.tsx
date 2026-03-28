"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MessageSquare } from "lucide-react";
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
  questionnaire_sent: "View",
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
  critical: { color: "#FF4444", pulse: true  },
  stalled:  { color: "#2E2E2E", pulse: false },
};

function HealthDot({ label }: { label: HealthLabel | null | undefined }) {
  if (!label) {
    return <div className="w-2 h-2 shrink-0 rounded-full" style={{ background: "#1E1E1E" }} />;
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
  questionnaire_sent: 3,
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
                ? current ? "#AAAAAA" : "#3A3A3A"
                : progress === 5 ? "#00D97E33" : "#1E1E1E",
              boxShadow: done && current ? "0 0 4px #AAAAAA" : "none",
            }}
            title={label}
          />
        );
      })}
    </div>
  );
}

// ── Urgency helpers ───────────────────────────────────────────────────────────

function urgencyColor(days: number): string {
  if (days <= 14) return "#FF4444";
  if (days <= 30) return "#F59E0B";
  if (days <= 60) return "#666666";
  return "#3A3A3A";
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  policy: Policy;
  clientId: string | undefined;
  optimisticStage: CampaignStage | null;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
  onLogSignal: (policyId: string, clientName: string) => void;
}

const RenewalRow = memo(function RenewalRow({ policy, clientId, optimisticStage, onStageUpdate, onStageRevert, onLogSignal }: RowProps) {
  const { toast }          = useToast();
  const router             = useRouter();
  const [loading, setLoading] = useState(false);

  const days           = daysUntilExpiry(policy.expiration_date);
  const effectiveStage = optimisticStage ?? policy.campaign_stage;

  const TERMINAL_STAGES: CampaignStage[] = ["complete", "confirmed", "lapsed"];
  const NEW_STAGES: CampaignStage[]      = [
    "questionnaire_sent", "submission_sent", "recommendation_sent", "final_notice_sent",
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
      const res  = await fetch(`/api/actions/renew/${policy.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        onStageRevert(policy.id);
        toast(data.error ?? "Action failed", "error");
        return;
      }
      if (data.newStage) onStageUpdate(policy.id, data.newStage as CampaignStage);
      toast(
        toastMessageForAction(data.channel, data.recipient, data.newStage, policy.client_name),
        "success",
      );
    } catch {
      onStageRevert(policy.id);
      toast("Connection error — please try again", "error");
    } finally {
      setLoading(false);
    }
  }, [canSend, loading, effectiveStage, policy, onStageUpdate, onStageRevert, toast]);

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
      onClick={() => router.push(
        clientId
          ? `/clients/${clientId}?trail=${buildTrailParam([], "Renewals", "/renewals")}`
          : `/renewals/${policy.id}`
      )}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.018)";
        const clientInfo = (e.currentTarget as HTMLElement).querySelector('[data-client-info]') as HTMLElement;
        if (clientInfo) {
          const policyId = clientInfo.querySelector('[data-policy-id]') as HTMLElement;
          if (policyId) policyId.style.color = "#FAFAFA";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "";
        const clientInfo = (e.currentTarget as HTMLElement).querySelector('[data-client-info]') as HTMLElement;
        if (clientInfo) {
          const policyId = clientInfo.querySelector('[data-policy-id]') as HTMLElement;
          if (policyId) policyId.style.color = "rgba(250,250,250,0.2)";
        }
      }}
    >
      {/* Client name + policy ID — primary info (health dot moves with expansion) */}
      <div className="flex-1 min-w-0 flex items-center gap-3 py-4 transition-transform duration-200 group-hover:scale-105" data-client-info>
        <HealthDot label={policy.health_label} />
        <div className="min-w-0">
          <div
            className="truncate leading-snug transition-colors duration-200"
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   15,
              fontWeight: 600,
              color:      "#FAFAFA",
              letterSpacing: "-0.01em",
            }}
          >
            {policy.client_name}
          </div>
          <div
            className="truncate mt-0.5 flex items-center gap-2 transition-colors duration-200"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   11,
              color:      "rgba(250,250,250,0.2)",
            }}
            data-policy-id
          >
            {policy.policy_name}
            {policy.carrier && (
              <span style={{ color: "rgba(250,250,250,0.1)" }}>· {policy.carrier}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stage progress dots */}
      <StageDots stage={effectiveStage} />

      {/* Expiry date */}
      <div className="shrink-0 hidden sm:block" style={{ width: 68 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#2E2E2E" }}>
          {expiry}
        </span>
      </div>

      {/* Days remaining — visual anchor */}
      <div className="shrink-0 text-right" style={{ width: 52 }}>
        <div
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
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#2E2E2E", marginTop: 2, letterSpacing: "0.04em" }}>
          {days < 0 ? "PAST" : "DAYS"}
        </div>
      </div>

      {/* Premium */}
      <div className="shrink-0 text-right hidden md:block" style={{ width: 72 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#333" }}>
          {policy.premium ? `$${Number(policy.premium).toLocaleString()}` : "—"}
        </span>
      </div>

      {/* Actions — hover only, slides in from right */}
      <div
        className="shrink-0 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: 112 }}
      >
        {/* Log response button */}
        <button
          onClick={(e) => { e.stopPropagation(); onLogSignal(policy.id, policy.client_name); }}
          title="Log client response"
          className="flex items-center justify-center h-7 w-7 rounded-md transition-colors shrink-0"
          style={{ background: "#141414", color: "#444", border: "1px solid #222" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#00d4aa";
            (e.currentTarget as HTMLElement).style.borderColor = "#00d4aa33";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#444";
            (e.currentTarget as HTMLElement).style.borderColor = "#222";
          }}
        >
          <MessageSquare size={12} />
        </button>

        {canSend ? (
          <ActionButton
            label={SEND_LABEL[effectiveStage]}
            onClick={handleSendNow as unknown as () => void}
            loading={loading}
            variant="default"
          />
        ) : (
          <div
            className="flex items-center justify-center h-7 w-7 rounded-md transition-colors"
            style={{ background: "#1A1A1A", color: "#333" }}
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
  onLogSignal,
}: {
  group: Group;
  optimisticStages: Record<string, CampaignStage>;
  clientIdByName: Map<string, string>;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
  onLogSignal: (policyId: string, clientName: string) => void;
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
            style={{ background: "#FF4444", boxShadow: "0 0 6px #FF444488" }}
          />
        )}
        <span
          style={{
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: "0.02em",
            textTransform: "capitalize",
            color:         group.urgent ? "#FF6666" : "#FAFAFA",
            fontFamily:    "var(--font-sans)",
          }}
        >
          {group.title}
        </span>
        <span style={{ fontSize: 11, color: "#333", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
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
          onLogSignal={onLogSignal}
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

  const storeClients = useHollisStore(s => s.clients);
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

  const openSignal = useCallback((policyId: string, clientName: string) => {
    setSignalPolicy({ id: policyId, clientName });
  }, []);

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
      const buckets: [Group, Group, Group, Group] = [
        { title: "Questionnaire Pending", policies: [] },
        { title: "Submission Out",        policies: [] },
        { title: "Recommendation Sent",   policies: [] },
        { title: "Final Notice",          policies: [] },
      ];
      const stageIndex: Partial<Record<string, number>> = {
        questionnaire_sent:  0,
        submission_sent:     1,
        recommendation_sent: 2,
        final_notice_sent:   3,
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
            onLogSignal={openSignal}
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
    <span className="text-[13px]" style={{ color: "#FAFAFA" }}>Renewals</span>
  );
}
