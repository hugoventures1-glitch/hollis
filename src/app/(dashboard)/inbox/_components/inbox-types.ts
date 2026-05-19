import type { InboxItem, DocChaseReplyItem } from "../page";

// ── Item type taxonomy ─────────────────────────────────────────────────────────

export type ItemType = "decision" | "escalation" | "todo" | "docchase";
export type Filter   = "all" | "decision" | "todo" | "docchase";

// ── Type pill metadata ─────────────────────────────────────────────────────────

export const PILL: Record<ItemType, { bg: string; fg: string; label: string }> = {
  decision:   { bg: "color-mix(in oklch, oklch(0.60 0.12 245) 18%, var(--background))", fg: "oklch(0.42 0.13 245)", label: "Decision"   },
  escalation: { bg: "rgba(220,38,38,0.10)",                                              fg: "#f87171",             label: "Escalation" },
  docchase:   { bg: "color-mix(in oklch, oklch(0.60 0.10 150) 18%, var(--background))", fg: "oklch(0.40 0.10 150)", label: "Doc chase"  },
  todo:       { bg: "color-mix(in oklch, oklch(0.70 0.12 75)  22%, var(--background))", fg: "oklch(0.42 0.10 65)",  label: "To-do"      },
};

// ── Display row (normalised shape for list + detail) ──────────────────────────

export interface DisplayRow {
  id:            string;
  kind:          "inbox" | "docchase";
  type:          ItemType;
  isLearningMode: boolean;
  client:        string;
  headline:      string;
  flagPills:     string[];
  expiryDays:    number | null;
  timeAgoStr:    string;
  hasAttachment: boolean;
  inboxItem?:    InboxItem;
  dcItem?:       DocChaseReplyItem;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

export function intentLabel(intent: string): string {
  return intent.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseDescription(desc: string): { title: string; flagPills: string[] } {
  const flaggedSplit = desc.split(/\.\s+(?=Flagged:)/);
  const title = flaggedSplit[0].replace(/\.$/, "").trim();
  if (flaggedSplit.length < 2) return { title, flagPills: [] };
  const flagPills = flaggedSplit[1]
    .split(/\.\s+/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);
  return { title, flagPills };
}

export function confidenceColors(score: number) {
  if (score >= 0.85)
    return { bg: "rgba(22,163,74,0.10)",  fg: "#4ade80", bd: "rgba(22,163,74,0.20)"  };
  if (score >= 0.60)
    return { bg: "rgba(245,158,11,0.10)", fg: "#fbbf24", bd: "rgba(245,158,11,0.20)" };
  return   { bg: "rgba(220,38,38,0.10)",  fg: "#f87171", bd: "rgba(220,38,38,0.20)"  };
}

function isDocChaseReply(i: InboxItem): boolean {
  return !!i.doc_chase_request_id || i.proposed_action?.action_type === "close_doc_chase";
}

function isTodoItem(i: InboxItem): boolean {
  return (
    !isDocChaseReply(i) &&
    (i.proposed_action?.action_type === "broker_change_required" ||
      i.classified_intent === "confirm_renewal" ||
      i.classified_intent === "confirmed")  // v2 canonical name
  );
}

export function deriveType(item: InboxItem): ItemType {
  if (isDocChaseReply(item)) return "docchase";
  if (item.tier === 3)       return "escalation";
  if (isTodoItem(item))      return "todo";
  return "decision";
}

export function toDisplayRow(item: InboxItem): DisplayRow {
  const rawDesc = item.proposed_action?.description ?? intentLabel(item.classified_intent);
  const { title, flagPills } = parseDescription(rawDesc);
  const flagReason = item.proposed_action?.payload?.flag_reason as string | undefined;
  const isLearning = typeof flagReason === "string" && flagReason.toLowerCase().includes("learning");
  return {
    id:            item.id,
    kind:          "inbox",
    type:          deriveType(item),
    isLearningMode: isLearning,
    client:        item.policies?.client_name ?? "Unknown Client",
    headline:      title,
    flagPills,
    expiryDays:    item.policies ? daysUntil(item.policies.expiration_date) : null,
    timeAgoStr:    timeAgo(item.created_at),
    hasAttachment: typeof item.proposed_action?.payload?.attachment_path === "string",
    inboxItem:     item,
  };
}

export function dcToDisplayRow(item: DocChaseReplyItem): DisplayRow {
  return {
    id:            item.id,
    kind:          "docchase",
    type:          "docchase",
    isLearningMode: false,
    client:        item.client_name,
    headline:      item.document_type,
    flagPills:     [],
    expiryDays:    null,
    timeAgoStr:    timeAgo(item.last_client_reply_at ?? item.created_at),
    hasAttachment: Boolean(item.received_attachment_path),
    dcItem:        item,
  };
}
