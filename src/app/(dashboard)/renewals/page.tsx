"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Upload, Plus, ChevronRight, Loader2 } from "lucide-react";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage } from "@/types/renewals";
import { RenewalsTable } from "./_components/RenewalsTable";
import { useHollisData } from "@/hooks/useHollisData";
import { createClient } from "@/lib/supabase/client";

const STAGE_FILTER_OPTIONS: { label: string; value: CampaignStage | "all" }[] = [
  { label: "All",                value: "all"                  },
  { label: "Not Started",        value: "pending"              },
  { label: "90-Day Sent",        value: "email_90_sent"        },
  { label: "60-Day Sent",        value: "email_60_sent"        },
  { label: "SMS Sent",           value: "sms_30_sent"          },
  { label: "Script Ready",       value: "script_14_ready"      },
  { label: "Questionnaire Sent", value: "questionnaire_sent"   },
  { label: "Submission Sent",    value: "submission_sent"      },
  { label: "Recommendation Sent",value: "recommendation_sent"  },
  { label: "Final Notice",       value: "final_notice_sent"    },
  { label: "Confirmed",          value: "confirmed"            },
  { label: "Lapsed",             value: "lapsed"               },
  { label: "Complete",           value: "complete"             },
];

// ── Inner content (needs Suspense because it calls useSearchParams) ────────────

