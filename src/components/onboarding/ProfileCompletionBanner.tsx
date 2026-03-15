"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

export function ProfileCompletionBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="shrink-0 flex items-center gap-3 px-6 py-2.5 bg-[#1C1C1C] border-b border-[#1C1C1C] text-[13px] text-[#9e9e9e]">
      <AlertTriangle size={14} className="shrink-0 text-[#9e9e9e]" />
      <span className="flex-1">
        Complete your profile so your name appears correctly in emails and certificates.{" "}
        <Link href="/settings" className="underline underline-offset-2 hover:text-[#FAFAFA] transition-colors font-medium">
          Set up your profile →
        </Link>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 hover:text-[#FAFAFA] transition-colors"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
