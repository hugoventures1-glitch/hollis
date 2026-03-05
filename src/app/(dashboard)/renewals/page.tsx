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
  { label: "All",           value: "all"             },
  { label: "Not Started",   value: "pending"         },
  { label: "90-Day Sent",   value: "email_90_sent"   },
  { label: "60-Day Sent",   value: "email_60_sent"   },
  { label: "SMS Sent",      value: "sms_30_sent"     },
  { label: "Script Ready",  value: "script_14_ready" },
  { label: "Complete",      value: "complete"        },
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

  const isLoading =
    (filterParam === "stalled" && storeLoading) ||
    (filterParam !== "stalled" && statusFilter === "active" && storeLoading) ||
    (filterParam !== "stalled" && statusFilter !== "active" && altLoading);

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#8a8b91]">
          <span>Hollis</span>
          <ChevronRight size={12} />
          <span className="text-[#f5f5f7]">Renewals</span>
        </div>
        <div className="flex items-center gap-3">
          {backgroundRefreshing && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa]/40 animate-pulse shrink-0" title="Syncing…" />
          )}
          <Link
            href="/renewals/templates"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md border border-[#1e1e2a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] hover:border-[#2e2e3a] transition-colors"
          >
            Templates
          </Link>
          <Link
            href="/renewals/upload"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md border border-[#1e1e2a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] hover:border-[#2e2e3a] transition-colors"
          >
            <Upload size={13} />
            Import CSV
          </Link>
          <Link
            href="/renewals/upload"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors shadow-[0_0_20px_rgba(0,212,170,0.35),0_0_6px_rgba(0,212,170,0.2)]"
          >
            <Plus size={13} />
            Import Policies
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-0 px-10 py-8 border-b border-[#252530] shrink-0">
        <div className="pr-10">
          <div className="text-[32px] font-bold text-[#f5f5f7] leading-none">
            {active.length}
          </div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Active Policies</div>
        </div>
        <div className="px-10 border-l border-[#1e1e2a]">
          <div className="text-[32px] font-bold text-orange-400 leading-none">{urgent}</div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Expiring ≤30 Days</div>
        </div>
        <div className="px-10 border-l border-[#1e1e2a]">
          <div className="text-[32px] font-bold text-amber-400 leading-none">{needsAction}</div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Need Outreach</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-10 py-3 border-b border-[#1e1e2a] shrink-0 overflow-x-auto">
        {STAGE_FILTER_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/renewals?stage=${opt.value}&status=${statusFilter}`}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
              filterParam !== "stalled" && stageFilter === opt.value
                ? "bg-[rgba(255,255,255,0.06)] text-[#f5f5f7]"
                : "text-[#8a8b91] hover:text-[#f5f5f7] hover:bg-white/[0.03]"
            }`}
          >
            {opt.label}
          </Link>
        ))}

        {/* Stalled special filter — highlights policies that have gone quiet */}
        <Link
          href="/renewals?filter=stalled"
          className={`ml-2 px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors border ${
            filterParam === "stalled"
              ? "bg-purple-950/40 text-purple-400 border-purple-700/40"
              : "text-[#8a8b91] hover:text-purple-400 hover:bg-purple-950/20 border-transparent"
          }`}
        >
          ⚠ Stalled
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {(["active", "expired", "all"] as const).map((s) => (
            <Link
              key={s}
              href={`/renewals?stage=${stageFilter}&status=${s}`}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium capitalize whitespace-nowrap transition-colors ${
                statusFilter === s
                  ? "bg-[rgba(255,255,255,0.06)] text-[#f5f5f7]"
                  : "text-[#8a8b91] hover:text-[#f5f5f7] hover:bg-white/[0.03]"
              }`}
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
            <Loader2 size={22} className="animate-spin text-zinc-600" />
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
        <div className="flex flex-col h-full bg-[#0d0d12]">
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
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
        <Plus size={24} className="text-[#8a8b91]" />
      </div>
      <div className="text-[16px] font-semibold text-[#f5f5f7] mb-1">
        {isStalled ? "No stalled renewals" : stageFilter === "all" ? "No policies yet" : "No policies in this stage"}
      </div>
      <div className="text-[13px] text-[#8a8b91] mb-6 max-w-xs">
        {isStalled
          ? "No stalled renewals — everything is on track."
          : stageFilter === "all"
          ? "Import your book of business via CSV to start your renewal campaigns."
          : "Policies advance through stages automatically each day."}
      </div>
      {stageFilter === "all" && !isStalled && (
        <Link
          href="/renewals/upload"
          className="h-9 px-5 flex items-center gap-2 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
        >
          <Upload size={14} />
          Import CSV
        </Link>
      )}
    </div>
  );
}
