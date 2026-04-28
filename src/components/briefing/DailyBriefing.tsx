"use client";

/**
 * DailyBriefing
 *
 * Renders an ambient morning briefing above the stats bar on the Overview page.
 * Fetches from /api/briefing on mount; shows an animated skeleton while loading.
 * Collapses after being viewed (in viewport for 6s); persists collapse state per day.
 *
 * Design principles:
 * - No card borders, no panel chrome — reads like prose on the page
 * - Left teal stripe as the only visual anchor
 * - Text at zinc-300, key entities bolded to white
 * - High-urgency items get a small red dot on the left
 * - "View →" action link fades in on hover, routes based on item.type + id
 * - Collapsed label shows "Today · N" count so item count is visible at a glance
 * - All-clear state rendered explicitly instead of invisible null
 * - Degrades silently on error (shows nothing)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { BriefingItem, BriefingItemType } from "@/types/briefing";

const VIEWED_DELAY_MS = 6000;
const STORAGE_KEY = "hollis-briefing-collapsed";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStoredCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(key);
    return stored === todayKey();
  } catch {
    return false;
  }
}

function setStoredCollapsed(key: string) {
  try {
    localStorage.setItem(key, todayKey());
  } catch {
    // ignore
  }
}

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
      <div className="h-[21px] w-[72%] rounded-md bg-[#1C1C1C] animate-pulse" />
      <div className="h-[21px] w-[85%] rounded-md bg-[#1C1C1C] animate-pulse" />
      <div className="h-[21px] w-[61%] rounded-md bg-[#1C1C1C] animate-pulse" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DailyBriefing({ userId }: { userId?: string }) {
  const storageKey = userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
  const router = useRouter();
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const viewedRef = useRef(false);
  const mountedRef = useRef(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    setCollapsed(getStoredCollapsed(storageKey));
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Mark as viewed and collapse when in viewport for VIEWED_DELAY_MS
  useEffect(() => {
    if (loading || items.length === 0 || collapsed || viewedRef.current) return;

    const el = contentRef.current;
    if (!el) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (!e) return;

        if (e.isIntersecting) {
          if (viewedRef.current) return;
          timeoutId = setTimeout(() => {
            viewedRef.current = true;
            setStoredCollapsed(storageKey);
            if (mountedRef.current) setCollapsed(true);
          }, VIEWED_DELAY_MS);
        } else {
          if (timeoutId != null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => {
      if (timeoutId != null) clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [loading, items.length, collapsed]);

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

  // All-clear: loaded but no items — confirm positively rather than going invisible
  if (!loading && items.length === 0) {
    return (
      <div className="flex items-start gap-5 px-12 pt-8 pb-6">
        <div
          className="shrink-0 w-[2px] self-stretch rounded-full bg-[#FAFAFA]/10"
          aria-hidden="true"
        />
        <p className="text-[14px] text-[#6b6b6b] leading-[1.7]">
          Book looks clear — no urgent items today.
        </p>
      </div>
    );
  }

  const toggleCollapsed = () => setCollapsed((c) => !c);

  // Count label: show item count when collapsed and items are loaded
  const countLabel = !loading && items.length > 0 ? ` · ${items.length}` : "";

  return (
    <div className="flex items-start gap-5 px-12 pt-8 pb-6">
      {/* Left stripe */}
      <div
        className="shrink-0 w-[2px] self-stretch rounded-full bg-[#FAFAFA]/10"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="flex-1 min-w-0" ref={contentRef}>
        {/* Row: "Today" label + refresh / expand */}
        <div className={`flex items-center justify-between ${collapsed ? "mb-0" : "mb-4"}`}>
          <button
            onClick={toggleCollapsed}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest hover:text-[#9e9e9e] transition-colors"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand today's briefing" : "Collapse briefing"}
          >
            Today{countLabel}
            {collapsed ? (
              <ChevronDown size={12} className="opacity-70" />
            ) : (
              <ChevronUp size={12} className="opacity-70" />
            )}
          </button>
          {!collapsed && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh briefing"
              className="text-[#6b6b6b] hover:text-[#8a8a8a] transition-colors disabled:opacity-40"
              aria-label="Refresh morning briefing"
            >
              <RefreshCw
                size={13}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          )}
        </div>

        {/* Loading skeleton — hidden when collapsed */}
        {loading && !collapsed && <Skeleton />}

        {/* Briefing items — hidden when collapsed */}
        {!loading && items.length > 0 && !collapsed && (
          <ul className="space-y-0.5" role="list">
            {items.map((item, i) => (
              <li
                key={i}
                className="group flex items-baseline justify-between gap-6 py-[5px]"
              >
                <p className="text-[15px] text-[#FAFAFA] leading-[1.7] min-w-0 flex items-baseline gap-2">
                  {item.urgency === "high" && (
                    <span
                      className="shrink-0 inline-block w-[5px] h-[5px] rounded-full bg-red-500 translate-y-[-2px]"
                      aria-label="High urgency"
                    />
                  )}
                  <HighlightedText text={item.text} />
                </p>

                {/* "View →" fades in on row hover */}
                <button
                  onClick={() => handleNavigate(item)}
                  className="shrink-0 text-[13px] text-[#6b6b6b] hover:text-[#FAFAFA] opacity-0 group-hover:opacity-100 transition-all duration-150 whitespace-nowrap"
                  aria-label={`View details for: ${item.text}`}
                >
                  View →
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
