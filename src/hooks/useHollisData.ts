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
  // Reactive subscription — component re-renders whenever store changes
  const store = useHollisStore();

  useEffect(() => {
    consumerCount++;

    // Kick off a fetch if data is missing or stale
    const { lastFetched, fetchAll } = useHollisStore.getState();
    if (!lastFetched || Date.now() - lastFetched > HOLLIS_STALE_MS) {
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
    policies: store.policies,
    renewals: store.renewals,
    clients: store.clients,
    coiRequests: store.coiRequests,
    certificates: store.certificates,
    docChaseRequests: store.docChaseRequests,
    outboxDrafts: store.outboxDrafts,
    userId: store.userId,
    // State
    loading: store.loading,
    backgroundRefreshing: store.backgroundRefreshing,
    lastFetched: store.lastFetched,
    // Action
    refetch: () => useHollisStore.getState().fetchAll(),
  };
}
