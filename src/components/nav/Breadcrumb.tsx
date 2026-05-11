"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { crumbHref } from "@/lib/trail";
import type { Crumb } from "@/lib/trail";

interface BreadcrumbProps {
  /** Previous pages in the trail (clickable ancestors). */
  crumbs: Crumb[];
  /** Label for the current page (not a link). */
  current: string;
}

/**
 * Finder-style breadcrumb:  Renewals  ›  Acme Corp  ›  Documents
 * Works in both server and client components.
 */
export function Breadcrumb({ crumbs, current }: BreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      {crumbs.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
          <Link
            href={crumbHref(crumbs, i)}
            className="transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
          >
            {crumb.label}
          </Link>
          <ChevronRight size={11} style={{ color: "var(--border)" }} />
        </span>
      ))}
      <span style={{ color: "var(--text-primary)" }}>{current}</span>
    </div>
  );
}
