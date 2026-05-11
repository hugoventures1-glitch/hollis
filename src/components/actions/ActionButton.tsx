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
    "bg-border border border-[#2A2A2A] text-text-primary hover:bg-border hover:border-[#333333]",
  destructive:
    "bg-transparent border-transparent text-danger hover:text-[#FF6666]",
  ghost:
    "bg-transparent border border-border text-text-primary hover:border-[#555555]",
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
        "inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[13px] font-medium",
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
