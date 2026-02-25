interface DaysBadgeProps {
  days: number;
  className?: string;
}

function getDaysStyle(days: number): string {
  if (days < 0)  return "bg-red-950/60 text-red-400 border border-red-800/40";
  if (days <= 14) return "bg-red-900/40 text-red-400 border border-red-700/30";
  if (days <= 30) return "bg-orange-900/40 text-orange-400 border border-orange-700/30";
  if (days <= 60) return "bg-amber-900/40 text-amber-400 border border-amber-700/30";
  return "bg-emerald-900/30 text-emerald-400 border border-emerald-700/25";
}

function getDaysLabel(days: number): string {
  if (days < 0)  return `${Math.abs(days)}d expired`;
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function DaysBadge({ days, className = "" }: DaysBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums whitespace-nowrap ${getDaysStyle(days)} ${className}`}
    >
      {getDaysLabel(days)}
    </span>
  );
}
