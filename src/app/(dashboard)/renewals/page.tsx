"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Plus, Loader2, Search, ArrowRight } from "lucide-react";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage } from "@/types/renewals";
import { RenewalsTable } from "./_components/RenewalsTable";
import type { ViewTab } from "./_components/RenewalsTable";
import { useHollisData } from "@/hooks/useHollisData";
import { createClient } from "@/lib/supabase/client";

// Stages that belong to each view tab
const ACTION_STAGES: CampaignStage[] = [
  "pending", "email_90_sent", "email_60_sent", "sms_30_sent", "script_14_ready",
];
const PROGRESS_STAGES: CampaignStage[] = [
  "questionnaire_sent", "submission_sent", "recommendation_sent", "final_notice_sent",
];
const COMPLETED_STAGES: CampaignStage[] = ["confirmed", "complete", "lapsed"];

// ── Inner content (needs Suspense because it calls useSearchParams) ────────────

function RenewalsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // View tab — default to "action"
  const viewParam = searchParams.get("view") as ViewTab | null;
  const view: ViewTab = viewParam === "progress" || viewParam === "completed" ? viewParam : "action";

  const { policies: activePolicies, loading: storeLoading, backgroundRefreshing } = useHollisData();

  // Completed tab may need expired/lapsed policies not in the active store
  const [completedRows, setCompletedRows] = useState<Policy[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);

  useEffect(() => {
    if (view !== "completed") return;
    setCompletedLoading(true);
    const supabase = createClient();
    supabase
      .from("policies")
      .select("*")
      .in("campaign_stage", COMPLETED_STAGES)
      .order("expiration_date", { ascending: false })
      .then(({ data }) => {
        setCompletedRows((data ?? []) as Policy[]);
        setCompletedLoading(false);
      });
  }, [view]);

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
    rows = completedRows;
  }

  const isLoading =
    (view === "action" || view === "progress") ? storeLoading : completedLoading;

  // Summary stats (always from active store)
  const active       = activePolicies;
  const urgent       = active.filter((p) => ACTION_STAGES.includes(p.campaign_stage) && daysUntilExpiry(p.expiration_date) <= 30).length;
  const actionCount  = active.filter((p) => ACTION_STAGES.includes(p.campaign_stage)).length;
  const progressCount= active.filter((p) => PROGRESS_STAGES.includes(p.campaign_stage)).length;

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
            Import
          </Link>
          <Link
            href="/renewals/upload"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md text-[13px] font-medium transition-colors"
            style={{ background: "#1A1A1A", color: "#555", border: "1px solid #1A1A1A" }}
          >
            <Plus size={13} />
            Add policies
          </Link>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div
        className="flex items-stretch justify-around shrink-0"
        style={{ borderBottom: "1px solid #141414" }}
      >
        <div className="py-6 flex flex-col gap-1 items-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   32,
              fontWeight: 700,
              lineHeight: 1,
              color:      "#FAFAFA",
            }}
          >
            {active.length}
          </div>
          <div style={{ fontSize: 11, color: "#333", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Active
          </div>
        </div>
        <div className="py-6 flex flex-col gap-1 items-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   32,
              fontWeight: 700,
              lineHeight: 1,
              color:      urgent > 0 ? "#FF4444" : "#FAFAFA",
            }}
          >
            {urgent}
          </div>
          <div style={{ fontSize: 11, color: "#333", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Expiring ≤30d
          </div>
        </div>
        <div className="py-6 flex flex-col gap-1 items-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   32,
              fontWeight: 700,
              lineHeight: 1,
              color:      actionCount > 0 ? "#888" : "#FAFAFA",
            }}
          >
            {actionCount}
          </div>
          <div style={{ fontSize: 11, color: "#333", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Need Action
          </div>
        </div>
        <div className="py-6 flex flex-col gap-1 items-center">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   32,
              fontWeight: 700,
              lineHeight: 1,
              color:      "#555",
            }}
          >
            {progressCount}
          </div>
          <div style={{ fontSize: 11, color: "#333", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            In Progress
          </div>
        </div>
      </div>

      {/* ── Search + Tabs Bar ── */}
      <div
        className="shrink-0 px-14 py-3 flex items-center gap-6"
        style={{ borderBottom: "1px solid #1A1A1A", height: 60 }}
      >
        {/* Search box - left side */}
        <div
          className="flex items-center gap-3 px-4 rounded-xl transition-all duration-200 flex-shrink-0"
          style={{
            width: 280,
            height: 44,
            background: "#0E0E0E",
            border: "1px solid #2A2A2A",
          }}
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={16} style={{ color: "#555", flexShrink: 0 }} />
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
              color:      "#AAAAAA",
            }}
          />
          {hollisQuery && (
            <button
              onClick={(e) => { e.stopPropagation(); setHollisQuery(""); }}
              style={{ color: "#555", lineHeight: 1 }}
              className="text-[11px] shrink-0 hover:text-[#888] transition-colors"
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
          style={{ background: "#1A1A1A", height: 40 }}
        >
          {tabs.map((tab) => {
            const active = view === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/renewals?view=${tab.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-all rounded-md"
                style={{
                  color: active ? "#FAFAFA" : "#555",
                  background: active ? "#0E0E0E" : "transparent",
                  border: active ? "1px solid #252525" : "none",
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize:   10,
                      color:      active ? "#666" : "#333",
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
            <Loader2 size={20} className="animate-spin" style={{ color: "#252525" }} />
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
            <Loader2 size={20} className="animate-spin" style={{ color: "#252525" }} />
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
      sub:      "Policies appear here once questionnaires, submissions, or recommendations are out.",
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
        style={{ background: "#111" }}
      >
        <Plus size={20} style={{ color: "#2E2E2E" }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#FAFAFA", fontFamily: "var(--font-display)" }}>
        {heading}
      </div>
      <div style={{ fontSize: 13, color: "#333", marginTop: 6, maxWidth: 300, lineHeight: 1.6 }}>
        {sub}
      </div>
      {view === "action" && (
        <Link
          href="/renewals/upload"
          className="mt-6 h-9 px-5 flex items-center gap-2 rounded-md text-[13px] font-medium transition-colors"
          style={{ background: "#1A1A1A", color: "#888", border: "1px solid #2A2A2A" }}
        >
          <Upload size={13} />
          Import CSV
        </Link>
      )}
    </div>
  );
}
