"use client";

/**
 * ImportBanner
 *
 * A one-time dismissible banner shown on the Overview page after the user
 * completes their first CSV import. Reads counts from localStorage
 * ("hollis_import_counts") written by the import pages.
 *
 * Dismissed by clicking the X, which persists the dismissal so it
 * doesn't re-appear on the next page load.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, X, Upload } from "lucide-react";

const STORAGE_KEY = "hollis_import_counts";
const DISMISSED_KEY = "hollis_import_banner_dismissed";

interface ImportCounts {
  policies?: number;
  clients?: number;
  certificates?: number;
}

export function ImportBanner() {
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed === "1") return;

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed: ImportCounts = JSON.parse(raw);
      const total =
        (parsed.policies ?? 0) + (parsed.clients ?? 0) + (parsed.certificates ?? 0);

      if (total > 0) {
        setCounts(parsed);
        setVisible(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible || !counts) return null;

  const parts: string[] = [];
  if (counts.policies) parts.push(`${counts.policies.toLocaleString()} polic${counts.policies === 1 ? "y" : "ies"}`);
  if (counts.clients) parts.push(`${counts.clients.toLocaleString()} client${counts.clients === 1 ? "" : "s"}`);
  if (counts.certificates) parts.push(`${counts.certificates.toLocaleString()} certificate${counts.certificates === 1 ? "" : "s"}`);

  const summary = parts.length > 0 ? parts.join(", ") : "your data";

  return (
    <div className="mx-12 mt-6 mb-0 flex items-start gap-4 rounded-xl bg-[#00d4aa]/[0.06] border border-[#00d4aa]/20 px-5 py-4">
      <CheckCircle2 size={18} className="text-[#00d4aa] shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[#f5f5f7] mb-0.5">
          You&apos;re all set — import complete
        </div>
        <p className="text-[13px] text-[#8a8b91] leading-relaxed">
          Hollis imported <span className="text-[#f5f5f7] font-medium">{summary}</span>.
          Your first renewal reminders will go out automatically as policies approach their expiration date.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <Link
            href="/renewals"
            className="h-7 px-3 flex items-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[12px] font-semibold hover:bg-[#00c49b] transition-colors"
          >
            View Renewals
          </Link>
          <Link
            href="/import"
            className="h-7 px-3 flex items-center gap-1.5 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
          >
            <Upload size={11} />
            Import more
          </Link>
        </div>
      </div>

      <button
        onClick={dismiss}
        className="shrink-0 text-[#505057] hover:text-[#f5f5f7] transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
