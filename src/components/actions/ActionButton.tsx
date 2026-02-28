"use client";

import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ActionVariant = "default" | "destructive" | "ghost";

interface ActionButtonProps {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ActionVariant;
  className?: string;
}

const VARIANT_STYLES: Record<ActionVariant, string> = {
  default:
    "bg-[#1a1a24] border border-[#2a2a35] text-zinc-400 hover:border-[#00d4aa]/40 hover:text-[#00d4aa]",
  destructive:
    "bg-[#1a1a24] border border-red-900/40 text-red-500/70 hover:border-red-500/40 hover:text-red-500",
  ghost:
    "bg-transparent border-transparent text-zinc-600 hover:text-zinc-300",
};

export function ActionButton({
  label,
  icon: Icon,
  onClick,
  loading = false,
  disabled = false,
  variant = "default",
  className = "",
}: ActionButtonProps) {
  const isDisabled = loading || disabled;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={[
        "inline-flex items-center gap-1.5 h-7 px-3 rounded text-[13px] font-medium",
        "transition-all whitespace-nowrap",
        VARIANT_STYLES[variant],
        isDisabled ? "pointer-events-none opacity-60" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <>
          {Icon && <Icon size={12} />}
          {label}
        </>
      )}
    </button>
  );
}
