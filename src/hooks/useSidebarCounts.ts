"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 60_000;

export interface SidebarCounts {
  renewals: number;
  coi: number;
  docChase: number;
  outbox: number;
  review: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function in60DaysISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
}

async function fetchCounts(): Promise<SidebarCounts> {
  const supabase = createClient();

  const [renewalsRes, coiRes, docChaseRes, outboxRes, reviewRes] = await Promise.all([
    // Active policies expiring within 60 days
    supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("expiration_date", todayISO())
      .lte("expiration_date", in60DaysISO()),

    // Pending COI requests (ready for approval or needs review)
    supabase
      .from("coi_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["ready_for_approval", "needs_review"]),

    // Outstanding doc-chase requests (pending or active)
    supabase
      .from("doc_chase_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "active"]),

    // Pending outbox drafts
    supabase
      .from("outbox_drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),

    // Pending agent Tier 2 review items
    supabase
      .from("approval_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    renewals: renewalsRes.count ?? 0,
    coi: coiRes.count ?? 0,
    docChase: docChaseRes.count ?? 0,
    outbox: outboxRes.count ?? 0,
    review: reviewRes.count ?? 0,
  };
}

export function useSidebarCounts(): SidebarCounts {
  const pathname = usePathname();
  const [counts, setCounts] = useState<SidebarCounts>({
    renewals: 0,
    coi: 0,
    docChase: 0,
    outbox: 0,
    review: 0,
  });

  const refresh = useCallback(() => {
    fetchCounts().then(setCounts).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Revalidate on navigation
  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  return counts;
}
