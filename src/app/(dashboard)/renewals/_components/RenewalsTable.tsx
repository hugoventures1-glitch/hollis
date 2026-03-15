"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ActionButton } from "@/components/actions/ActionButton";
import { useToast } from "@/components/actions/MicroToast";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage, HealthLabel } from "@/types/renewals";

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
  optimisticStage: CampaignStage | null;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
}

function RenewalRow({ policy, optimisticStage, onStageUpdate, onStageRevert }: RowProps) {
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
  const expiry = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-US", {
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
      onClick={() => router.push(`/renewals/${policy.id}`)}
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
      {/* Health indicator dot */}
      <HealthDot label={policy.health_label} />

      {/* Client name + policy ID — primary info */}
      <div className="flex-1 min-w-0 py-4 transition-transform duration-200 group-hover:scale-105" data-client-info>
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

      {/* Action — hover only, slides in from right */}
      <div
        className="shrink-0 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
        onClick={(e) => e.stopPropagation()}
        style={{ minWidth: 72 }}
      >
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
}

// ── Group section ─────────────────────────────────────────────────────────────

interface Group {
  title: string;
  policies: Policy[];
  urgent?: boolean;
}

function PolicyGroup({
  group,
  optimisticStages,
  onStageUpdate,
  onStageRevert,
}: {
  group: Group;
  optimisticStages: Record<string, CampaignStage>;
  onStageUpdate: (id: string, stage: CampaignStage) => void;
  onStageRevert: (id: string) => void;
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
          optimisticStage={optimisticStages[p.id] ?? null}
          onStageUpdate={onStageUpdate}
          onStageRevert={onStageRevert}
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

  // Apply search/command filter
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

  // Build groups based on view tab
  let groups: Group[];

  if (view === "action") {
    const critical = filtered.filter((p) => daysUntilExpiry(p.expiration_date) <= 30);
    const upcoming = filtered.filter((p) => {
      const d = daysUntilExpiry(p.expiration_date);
      return d > 30 && d <= 60;
    });
    const onTrack  = filtered.filter((p) => daysUntilExpiry(p.expiration_date) > 60);
    groups = [
      { title: "Expiring in < 30 Days", policies: critical, urgent: true },
      { title: "Expiring in 30–60 Days", policies: upcoming               },
      { title: "On Track",               policies: onTrack                },
    ];
  } else if (view === "progress") {
    groups = [
      { title: "Questionnaire Pending", policies: filtered.filter((p) => p.campaign_stage === "questionnaire_sent")   },
      { title: "Submission Out",        policies: filtered.filter((p) => p.campaign_stage === "submission_sent")      },
      { title: "Recommendation Sent",   policies: filtered.filter((p) => p.campaign_stage === "recommendation_sent") },
      { title: "Final Notice",          policies: filtered.filter((p) => p.campaign_stage === "final_notice_sent")    },
    ];
  } else {
    groups = [
      { title: "Confirmed", policies: filtered.filter((p) => p.campaign_stage === "confirmed") },
      { title: "Complete",  policies: filtered.filter((p) => p.campaign_stage === "complete")  },
      { title: "Lapsed",    policies: filtered.filter((p) => p.campaign_stage === "lapsed")    },
    ];
  }

  if (filtered.length === 0) return null;

  return (
    <div className="pb-4">
      {groups.map((g) => (
        <PolicyGroup
          key={g.title}
          group={g}
          optimisticStages={optimisticStages}
          onStageUpdate={updateStage}
          onStageRevert={revertStage}
        />
      ))}
    </div>
  );
}

// ── Breadcrumb helper ─────────────────────────────────────────────────────────

export function RenewalsBreadcrumb() {
  return (
    <div className="flex items-center gap-2 text-[13px]" style={{ color: "#555" }}>
      <span>Hollis</span>
      <ChevronRight size={11} />
      <span style={{ color: "#FAFAFA" }}>Renewals</span>
    </div>
  );
}
