import Link from "next/link";
import type { HealthLabel } from "@/types/renewals";

const LABEL_TEXT: Record<HealthLabel, string> = {
  healthy:  "healthy",
  at_risk:  "at risk",
  critical: "critical",
  stalled:  "stalled",
};

const LABEL_COLOR: Record<HealthLabel, string> = {
  healthy:  "#333333",
  at_risk:  "#888888",
  critical: "#FF4444",
  stalled:  "#888888",
};

export function HealthBadge({
  label,
  stalledInQueue,
}: {
  label: HealthLabel | null | undefined;
  stalledInQueue?: boolean;
}) {
  if (!label) {
    return <span style={{ fontSize: 11, color: "#333333" }}>—</span>;
  }

  if (stalledInQueue) {
    return (
      <Link
        href="/inbox"
        style={{ fontSize: 11, fontWeight: 500, color: LABEL_COLOR[label], textDecoration: "none" }}
        title="Stalled — awaiting broker decision in queue"
      >
        Stalled · In queue →
      </Link>
    );
  }

  return (
    <span
      style={{ fontSize: 11, fontWeight: 500, color: LABEL_COLOR[label] }}
      title={label === "at_risk" ? "No response to recent outreach" : undefined}
    >
      {LABEL_TEXT[label]}
    </span>
  );
}
