"use client";

import { CheckCircle2, Loader2 } from "lucide-react";

interface SaveButtonProps {
  saving: boolean;
  saved: boolean;
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}

export function SaveButton({ saving, saved, onClick, label = "Save changes", disabled }: SaveButtonProps) {
  return (
    <button
      type="button"
      disabled={saving || !!disabled}
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#00d4aa] text-black font-semibold text-[14px] hover:bg-[#00bfa0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {saving ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          Saving…
        </>
      ) : saved ? (
        <>
          <CheckCircle2 size={15} />
          Saved
        </>
      ) : (
        label
      )}
    </button>
  );
}
