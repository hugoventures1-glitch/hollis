"use client";

import { Suspense, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, Search } from "lucide-react";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage } from "@/types/renewals";
import { RenewalsTable } from "./_components/RenewalsTable";
import type { ViewTab } from "./_components/RenewalsTable";
import { useHollisData } from "@/hooks/useHollisData";

// Stages that belong to each view tab
const ACTION_STAGES: CampaignStage[] = [
  "pending", "email_90_sent", "email_60_sent", "sms_30_sent", "script_14_ready",
];
const PROGRESS_STAGES: CampaignStage[] = [
  "submission_sent", "recommendation_sent", "final_notice_sent",
];
const COMPLETED_STAGES: CampaignStage[] = ["confirmed", "complete", "lapsed"];

// ── Inner content (needs Suspense because it calls useSearchParams) ────────────

function RenewalsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // View tab — default to "action"
  const viewParam = searchParams.get("view") as ViewTab | null;
  const view: ViewTab = viewParam === "progress" || viewParam === "completed" ? viewParam : "action";

  const { policies: activePolicies, completedPolicies, loading: storeLoading, backgroundRefreshing } = useHollisData();

  // Hollis command bar state
  const [hollisQuery, setHollisQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Rows for current view
  let rows: Policy[];
  if (view === "action") {
    rows = activePolicies.filter((p) => ACTION_STAGES.includes(p.campaign_stage));
  } else if (view === "progress") {
    rows = activePolicies.filter((p) => PROGRESS_STAGES.includes(p.campaign_stage));
  } else {
    rows = completedPolicies;
  }

  const isLoading = storeLoading;

  // Summary stats (always from active store) — memoized to avoid recomputing on every render
  const { urgent, actionCount, progressCount } = useMemo(() => {
    let urgent = 0, actionCount = 0, progressCount = 0;
    for (const p of activePolicies) {
      if (ACTION_STAGES.includes(p.campaign_stage)) {
        actionCount++;
        if (daysUntilExpiry(p.expiration_date) <= 30) urgent++;
      } else if (PROGRESS_STAGES.includes(p.campaign_stage)) {
        progressCount++;
      }
    }
    return { urgent, actionCount, progressCount };
  }, [activePolicies]);

  const tabs: { id: ViewTab; label: string; count: number }[] = [
    { id: "action",    label: "Action Required", count: actionCount   },
    { id: "progress",  label: "In Progress",     count: progressCount },
    { id: "completed", label: "Completed",        count: 0            },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-14 shrink-0"
        style={{ height: 56 }}
      >
        <div className="flex items-center gap-2">
          {backgroundRefreshing && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ background: "rgba(250,250,250,0.15)" }}
              title="Syncing…"
            />
          )}
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div
        className="flex items-stretch justify-around shrink-0"
        style={{ borderBottom: "1px solid var(--surface-raised)", paddingTop: 8, paddingBottom: 8, marginTop: -21 }}
      >
        <div className="flex flex-col gap-1 items-center justify-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   35,
              fontWeight: 700,
              lineHeight: 1,
              color:      "var(--text-primary)",
            }}
          >
            {activePolicies.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Active
          </div>
        </div>
        <div className="flex flex-col gap-1 items-center justify-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   35,
              fontWeight: 700,
              lineHeight: 1,
              color:      urgent > 0 ? "var(--danger)" : "var(--text-primary)",
            }}
          >
            {urgent}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Expiring ≤30d
          </div>
        </div>
        <div className="flex flex-col gap-1 items-center justify-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   35,
              fontWeight: 700,
              lineHeight: 1,
              color:      actionCount > 0 ? "var(--text-secondary)" : "var(--text-primary)",
            }}
          >
            {actionCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Need Action
          </div>
        </div>
        <div className="flex flex-col gap-1 items-center justify-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   35,
              fontWeight: 700,
              lineHeight: 1,
              color:      "var(--text-secondary)",
            }}
          >
            {progressCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            In Progress
          </div>
        </div>
      </div>

      {/* ── Search + Tabs Bar ── */}
      <div
        className="shrink-0 px-14 py-3 flex items-center gap-6"
        style={{ height: 60, marginTop: 21 }}
      >
        {/* Search box - left side */}
        <div
          className="flex items-center gap-3 px-4 rounded-xl transition-all duration-200 flex-shrink-0"
          style={{
            width: 280,
            height: 44,
            background: "var(--background)",
            border: "1px solid var(--border)",
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={hollisQuery}
            onChange={(e) => setHollisQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setHollisQuery("");
            }}
            placeholder="Search or filter"
            className="flex-1 bg-transparent outline-none placeholder-[#555]"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize:   13,
              color:      "var(--text-secondary)",
            }}
          />
          {hollisQuery && (
            <button
              onClick={(e) => { e.stopPropagation(); setHollisQuery(""); }}
              style={{ color: "var(--text-secondary)", lineHeight: 1 }}
              className="text-[11px] shrink-0 hover:text-text-secondary transition-colors"
            >
              ×
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tabs - right side */}
        <div
          className="flex items-center gap-2 px-2 rounded-lg flex-shrink-0"
          style={{ background: "var(--surface-raised)", height: 40 }}
        >
          {tabs.map((tab) => {
            const active = view === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/renewals?view=${tab.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-all rounded-md"
                style={{
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  background: active ? "var(--background)" : "transparent",
                  border: active ? "1px solid var(--border)" : "none",
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize:   10,
                      color:      active ? "var(--text-secondary)" : "var(--text-tertiary)",
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Feed ── */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--border)" }} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState view={view} />
        ) : (
          <RenewalsTable policies={rows} view={view} searchQuery={hollisQuery} />
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
        <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>
          <div className="flex items-center justify-center flex-1">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--border)" }} />
          </div>
        </div>
      }
    >
      <RenewalsContent />
    </Suspense>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ view }: { view: ViewTab }) {
  const messages = {
    action: {
      heading:  "No policies need action",
      sub:      "All active renewals are either in progress or complete.",
    },
    progress: {
      heading:  "Nothing in progress",
      sub:      "Policies appear here once submissions or recommendations are out.",
    },
    completed: {
      heading:  "No completed renewals",
      sub:      "Confirmed, completed, and lapsed policies will appear here.",
    },
  };
  const { heading, sub } = messages[view];

  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
        style={{ background: "var(--surface)" }}
      >
        <Plus size={20} style={{ color: "var(--border)" }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        {heading}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 6, maxWidth: 300, lineHeight: 1.6 }}>
        {sub}
      </div>
      {view === "action" && (
        <Link
          href="/settings?tab=import"
          className="mt-6 h-9 px-5 flex items-center gap-2 rounded-md text-[13px] font-medium transition-colors"
          style={{ background: "var(--surface-raised)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        >
          Import your book →
        </Link>
      )}
    </div>
  );
}
