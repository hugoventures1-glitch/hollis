import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Upload, Plus, ChevronRight } from "lucide-react";
import { daysUntilExpiry } from "@/types/renewals";
import type { Policy, CampaignStage } from "@/types/renewals";
import { RenewalsTable } from "./_components/RenewalsTable";

export const dynamic = "force-dynamic";

const STAGE_FILTER_OPTIONS: { label: string; value: CampaignStage | "all" }[] = [
  { label: "All",               value: "all"            },
  { label: "Not Started",       value: "pending"        },
  { label: "90-Day Sent",       value: "email_90_sent"  },
  { label: "60-Day Sent",       value: "email_60_sent"  },
  { label: "SMS Sent",          value: "sms_30_sent"    },
  { label: "Script Ready",      value: "script_14_ready"},
  { label: "Complete",          value: "complete"       },
];

interface PageProps {
  searchParams: Promise<{ stage?: string; status?: string }>;
}

export default async function RenewalsPage({ searchParams }: PageProps) {
  const { stage: stageFilter = "all", status: statusFilter = "active" } =
    await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("policies")
    .select("*")
    .order("expiration_date", { ascending: true });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (stageFilter !== "all") {
    query = query.eq("campaign_stage", stageFilter as CampaignStage);
  }

  const { data: policies } = await query;
  const rows = (policies ?? []) as Policy[];

  // Summary counts
  const { data: allActive } = await supabase
    .from("policies")
    .select("id, expiration_date, campaign_stage, status")
    .eq("status", "active");

  const active = allActive ?? [];
  const urgent      = active.filter(p => daysUntilExpiry(p.expiration_date) <= 30).length;
  const needsAction = active.filter(p =>
    ["pending", "email_90_sent", "email_60_sent"].includes(p.campaign_stage) &&
    daysUntilExpiry(p.expiration_date) <= 60
  ).length;

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
            Add Policy
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-0 px-10 py-8 border-b border-[#252530] shrink-0">
        <div className="pr-10">
          <div className="text-[32px] font-bold text-[#f5f5f7] leading-none">{active.length}</div>
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
        {STAGE_FILTER_OPTIONS.map(opt => (
          <Link
            key={opt.value}
            href={`/renewals?stage=${opt.value}&status=${statusFilter}`}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
              stageFilter === opt.value
                ? "bg-[rgba(255,255,255,0.06)] text-[#f5f5f7]"
                : "text-[#8a8b91] hover:text-[#f5f5f7] hover:bg-white/[0.03]"
            }`}
          >
            {opt.label}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {(["active", "expired", "all"] as const).map(s => (
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

      {/* Table — client component for inline actions */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState stageFilter={stageFilter} />
        ) : (
          <RenewalsTable policies={rows} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ stageFilter }: { stageFilter: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-[#1a1a24] flex items-center justify-center mb-4">
        <Plus size={24} className="text-[#8a8b91]" />
      </div>
      <div className="text-[16px] font-semibold text-[#f5f5f7] mb-1">
        {stageFilter === "all" ? "No policies yet" : "No policies in this stage"}
      </div>
      <div className="text-[13px] text-[#8a8b91] mb-6 max-w-xs">
        {stageFilter === "all"
          ? "Import your book of business via CSV to start your renewal campaigns."
          : "Policies advance through stages automatically as the cron job runs each day."}
      </div>
      {stageFilter === "all" && (
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
