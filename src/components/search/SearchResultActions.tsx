"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/actions/MicroToast";
import type { SearchResult } from "@/lib/search-types";

// ── Row link (detail page) per type ──────────────────────────────────────────
function getRowHref(r: SearchResult): string {
  switch (r._type) {
    case "policy":
      return `/renewals/${r.id}`;
    case "certificate":
      return `/certificates/${r.id}`;
    case "client":
      return `/clients/${r.id}`;
    case "coi_request":
      return `/certificates`;
    case "doc_chase":
      return `/documents`;
    case "outbox_draft":
      return `/outbox`;
    default:
      return "#";
  }
}

// ── Action config: label, kind, and target ────────────────────────────────────
type ActionKind = "navigate" | "api";
interface ActionConfig {
  label: string;
  kind: ActionKind;
  /** For navigate: path. For api: full URL. */
  target: string;
  /** For api: request method. */
  method?: "POST" | "PATCH";
  /** For api: optional JSON body. */
  body?: Record<string, unknown>;
}

function getActionConfig(r: SearchResult): ActionConfig | null {
  switch (r._type) {
    case "policy":
      if (r.campaign_stage === "pending")
        return { label: "Start Campaign", kind: "api", target: `/api/actions/renew/${r.id}`, method: "POST" };
      if (r.campaign_stage === "script_14_ready")
        return { label: "View Call Script", kind: "navigate", target: `/renewals/${r.id}` };
      return { label: "View", kind: "navigate", target: `/renewals/${r.id}` };

    case "certificate":
      if (r.status === "draft" && r.request_id)
        return { label: "Approve", kind: "api", target: `/api/coi/${r.request_id}/approve`, method: "POST" };
      if (r.status === "sent" || r.status === "expired")
        return { label: "View", kind: "navigate", target: `/certificates/${r.id}` };
      return { label: "View", kind: "navigate", target: `/certificates/${r.id}` };

    case "client":
      return { label: "View Client", kind: "navigate", target: `/clients/${r.id}` };

    case "coi_request":
      if ((r.status === "pending" || r.status === "needs_review") && r.certificate_id)
        return { label: "Review", kind: "navigate", target: `/certificates/${r.certificate_id}` };
      if (r.status === "pending" || r.status === "needs_review")
        return { label: "Review", kind: "navigate", target: `/certificates/new` };
      return { label: "View", kind: "navigate", target: "/certificates" };

    case "doc_chase":
      if (r.status === "active")
        return { label: "Mark Received", kind: "api", target: `/api/doc-chase/${r.id}`, method: "PATCH", body: { status: "received" } };
      return { label: "View", kind: "navigate", target: "/documents" };

    case "outbox_draft":
      if (r.status === "pending")
        return { label: "Send Now", kind: "api", target: `/api/outbox/${r.id}/send`, method: "POST" };
      return { label: "View", kind: "navigate", target: "/outbox" };

    default:
      return null;
  }
}

interface SearchResultActionsProps {
  result: SearchResult;
  onActionComplete: () => void;
}

export function SearchResultActions({ result, onActionComplete }: SearchResultActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const rowHref = getRowHref(result);
  const action = getActionConfig(result);

  const handleAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!action || loading) return;

    if (action.kind === "navigate") {
      router.push(action.target);
      onActionComplete();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(action.target, {
        method: action.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? "Action failed", "error");
        return;
      }
      toast("Done");
      onActionComplete();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!action) return null;

  return (
    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleAction}
        disabled={loading}
        className="text-[12px] px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "…" : action.label}
      </button>
      <Link
        href={rowHref}
        onClick={(e) => e.stopPropagation()}
        className="text-[11px] text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        Open
      </Link>
    </div>
  );
}
