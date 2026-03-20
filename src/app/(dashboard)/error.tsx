"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const router = useRouter();

  return (
    <div className="flex flex-col h-full items-center justify-center bg-[#0C0C0C] px-6 text-center">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
        style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 6v4m0 4h.01M10 2a8 8 0 100 16A8 8 0 0010 2z"
            stroke="#666666"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="text-[16px] font-semibold text-[#FAFAFA] mb-2">
        Something went wrong
      </h2>
      <p className="text-[13px] text-[#666666] max-w-xs mb-6 leading-relaxed">
        We hit an unexpected error. Your data is safe — try refreshing or go back to the overview.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="h-9 px-4 rounded-lg text-[13px] font-medium transition-colors"
          style={{ background: "#1C1C1C", color: "#FAFAFA", border: "1px solid #2A2A2A" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#252525")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#1C1C1C")}
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/overview")}
          className="h-9 px-4 rounded-lg text-[13px] transition-colors"
          style={{ color: "#666666" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#FAFAFA")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#666666")}
        >
          Go to overview
        </button>
      </div>
    </div>
  );
}
