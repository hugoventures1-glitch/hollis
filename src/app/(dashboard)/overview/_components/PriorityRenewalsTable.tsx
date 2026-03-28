"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";
import { HealthBadge } from "@/components/renewals/health-badge";
import type { HealthLabel } from "@/types/renewals";
import { useHollisStore } from "@/stores/hollisStore";
import { buildTrailParam } from "@/lib/trail";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolicyRow {
  id: string;
  policy_name?: string | null;
  client_name: string;
  carrier?: string | null;
  expiration_date: string;
  campaign_stage?: string | null;
  health_label?: HealthLabel | null;
  health_score?: number | null;
  renewal_flags?: Record<string, unknown> | null;
}

interface PriorityRenewalsTableProps {
  policies: PolicyRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
  });
}

// ── Row ───────────────────────────────────────────────────────────────────────

function PolicyTableRow({
  policy,
  idx,
  clientId,
}: {
  policy: PolicyRow;
  idx: number;
  clientId: string | undefined;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading || sent) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/actions/renew/${policy.id}`, {
          method: "POST",
        });
        const data = await res.json();

        if (!res.ok || data.error) {
          toast(data.error ?? "Could not send renewal action", "error");
          return;
        }

        setSent(true);
        toast(`Sent to ${policy.client_name}`, "success");
      } catch {
        toast("Connection error — please try again", "error");
      } finally {
        setLoading(false);
      }
    },
    [policy, loading, sent, toast]
  );

  const days = daysUntil(policy.expiration_date);
  const priority = days <= 30 ? "High" : "Normal";
  const prefix = "HOL";
  const num = String(100 + idx + 1);

  return (
    <div
      onClick={() => router.push(
        clientId
          ? `/clients/${clientId}?trail=${buildTrailParam([], "Renewals", "/renewals")}`
          : `/renewals/${policy.id}`
      )}
      className="grid grid-cols-12 items-center px-6 py-[10px] border-b border-[#1C1C1C]/60 hover:bg-white/[0.015] group transition-colors cursor-pointer"
    >
      {/* ID */}
      <div className="col-span-1 flex items-start gap-2">
        <CheckCircle2
          size={14}
          className="opacity-0 group-hover:opacity-100 text-[#6b6b6b] transition-opacity shrink-0 mt-0.5"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-[11px] font-mono text-[#6b6b6b] uppercase">
            {prefix}-
          </span>
          <span className="text-[12px] font-mono text-[#8a8a8a] uppercase">
            {num}
          </span>
        </div>
      </div>

      {/* Title + client */}
      <div className="col-span-6 flex items-center gap-4 pr-4 min-w-0 overflow-hidden">
        <span className="text-[15px] font-medium text-white shrink-0 truncate">
          {policy.policy_name ?? policy.carrier ?? "Policy"}
        </span>
        <span className="text-[14px] text-[#8a8a8a] truncate">
          {policy.client_name}
        </span>
      </div>

      {/* Health badge */}
      <div className="col-span-2 flex items-center">
        <HealthBadge
          label={policy.health_label}
          stalledInQueue={
            policy.health_label === "stalled" &&
            !!(policy.renewal_flags?.silent_client)
          }
        />
      </div>

      {/* Priority dot */}
      <div className="col-span-1 flex items-center justify-center">
        <div
          className={`w-2 h-2 rounded-full ${
            priority === "High" ? "bg-[#ff4d4d]" : "bg-[#1C1C1C]"
          }`}
        />
      </div>

      {/* Date */}
      <div className="col-span-1 text-[14px] text-[#6b6b6b] font-medium text-right">
        {formatDate(policy.expiration_date)}
      </div>

      {/* Send action (replaces MoreHorizontal) */}
      <div className="col-span-1 flex justify-end">
        {sent ? (
          <span className="text-[11px] text-[#FAFAFA] font-medium">Sent</span>
        ) : loading ? (
          <Loader2
            size={14}
            className="text-[#8a8a8a] animate-spin"
          />
        ) : (
          <button
            onClick={handleSend}
            className="text-[12px] text-[#6b6b6b] hover:text-[#FAFAFA] transition-colors opacity-0 group-hover:opacity-100 font-medium whitespace-nowrap"
          >
            → Send
          </button>
        )}
      </div>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function PriorityRenewalsTable({ policies }: PriorityRenewalsTableProps) {
  const storeClients = useHollisStore(s => s.clients);
  const clientIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of storeClients) map.set(c.name, c.id);
    return map;
  }, [storeClients]);

  // Stalled policies surface first so agents see the most at-risk rows immediately
  const sorted = [...policies].sort((a, b) => {
    const aStalled = a.health_label === "stalled" ? 0 : 1;
    const bStalled = b.health_label === "stalled" ? 0 : 1;
    return aStalled - bStalled;
  });

  return (
    <div className="pb-20">
      {sorted.map((policy, idx) => (
        <PolicyTableRow
          key={policy.id}
          policy={policy}
          idx={idx}
          clientId={clientIdByName.get(policy.client_name)}
        />
      ))}
    </div>
  );
}
