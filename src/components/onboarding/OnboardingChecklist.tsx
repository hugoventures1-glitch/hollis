"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import type { OnboardingStatus } from "@/types/settings";

interface Step {
  key: keyof OnboardingStatus;
  label: string;
  description: string;
  href: string;
  extra?: string;
}

const STEPS: Step[] = [
  {
    key: "profile_complete",
    label: "Set up your profile",
    description: "Add your name so it appears correctly in client emails and certificates.",
    href: "/settings?tab=profile",
  },
  {
    key: "email_configured",
    label: "Configure email settings",
    description: "Set your sender name and email signature.",
    href: "/settings?tab=email",
  },
  {
    key: "templates_approved",
    label: "Approve campaign templates",
    description: "Review and approve all 4 renewal templates before Hollis can send campaigns.",
    href: "/settings?tab=hollis",
  },
  {
    key: "policies_imported",
    label: "Import your client book",
    description: "Upload your policies so Hollis has renewals to manage.",
    href: "/settings?tab=import",
  },
  {
    key: "email_samples_imported",
    label: "Upload writing samples",
    description: "Paste 20+ past emails so Hollis can match your writing style.",
    href: "/settings?tab=writing-style",
  },
];

export function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  if (status.all_complete) return null;

  const completed = STEPS.filter((s) => status[s.key] === true).length;
  const total = STEPS.length;
  const pct = Math.round((completed / total) * 100);

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px 24px",
        marginBottom: 16,
        animation: "hollis-card-in 480ms cubic-bezier(0.16,1,0.3,1) 90ms both",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Get Hollis ready
          </p>
          <span
            className="text-[11px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA" }}
          >
            {completed} of {total} complete
          </span>
        </div>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 rounded-full overflow-hidden mb-5"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: "#60A5FA",
            animation: "hollis-bar-grow 1s cubic-bezier(0.16,1,0.3,1) 200ms both",
            ["--bar-width" as string]: `${pct}%`,
          }}
        />
      </div>

      {/* Step list */}
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {STEPS.map((step) => {
          const done = status[step.key] === true;
          const extra =
            step.key === "email_samples_imported" && !done
              ? ` (${status.email_samples_count}/20)`
              : "";

          return (
            <div key={step.key} className="flex items-center gap-2 min-w-[200px]">
              {done ? (
                <CheckCircle2
                  size={15}
                  strokeWidth={2}
                  style={{ color: "#22C55E", flexShrink: 0 }}
                />
              ) : (
                <Circle
                  size={15}
                  strokeWidth={1.5}
                  style={{ color: "var(--text-secondary)", flexShrink: 0 }}
                />
              )}
              {done ? (
                <span
                  className="text-[13px]"
                  style={{ color: "var(--text-secondary)", textDecoration: "line-through" }}
                >
                  {step.label}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className="flex items-center gap-1 text-[13px] transition-colors"
                  style={{ color: "var(--text-primary)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#60A5FA")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "var(--text-primary)")
                  }
                >
                  {step.label}{extra}
                  <ArrowRight size={11} style={{ opacity: 0.6 }} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
