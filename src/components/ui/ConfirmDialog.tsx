"use client";

import { useEffect } from "react";

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-[#111118] border border-[#2e2e3a] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-[16px] font-semibold text-[#f5f5f7] mb-2">{title}</h3>
        <p className="text-[13px] text-[#8a8b91] leading-relaxed mb-6">{body}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-4 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] hover:border-[#3e3e4a] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 px-4 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
