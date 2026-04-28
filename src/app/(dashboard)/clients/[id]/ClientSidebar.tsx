"use client";

import { useRef, useState } from "react";
import { Circle } from "lucide-react";
import { QuickActions } from "./QuickActions";

const CHECKLIST_MILESTONES: { key: string; label: string }[] = [
  { key: "email_90_sent",       label: "90-day outreach" },
  { key: "email_60_sent",       label: "60-day outreach" },
  { key: "sms_30_sent",         label: "30-day SMS" },
  { key: "submission_sent",     label: "Submission" },
  { key: "recommendation_sent", label: "Recommendation" },
  { key: "confirmed",           label: "Renewal confirmed" },
];

const STAGE_ORDER = [
  "pending", "email_90_sent", "email_60_sent", "sms_30_sent",
  "script_14_ready", "submission_sent",
  "recommendation_sent", "final_notice_sent", "confirmed", "complete",
];

function isStageComplete(currentStage: string | null, targetStage: string): boolean {
  if (!currentStage) return false;
  if (currentStage === "lapsed") return false;
  const cur = STAGE_ORDER.indexOf(currentStage);
  const tgt = STAGE_ORDER.indexOf(targetStage);
  return cur >= tgt && tgt !== -1;
}

interface Policy {
  id: string;
  policy_name: string;
  campaign_stage: string | null;
}

interface ClientSidebarProps {
  clientId: string;
  policies: Policy[];
}

const PANEL_W = 360;

export function ClientSidebar({ clientId, policies }: ClientSidebarProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 80);
  }
  function cancelClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }

  const nearestPolicy = policies[0] ?? null;

  return (
    <>
      {/* Hover trigger zone — right edge */}
      <div
        className="fixed right-0 top-0 h-screen"
        style={{ width: 24, zIndex: 48 }}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
      />

      {/* Corner chevron — rotates as panel opens */}
      <button
        className="fixed"
        onClick={() => { cancelClose(); setOpen(v => !v); }}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
        style={{
          top: 28,
          right: open ? PANEL_W - 20 : 14,
          zIndex: 50,
          color: "rgba(255,255,255,0.75)",
          fontSize: 32,
          fontWeight: 400,
          lineHeight: 1,
          cursor: "pointer",
          padding: "4px 3px",
          fontFamily: "var(--font-sans)",
          letterSpacing: "0.02em",
          border: "none",
          background: "none",
          transform: `rotate(${open ? 180 : 0}deg)`,
          transition: "right 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1), color 0.2s ease",
        }}
      >
        &gt;
      </button>

      {/* Sliding overlay panel */}
      <div
        className="fixed right-0 top-0 h-screen flex flex-col overflow-hidden"
        style={{
          width: open ? PANEL_W : 0,
          zIndex: 49,
          background: "linear-gradient(to right, transparent, rgba(10,10,10,0.94) 64px)",
          backdropFilter: open ? "blur(28px)" : "none",
          boxShadow: open ? "-48px 0 100px rgba(0,0,0,0.65)" : "none",
          transition: "width 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <div className="flex flex-col h-full overflow-y-auto" style={{ minWidth: PANEL_W }}>

          {/* Renewal Checklist */}
          <div className="px-6 pt-7 pb-6">
            <div className="text-[12px] font-semibold uppercase tracking-widest mb-5" style={{ color: "#444" }}>
              Renewal Checklist
            </div>

            {!nearestPolicy ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Circle size={16} style={{ color: "#252525" }} />
                <span className="text-[12px]" style={{ color: "#333" }}>No active renewals</span>
              </div>
            ) : (() => {
              const stage = nearestPolicy.campaign_stage ?? "pending";
              const isLapsed = stage === "lapsed";
              return (
                <div className="flex flex-col gap-3">
                  <div className="text-[12px] truncate font-medium mb-1" style={{ color: "#555" }}>
                    {nearestPolicy.policy_name}
                  </div>
                  {CHECKLIST_MILESTONES.map(({ key, label }) => {
                    const done    = !isLapsed && isStageComplete(stage, key);
                    const current = !isLapsed && stage === key;
                    const isFinal = key === "confirmed";
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 rounded-md"
                        style={current ? {
                          background: "rgba(255,255,255,0.04)",
                          padding: "4px 6px",
                          margin: "-4px -6px",
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.07)",
                        } : {}}
                      >
                        <div
                          className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                          style={{
                            background: done ? (isFinal ? "#00D97E22" : "#FAFAFA11") : "transparent",
                            border: done
                              ? `1px solid ${isFinal ? "#00D97E" : "#444"}`
                              : current
                                ? "1px solid rgba(255,255,255,0.22)"
                                : "1px solid #252525",
                          }}
                        >
                          {done && (
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: isFinal ? "#00D97E" : "#555" }} />
                          )}
                        </div>
                        <span
                          className="text-[13px] leading-tight"
                          style={{
                            color: done
                              ? isFinal ? "#00D97E" : "#AAAAAA"
                              : current ? "#DDDDDD" : "#444",
                          }}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                  {isLapsed && (
                    <div className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>Lapsed</div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Quick Actions */}
          {policies.length > 0 && (
            <div className="px-6 pb-7">
              <QuickActions clientId={clientId} policies={policies} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
