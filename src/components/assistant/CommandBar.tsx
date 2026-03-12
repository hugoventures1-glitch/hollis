"use client";

import { useUnifiedPanel } from "@/contexts/UnifiedPanelContext";
import AssistantPanelWrapper from "./AssistantPanelWrapper";

export function CommandBar() {
  const { openPanel } = useUnifiedPanel();

  return (
    <>
      {/* Persistent top-center trigger bar */}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          width: 480,
        }}
      >
        <button
          onClick={openPanel}
          className="w-full h-10 flex items-center gap-3 px-4 rounded-lg transition-colors"
          style={{
            background: "#111111",
            border: "1px solid #1C1C1C",
            color: "#333333",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#555555";
            (e.currentTarget as HTMLElement).style.color = "#555555";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#1C1C1C";
            (e.currentTarget as HTMLElement).style.color = "#333333";
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span
            className="flex-1 text-left"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            search or ask hollis
          </span>
          <kbd
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              opacity: 0.5,
              letterSpacing: "0.05em",
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* AssistantPanel logic layer — registers the open handler and renders its own overlay */}
      <AssistantPanelWrapper />
    </>
  );
}
