"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

export function RejectButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleReject() {
    if (!confirm("Reject this COI request?")) return;
    setLoading(true);
    try {
      await fetch(`/api/coi/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleReject}
      disabled={loading}
      className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-red-400 hover:border-red-800/40 transition-colors disabled:opacity-50"
    >
      <XCircle size={12} />
      {loading ? "Rejecting…" : "Reject"}
    </button>
  );
}
