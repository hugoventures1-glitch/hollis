import type { CampaignStage } from "@/types/renewals";
import { STAGE_LABELS } from "@/types/renewals";

interface StageBadgeProps {
  stage: CampaignStage;
  className?: string;
}

export function StageBadge({ stage, className = "" }: StageBadgeProps) {
  return (
    <span
      className={`text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{ color: "var(--text-tertiary)" }}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
