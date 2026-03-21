"use client";

/**
 * useHollisData — the single hook for all dashboard pages to consume.
 *
 * - First call: starts a full data fetch; subsequent calls return the cached
 *   store state immediately (zero loading time on navigations after first visit).
 * - Sets up one shared 120-second background refresh interval across all
 *   mounted consumers; tears it down when the last consumer unmounts.
 * - The "barely visible" backgroundRefreshing flag is exposed so pages can
 *   render a subtle pulse indicator without blocking the UI.
 */

import { useEffect } from "react";
import { useHollisStore, HOLLIS_STALE_MS } from "@/stores/hollisStore";

// Module-level singletons — one interval for the whole app
let refreshIntervalId: ReturnType<typeof setInterval> | null = null;
let consumerCount = 0;

export function useHollisData() {
  // Per-field selectors — each only re-renders when its own slice changes
  const policies            = useHollisStore(s => s.policies);
  const renewals            = useHollisStore(s => s.renewals);
  const clients             = useHollisStore(s => s.clients);
  const coiRequests         = useHollisStore(s => s.coiRequests);
  const certificates        = useHollisStore(s => s.certificates);
  const docChaseRequests    = useHollisStore(s => s.docChaseRequests);
  const outboxDrafts        = useHollisStore(s => s.outboxDrafts);
  const userId              = useHollisStore(s => s.userId);
  const loading             = useHollisStore(s => s.loading);
  const backgroundRefreshing = useHollisStore(s => s.backgroundRefreshing);
  const lastFetched         = useHollisStore(s => s.lastFetched);

  useEffect(() => {
    consumerCount++;

    // Kick off a fetch if data is missing or stale
    const { lastFetched: lf, fetchAll } = useHollisStore.getState();
    if (!lf || Date.now() - lf > HOLLIS_STALE_MS) {
      fetchAll();
    }

    // Start background refresh interval (only one, globally)
    if (!refreshIntervalId) {
      refreshIntervalId = setInterval(() => {
        useHollisStore.getState().fetchAll();
      }, HOLLIS_STALE_MS);
    }

    return () => {
      consumerCount--;
      if (consumerCount === 0 && refreshIntervalId) {
        clearInterval(refreshIntervalId);
        refreshIntervalId = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Data
    policies,
    renewals,
    clients,
    coiRequests,
    certificates,
    docChaseRequests,
    outboxDrafts,
    userId,
    // State
    loading,
    backgroundRefreshing,
    lastFetched,
    // Action
    refetch: () => useHollisStore.getState().fetchAll(),
  };
}
