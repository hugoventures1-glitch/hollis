interface DaysBadgeProps {
  days: number;
  className?: string;
}

function getDaysColor(days: number): string {
  if (days < 0)    return "#FF4444";
  if (days <= 30)  return "#FF4444";
  if (days <= 60)  return "#888888";
  return "#333333";
}

function getDaysLabel(days: number): string {
  if (days < 0)   return `${Math.abs(days)}d exp.`;
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days}d`;
}

export function DaysBadge({ days, className = "" }: DaysBadgeProps) {
  return (
    <span
      className={`text-[12px] font-medium tabular-nums whitespace-nowrap ${className}`}
      style={{ color: getDaysColor(days) }}
    >
      {getDaysLabel(days)}
    </span>
  );
}
