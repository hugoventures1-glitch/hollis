"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

export function ProfileCompletionBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="shrink-0 flex items-center gap-3 px-6 py-2.5 bg-amber-950/40 border-b border-amber-800/40 text-[13px] text-amber-300">
      <AlertTriangle size={14} className="shrink-0 text-amber-400" />
      <span className="flex-1">
        Complete your profile so your name appears correctly in emails and certificates.{" "}
        <Link href="/settings" className="underline underline-offset-2 hover:text-amber-200 transition-colors font-medium">
          Set up your profile →
        </Link>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 hover:text-amber-100 transition-colors"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
