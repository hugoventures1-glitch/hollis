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
    "bg-[#1C1C1C] border border-[#2A2A2A] text-[#FAFAFA] hover:bg-[#222222] hover:border-[#333333]",
  destructive:
    "bg-transparent border-transparent text-[#FF4444] hover:text-[#FF6666]",
  ghost:
    "bg-transparent border border-[#1C1C1C] text-[#FAFAFA] hover:border-[#555555]",
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
