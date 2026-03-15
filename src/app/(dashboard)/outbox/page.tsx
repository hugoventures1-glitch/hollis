"use client";

import { Loader2 } from "lucide-react";
import OutboxClient from "./OutboxClient";
import { useHollisData } from "@/hooks/useHollisData";

export default function OutboxPage() {
  const { outboxDrafts, loading, lastFetched, backgroundRefreshing } = useHollisData();

  // Show spinner only on the very first load (no cached data in the store yet)
  if (loading && !lastFetched) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0C0C0C]">
        <Loader2 size={22} className="animate-spin text-[#6b6b6b]" />
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {backgroundRefreshing && (
        <span
          className="absolute top-4 right-6 z-10 w-1.5 h-1.5 rounded-full bg-[#FAFAFA]/40 animate-pulse"
          title="Syncing…"
        />
      )}
      <OutboxClient initialDrafts={outboxDrafts} />
    </div>
  );
}
