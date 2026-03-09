import type { HealthLabel } from "@/types/renewals";

// ── Style map ──────────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<HealthLabel, string> = {
  healthy:  "bg-green-900/30  text-green-400  border border-green-700/30",
  at_risk:  "bg-amber-900/30  text-amber-400  border border-amber-700/30",
  critical: "bg-red-900/30    text-red-400    border border-red-700/30",
  stalled:  "bg-purple-900/30 text-purple-400 border border-purple-700/30",
};

const BADGE_LABELS: Record<HealthLabel, string> = {
  healthy:  "Healthy",
  at_risk:  "At Risk",
  critical: "Critical",
  stalled:  "Stalled",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function HealthBadge({
  label,
}: {
  label: HealthLabel | null | undefined;
}) {
  if (!label) {
    return <span className="text-[11px] text-[#505057]">—</span>;
  }

  const tooltip =
    label === "at_risk"
      ? "No response to recent outreach. Consider calling this client directly."
      : undefined;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${BADGE_STYLES[label]}`}
      title={tooltip}
    >
      {label === "stalled" && (
        <span aria-hidden className="text-[10px]">⚠</span>
      )}
      {BADGE_LABELS[label]}
    </span>
  );
}
