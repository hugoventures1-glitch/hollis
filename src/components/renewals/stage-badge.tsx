import type { CampaignStage } from "@/types/renewals";
import { STAGE_LABELS } from "@/types/renewals";

interface StageBadgeProps {
  stage: CampaignStage;
  className?: string;
}

const STAGE_STYLES: Record<CampaignStage, string> = {
  pending:         "bg-[#ffffff08] text-[#8a8b91] border border-[#ffffff10]",
  email_90_sent:   "bg-[#3b82f6]/10 text-[#60a5fa] border border-[#3b82f6]/20",
  email_60_sent:   "bg-[#6366f1]/10 text-[#a5b4fc] border border-[#6366f1]/20",
  sms_30_sent:     "bg-[#a855f7]/10 text-[#c084fc] border border-[#a855f7]/20",
  script_14_ready: "bg-[#f59e0b]/10 text-[#fbbf24] border border-[#f59e0b]/20",
  complete:        "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/20",
};

export function StageBadge({ stage, className = "" }: StageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${STAGE_STYLES[stage]} ${className}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
