"use client";

/**
 * ImportSection — rendered inside Settings > Import Data tab.
 *
 * Delegates entirely to the standalone AI-powered book importer.
 * The importer handles .xlsx / .xls / .csv files and uses Claude to
 * auto-map columns from any AMS export (WinBEAT, Sunrise, Applied Epic,
 * Insight) to Hollis clients, policies, and certificates in one pass.
 */

import BookImporter from "@/app/(dashboard)/import/page";

export function ImportSection() {
  return <BookImporter />;
}
