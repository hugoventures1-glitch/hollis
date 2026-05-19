"use client";

import { useState } from "react";
import { XCircle, Loader2 } from "lucide-react";

interface RejectScriptButtonProps {
  policyId: string;
  onRejected?: () => void;
}

export function RejectScriptButton({ policyId, onRejected }: RejectScriptButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);

  // Two-click confirm — first click arms, second fires
  async function handleClick() {
    if (loading || done) return;
    if (!confirming) {
      setConfirming(true);
      // Auto-disarm after 4s
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/renewals/${policyId}/reject-script`, { method: "POST" });
      if (res.ok) {
        setDone(true);
        onRejected?.();
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div
        className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-[12px] font-medium"
        style={{ background: "rgba(204,41,41,0.08)", color: "var(--danger)", border: "1px solid rgba(204,41,41,0.2)" }}
      >
        <XCircle size={12} />
        Rejected — escalated
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-[12px] font-medium transition-all"
      style={{
        background:  confirming ? "rgba(204,41,41,0.10)" : "var(--border)",
        color:       confirming ? "var(--danger)"        : "var(--text-secondary)",
        border:      confirming
          ? "1px solid rgba(204,41,41,0.3)"
          : "1px solid var(--border-subtle)",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading
        ? <Loader2 size={12} className="animate-spin" />
        : <XCircle size={12} />}
      {confirming ? "Confirm reject?" : "Reject script"}
    </button>
  );
}
