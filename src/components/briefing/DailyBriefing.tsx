"use client";

/**
 * DailyBriefing
 *
 * Renders an ambient morning briefing above the stats bar on the Overview page.
 * Fetches from /api/briefing on mount; shows an animated skeleton while loading.
 *
 * Design principles:
 * - No card borders, no panel chrome — reads like prose on the page
 * - Left teal stripe as the only visual anchor
 * - Text at zinc-300, key entities bolded to white
 * - "View →" action link fades in on hover, routes based on item.type + id
 * - Degrades silently on error (shows nothing)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { BriefingItem, BriefingItemType } from "@/types/briefing";

// ── Routing map ───────────────────────────────────────────────────────────────

const TYPE_ROUTES: Record<BriefingItemType, (id: string | null) => string> = {
  renewal:     (id) => id ? `/renewals/${id}` : "/renewals",
  coi:         (_)  => "/certificates",
  certificate: (id) => id ? `/certificates/${id}` : "/certificates",
  document:    (_)  => "/documents",
  import:      (_)  => "/import",
};

// ── Text highlighting ─────────────────────────────────────────────────────────
// Bolds two kinds of spans:
// 1. Numbers (optionally followed by common units like "days", "policies")
// 2. Sequences of 2+ consecutive Title Case words (proper nouns / client names)
//
// This runs purely on the rendered string — no special markup from Claude needed.

function HighlightedText({ text }: { text: string }): React.ReactElement {
  const PATTERN =
    /(\d+(?:,\d{3})*(?:\s+(?:days?|weeks?|months?|policies|clients?|requests?|certificates?|reminders?|hours?|COI))?|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  PATTERN.lastIndex = 0;
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={key++} className="text-white font-medium">
        {match[0]}
      </span>
    );
    lastIndex = PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3.5 py-1" aria-hidden="true">
      <div className="h-[21px] w-[72%] rounded-md bg-zinc-800 animate-pulse" />
      <div className="h-[21px] w-[85%] rounded-md bg-zinc-800 animate-pulse" />
      <div className="h-[21px] w-[61%] rounded-md bg-zinc-800 animate-pulse" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DailyBriefing() {
  const router = useRouter();
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Track mount to avoid state updates on unmounted component
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchBriefing = useCallback(async (options?: { invalidate?: boolean }) => {
    try {
      if (options?.invalidate) {
        // Clear server-side cache first
        await fetch("/api/briefing", { method: "DELETE" });
      }

      const res = await fetch("/api/briefing");
      if (!res.ok) return; // Fail silently

      const data: BriefingItem[] = await res.json();
      if (mountedRef.current) {
        setItems(Array.isArray(data) ? data : []);
      }
    } catch {
      // Degrade silently — show nothing on network error
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setLoading(true);
    fetchBriefing({ invalidate: true });
  }

  function handleNavigate(item: BriefingItem) {
    const href = TYPE_ROUTES[item.type]?.(item.id) ?? "/overview";
    router.push(href);
  }

  // Don't render the shell at all while loading AND items are empty (first paint)
  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <div className="flex items-start gap-5 px-12 pt-8 pb-6">
      {/* Left teal stripe */}
      <div
        className="shrink-0 w-[2px] self-stretch rounded-full bg-[#00d4aa]/40"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Row: "Today" label + refresh button */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
            Today
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh briefing"
            className="text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
            aria-label="Refresh morning briefing"
          >
            <RefreshCw
              size={13}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && <Skeleton />}

        {/* Briefing items */}
        {!loading && items.length > 0 && (
          <ul className="space-y-0.5" role="list">
            {items.map((item, i) => (
              <li
                key={i}
                className="group flex items-baseline justify-between gap-6 py-[5px]"
              >
                <p className="text-[15px] text-zinc-300 leading-[1.7] min-w-0">
                  <HighlightedText text={item.text} />
                </p>

                {/* "View →" fades in on row hover */}
                <button
                  onClick={() => handleNavigate(item)}
                  className="shrink-0 text-[13px] text-zinc-600 hover:text-[#00d4aa] opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap"
                  aria-label={`View details for: ${item.text}`}
                >
                  View →
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* All-clear — rendered by parent suppression (items.length === 0 → null above) */}
      </div>
    </div>
  );
}
