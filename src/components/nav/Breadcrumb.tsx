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
            style={{ color: "#555" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#FAFAFA"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#555"; }}
          >
            {crumb.label}
          </Link>
          <ChevronRight size={11} style={{ color: "#2A2A2A" }} />
        </span>
      ))}
      <span style={{ color: "#FAFAFA" }}>{current}</span>
    </div>
  );
}