function RenewalsContent() {
  const searchParams = useSearchParams();
  const stageFilter = searchParams.get("stage") ?? "all";
  const statusFilter = searchParams.get("status") ?? "active";
  // "stalled" is a special filter derived from health_label, not a campaign stage
  const filterParam = searchParams.get("filter") ?? "";

  const { policies: activePolicies, loading: storeLoading, backgroundRefreshing } = useHollisData();

  // For non-active status filters, fall back to a client-side Supabase query
  // (the store only caches active policies)
  const [altRows, setAltRows] = useState<Policy[]>([]);
  const [altLoading, setAltLoading] = useState(false);

  useEffect(() => {
    if (statusFilter === "active") return;

    setAltLoading(true);
    const supabase = createClient();
    let q = supabase
      .from("policies")
      .select("*")
      .order("expiration_date", { ascending: true });

    if (statusFilter !== "all") {
      q = q.eq("status", statusFilter);
    }
    if (stageFilter !== "all") {
      q = q.eq("campaign_stage", stageFilter as CampaignStage);
    }

    q.then(({ data }) => {
      setAltRows((data ?? []) as Policy[]);
      setAltLoading(false);
    });
  }, [statusFilter, stageFilter]);

  // Determine displayed rows
  let rows: Policy[];
  if (filterParam === "stalled") {
    // Stalled filter overrides stage/status — shows quiet policies with health_label === "stalled"
    rows = activePolicies.filter((p) => p.health_label === "stalled");
  } else if (filterParam === "upcoming") {
    // Upcoming: policies expiring within next 60 days
    rows = activePolicies.filter((p) => {
      const days = daysUntilExpiry(p.expiration_date);
      return days >= 0 && days <= 60;
    });
  } else if (statusFilter === "active") {
    rows = activePolicies.filter(
      (p) => stageFilter === "all" || p.campaign_stage === stageFilter
    );
  } else {
    rows = altRows;
  }

  // Summary stats always come from the active-policies store slice
  const active = activePolicies;
  const urgent = active.filter(
    (p) => daysUntilExpiry(p.expiration_date) <= 30
  ).length;
  const needsAction = active.filter(
    (p) =>
      ["pending", "email_90_sent", "email_60_sent"].includes(p.campaign_stage) &&
      daysUntilExpiry(p.expiration_date) <= 60
  ).length;
  const questionnaireAwaiting = active.filter(
    (p) => p.campaign_stage === "questionnaire_sent"
  ).length;

  const isLoading =
    ((filterParam === "stalled" || filterParam === "upcoming") && storeLoading) ||
    (filterParam !== "stalled" && filterParam !== "upcoming" && statusFilter === "active" && storeLoading) ||
    (filterParam !== "stalled" && filterParam !== "upcoming" && statusFilter !== "active" && altLoading);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Renewals</span>
          {backgroundRefreshing && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "rgba(250,250,250,0.2)" }} title="Syncing…" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/renewals/templates"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md text-[13px] transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Templates
          </Link>
          <Link
            href="/renewals/upload"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md text-[13px] transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <Upload size={13} />
            Import CSV
          </Link>
          <Link
            href="/renewals/upload"
            className="h-8 px-4 flex items-center gap-1.5 rounded-[6px] text-[13px] font-medium transition-colors"
            style={{ background: "#FAFAFA", color: "#0C0C0C" }}
          >
            <Plus size={13} />
            Import Policies
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-0 px-10 py-8 shrink-0" style={{ borderBottom: "1px solid #1C1C1C" }}>
        <div className="pr-10">
          <div className="text-[32px] leading-none" style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: "#FAFAFA" }}>
            {active.length}
          </div>
          <div className="text-[12px] mt-1.5" style={{ color: "#555555" }}>Active Policies</div>
        </div>
        <div className="px-10" style={{ borderLeft: "1px solid #1C1C1C" }}>
          <div className="text-[32px] leading-none" style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: urgent > 0 ? "#FF4444" : "#FAFAFA" }}>{urgent}</div>
          <div className="text-[12px] mt-1.5" style={{ color: "#555555" }}>Expiring ≤30 Days</div>
        </div>
        <div className="px-10" style={{ borderLeft: "1px solid #1C1C1C" }}>
          <div className="text-[32px] leading-none" style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: needsAction > 0 ? "#888888" : "#FAFAFA" }}>{needsAction}</div>
          <div className="text-[12px] mt-1.5" style={{ color: "#555555" }}>Need Outreach</div>
        </div>
        {questionnaireAwaiting > 0 && (
          <div className="px-10" style={{ borderLeft: "1px solid #1C1C1C" }}>
            <div className="text-[32px] leading-none" style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: "#888888" }}>{questionnaireAwaiting}</div>
            <div className="text-[12px] mt-1.5" style={{ color: "#555555" }}>Awaiting Questionnaire</div>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-0.5 px-10 py-2.5 shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }}>
        {STAGE_FILTER_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/renewals?stage=${opt.value}&status=${statusFilter}`}
            className="px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors"
            style={{
              background: filterParam !== "stalled" && stageFilter === opt.value ? "#FAFAFA" : "transparent",
              color: filterParam !== "stalled" && stageFilter === opt.value ? "#0C0C0C" : "#555555",
              border: `1px solid ${filterParam !== "stalled" && stageFilter === opt.value ? "#FAFAFA" : "#1C1C1C"}`,
            }}
          >
            {opt.label}
          </Link>
        ))}

        <Link
          href="/renewals?filter=stalled"
          className="ml-2 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors"
          style={{
            background: filterParam === "stalled" ? "#FAFAFA" : "transparent",
            color: filterParam === "stalled" ? "#0C0C0C" : "#888888",
            border: `1px solid ${filterParam === "stalled" ? "#FAFAFA" : "#1C1C1C"}`,
          }}
        >
          Stalled
        </Link>

        <Link
          href="/renewals?stage=lapsed&status=expired"
          className="px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors"
          style={{
            background: stageFilter === "lapsed" && statusFilter === "expired" ? "#FAFAFA" : "transparent",
            color: stageFilter === "lapsed" && statusFilter === "expired" ? "#0C0C0C" : "#555555",
            border: `1px solid ${stageFilter === "lapsed" && statusFilter === "expired" ? "#FAFAFA" : "#1C1C1C"}`,
          }}
        >
          Lapsed
        </Link>

        <div className="ml-auto flex items-center gap-0.5">
          {(["active", "expired", "all"] as const).map((s) => (
            <Link
              key={s}
              href={`/renewals?stage=${stageFilter}&status=${s}`}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium capitalize whitespace-nowrap transition-colors"
              style={{
                background: statusFilter === s ? "#FAFAFA" : "transparent",
                color: statusFilter === s ? "#0C0C0C" : "#555555",
                border: `1px solid ${statusFilter === s ? "#FAFAFA" : "#1C1C1C"}`,
              }}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin" style={{ color: "#333333" }} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState stageFilter={stageFilter} filterParam={filterParam} />
        ) : (
          <RenewalsTable policies={rows} />
        )}
      </div>
    </div>
  );
}

// ── Page shell with Suspense boundary ────────────────────────────────────────

export default function RenewalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full bg-[#0C0C0C]">
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={22} className="animate-spin text-[#333333]" />
          </div>
        </div>
      }
    >
      <RenewalsContent />
    </Suspense>
  );
}

function EmptyState({ stageFilter, filterParam }: { stageFilter: string; filterParam: string }) {
  const isStalled = filterParam === "stalled";
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-[#1a1a24] flex items-center justify-center mb-4">
        <Plus size={24} className="text-[#555555]" />
      </div>
      <div className="text-[16px] font-semibold text-[#FAFAFA] mb-1">
        {isStalled ? "No stalled renewals" : stageFilter === "all" ? "No policies yet" : "No policies in this stage"}
      </div>
      <div className="text-[13px] text-[#555555] mb-6 max-w-xs">
        {isStalled
          ? "No stalled renewals — everything is on track."
          : stageFilter === "all"
          ? "Import your book of business via CSV to start your renewal campaigns."
          : "Policies advance through stages automatically each day."}
      </div>
      {stageFilter === "all" && !isStalled && (
        <Link
          href="/renewals/upload"
          className="h-9 px-5 flex items-center gap-2 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors"
        >
          <Upload size={14} />
          Import CSV
        </Link>
      )}
    </div>
  );
}
