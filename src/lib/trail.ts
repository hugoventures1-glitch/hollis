/**
 * Trail — Finder-style breadcrumb chain passed through URL params.
 *
 * Encoding: `?trail=<URL-encoded JSON>`
 * Each crumb: { label: string; href: string } where `href` is the BASE URL
 * of that page (no trail param itself — it's reconstructed on click).
 */

export interface Crumb { label: string; href: string }

/** Parse the `trail` search param into an array of crumbs. */
export function decodeCrumbs(trail: string | null | undefined): Crumb[] {
  if (!trail) return [];
  try { return JSON.parse(trail) as Crumb[]; }
  catch { return []; }
}

/** Encode a crumbs array for use in a URL query param value. */
export function encodeCrumbs(crumbs: Crumb[]): string {
  return encodeURIComponent(JSON.stringify(crumbs));
}

/**
 * Build the href for clicking crumb at `index` in the breadcrumb bar.
 * Carries the trail up to (but not including) that item so the target
 * page can reconstruct its own breadcrumb correctly.
 */
export function crumbHref(crumbs: Crumb[], index: number): string {
  const { href } = crumbs[index];
  const before = crumbs.slice(0, index);
  if (before.length === 0) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}trail=${encodeCrumbs(before)}`;
}

/**
 * Build the `?trail=…` param to append to a downstream page URL.
 * Pass `existingCrumbs` (what this page received) and the new crumb
 * representing the current page.
 */
export function buildTrailParam(existingCrumbs: Crumb[], thisLabel: string, thisHref: string): string {
  const next = [...existingCrumbs, { label: thisLabel, href: thisHref }];
  return encodeCrumbs(next);
}
