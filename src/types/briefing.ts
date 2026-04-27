// ── Daily Briefing — shared TypeScript types ──────────────────────────────────

/**
 * The routing type tells the frontend which section to link to.
 * It is never rendered as text for the user.
 */
export type BriefingItemType =
  | "renewal"
  | "coi"
  | "certificate"
  | "document"
  | "import";

/**
 * A single briefing bullet point.
 *
 * - text:    the human-readable sentence shown in the UI
 * - type:    routing metadata — determines which page "View →" links to
 * - id:      UUID of the specific record (policy, certificate) for deep-linking;
 *            null for list-level links (COI queue, documents, import)
 * - urgency: "high" = red dot in UI, needs action today;
 *            "normal" = informational (default when absent)
 */
export interface BriefingItem {
  text: string;
  type: BriefingItemType;
  id: string | null;
  urgency?: "high" | "normal";
}
