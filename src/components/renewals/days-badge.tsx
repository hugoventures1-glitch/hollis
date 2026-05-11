interface DaysBadgeProps {
  days: number;
  className?: string;
}

function getDaysColor(days: number): string {
  if (days < 0)    return "var(--danger)";
  if (days <= 30)  return "var(--danger)";
  if (days <= 60)  return "var(--text-secondary)";
  return "var(--text-tertiary)";
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
