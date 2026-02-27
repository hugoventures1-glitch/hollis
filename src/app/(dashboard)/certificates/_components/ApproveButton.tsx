"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

export function ApproveButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coi/${requestId}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Approval failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      setLoading(false);
    }
  }

  if (error) {
    return (
      <button
        onClick={handleApprove}
        disabled={loading}
        className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-red-800/40 text-[12px] text-red-400 hover:text-red-300 transition-colors"
        title={error}
      >
        Retry
      </button>
    );
  }

  return (
    <button
      onClick={handleApprove}
      disabled={loading}
      className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(0,212,170,0.25)]"
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <CheckCircle size={13} />
      )}
      {loading ? "Approving…" : "Approve & Send"}
    </button>
  );
}
