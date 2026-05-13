"use client";

import { useState } from "react";
import {
  Mail,
  MessageSquare,
  FileText,
  Send,
  BadgeCheck,
  AlertOctagon,
  Inbox,
  CheckCircle2,
  StickyNote,
  Printer,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  ShieldAlert,
  OctagonX,
  Flag,
} from "lucide-react";
import type { AuditLogEntry, AuditEventType } from "@/types/renewals";

const EVENT_ICONS: Record<AuditEventType, React.ElementType> = {
  email_sent:               Mail,
  sms_sent:                 MessageSquare,
  insurer_terms_logged:     FileText,
  submission_sent:          Send,
  recommendation_sent:      FileText,
  client_confirmed:         BadgeCheck,
  final_notice_sent:        AlertOctagon,
  lapse_recorded:           AlertOctagon,
  doc_requested:            Inbox,
  doc_received:             CheckCircle2,
  note_added:               StickyNote,
  // Agent tier system
  signal_received:          Inbox,
  tier_1_action:            Zap,
  tier_2_drafted:           Clock,
  tier_3_escalated:         ShieldAlert,
  sequence_halted:          OctagonX,
  flag_set:                 Flag,
  // Escalation resolution (migration 039)
  escalation_resolved:      BadgeCheck,
};

const EVENT_COLORS: Record<AuditEventType, string> = {
  // Standard events — neutral
  email_sent:               "text-text-secondary bg-hover-overlay",
  sms_sent:                 "text-text-secondary bg-hover-overlay",
  insurer_terms_logged:     "text-text-secondary bg-hover-overlay",
  submission_sent:          "text-text-secondary bg-hover-overlay",
  recommendation_sent:      "text-text-secondary bg-hover-overlay",
  final_notice_sent:        "text-warning-text bg-hover-overlay",
  doc_requested:            "text-text-secondary bg-hover-overlay",
  note_added:               "text-text-tertiary bg-hover-overlay",
  signal_received:          "text-text-tertiary bg-hover-overlay",
  tier_2_drafted:           "text-warning-text bg-hover-overlay",
  flag_set:                 "text-text-secondary bg-hover-overlay",
  // Positive events — primary
  client_confirmed:         "text-text-primary bg-hover-overlay",
  doc_received:             "text-text-primary bg-hover-overlay",
  tier_1_action:            "text-text-primary bg-hover-overlay",
  escalation_resolved:      "text-text-primary bg-hover-overlay",
  // Danger events — red
  lapse_recorded:           "text-danger bg-danger/[0.06]",
  tier_3_escalated:         "text-danger bg-danger/[0.06]",
  sequence_halted:          "text-danger bg-danger/[0.06]",
};

const EVENT_LABELS: Record<AuditEventType, string> = {
  email_sent:               "Email Sent",
  sms_sent:                 "SMS Sent",
  insurer_terms_logged:     "Insurer Terms Logged",
  submission_sent:          "Submission Sent",
  recommendation_sent:      "Recommendation Sent",
  client_confirmed:         "Renewal Confirmed",
  final_notice_sent:        "Final Notice Sent",
  lapse_recorded:           "Policy Lapsed",
  doc_requested:            "Document Requested",
  doc_received:             "Document Received",
  note_added:               "Note Added",
  // Agent tier system
  signal_received:          "Signal Received",
  tier_1_action:            "Agent Acted Autonomously",
  tier_2_drafted:           "Queued for Broker Review",
  tier_3_escalated:         "Escalated to Broker",
  sequence_halted:          "Sequence Halted",
  flag_set:                 "Flag Updated",
  // Escalation resolution (migration 039)
  escalation_resolved:      "Escalation Resolved",
};

const CHANNEL_LABELS: Record<string, string> = {
  email:    "Email",
  sms:      "SMS",
  internal: "Internal",
  web:      "Web",
};

interface AuditTimelineProps {
  entries: AuditLogEntry[];
}

export function AuditTimeline({ entries }: AuditTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  if (entries.length === 0) {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>
          Audit Timeline
        </div>
        <div className="text-[13px] py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
          No audit events recorded yet. Events are logged automatically as the campaign progresses.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5 space-y-4 print:shadow-none print:border-0" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
          Audit Timeline
          <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: "var(--text-tertiary)" }}>
            ({entries.length} event{entries.length !== 1 ? "s" : ""})
          </span>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors print:hidden"
          style={{ background: "var(--hover-overlay)", color: "var(--text-secondary)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-overlay)"; }}
        >
          <Printer size={12} />
          Download Report
        </button>
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[18px] top-2 bottom-2 w-px" style={{ background: "var(--border)" }} />

        <div className="space-y-3">
          {[...entries].reverse().map((entry) => {
            const Icon = EVENT_ICONS[entry.event_type];
            const colorClass = EVENT_COLORS[entry.event_type];
            const isExpanded = expandedId === entry.id;
            const hasContent = !!entry.content_snapshot;

            return (
              <div key={entry.id} className="flex gap-4">
                {/* Icon bubble */}
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center z-10 ${colorClass}`}>
                  <Icon size={14} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                        {EVENT_LABELS[entry.event_type]}
                      </span>
                      {entry.channel && (
                        <span className="ml-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          via {CHANNEL_LABELS[entry.channel] ?? entry.channel}
                        </span>
                      )}
                      {entry.actor_type === "agent" && (
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-secondary)", background: "var(--hover-overlay)" }}>
                          agent
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(entry.created_at).toLocaleString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </div>
                  </div>

                  {entry.recipient && (
                    <div className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>→ {entry.recipient}</div>
                  )}

                  {hasContent && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="flex items-center gap-1 mt-1 text-[11px] transition-colors"
                      style={{ color: "var(--text-tertiary)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
                    >
                      {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {isExpanded ? "Hide" : "Show"} content
                    </button>
                  )}

                  {isExpanded && entry.content_snapshot && (
                    <pre className="mt-2 text-[11px] whitespace-pre-wrap font-mono leading-relaxed rounded-lg p-3 max-h-48 overflow-y-auto" style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      {entry.content_snapshot}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Print styles injected via global CSS — tailwind print: variants work here */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .audit-print-zone, .audit-print-zone * { visibility: visible; }
          .audit-print-zone { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
