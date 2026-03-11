"use client";

import { useState } from "react";
import {
  Mail,
  MessageSquare,
  FileQuestion,
  FileCheck2,
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
} from "lucide-react";
import type { AuditLogEntry, AuditEventType } from "@/types/renewals";

const EVENT_ICONS: Record<AuditEventType, React.ElementType> = {
  email_sent:               Mail,
  sms_sent:                 MessageSquare,
  questionnaire_sent:       FileQuestion,
  questionnaire_responded:  FileCheck2,
  insurer_terms_logged:     FileText,
  submission_sent:          Send,
  recommendation_sent:      FileText,
  client_confirmed:         BadgeCheck,
  final_notice_sent:        AlertOctagon,
  lapse_recorded:           AlertOctagon,
  doc_requested:            Inbox,
  doc_received:             CheckCircle2,
  note_added:               StickyNote,
};

const EVENT_COLORS: Record<AuditEventType, string> = {
  email_sent:               "text-[#60a5fa] bg-[#3b82f6]/10",
  sms_sent:                 "text-[#c084fc] bg-[#a855f7]/10",
  questionnaire_sent:       "text-[#818cf8] bg-[#4f46e5]/10",
  questionnaire_responded:  "text-[#4ade80] bg-[#16a34a]/10",
  insurer_terms_logged:     "text-[#fbbf24] bg-[#f59e0b]/10",
  submission_sent:          "text-[#22d3ee] bg-[#0891b2]/10",
  recommendation_sent:      "text-[#2dd4bf] bg-[#0d9488]/10",
  client_confirmed:         "text-[#4ade80] bg-[#16a34a]/10",
  final_notice_sent:        "text-[#fbbf24] bg-[#d97706]/10",
  lapse_recorded:           "text-[#f87171] bg-[#dc2626]/10",
  doc_requested:            "text-[#818cf8] bg-[#4f46e5]/10",
  doc_received:             "text-[#00d4aa] bg-[#00d4aa]/10",
  note_added:               "text-zinc-400 bg-zinc-800/40",
};

const EVENT_LABELS: Record<AuditEventType, string> = {
  email_sent:               "Email Sent",
  sms_sent:                 "SMS Sent",
  questionnaire_sent:       "Questionnaire Sent",
  questionnaire_responded:  "Client Responded",
  insurer_terms_logged:     "Insurer Terms Logged",
  submission_sent:          "Submission Sent",
  recommendation_sent:      "Recommendation Sent",
  client_confirmed:         "Renewal Confirmed",
  final_notice_sent:        "Final Notice Sent",
  lapse_recorded:           "Policy Lapsed",
  doc_requested:            "Document Requested",
  doc_received:             "Document Received",
  note_added:               "Note Added",
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
      <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5">
        <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-4">
          Audit Timeline
        </div>
        <div className="text-[13px] text-[#505057] py-4 text-center">
          No audit events recorded yet. Events are logged automatically as the campaign progresses.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5 space-y-4 print:shadow-none print:border-0">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest">
          Audit Timeline
          <span className="ml-2 text-[#505057] font-normal normal-case tracking-normal">
            ({entries.length} event{entries.length !== 1 ? "s" : ""})
          </span>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-[#ffffff06] text-zinc-400 hover:bg-[#ffffff0a] hover:text-zinc-300 transition-colors print:hidden"
        >
          <Printer size={12} />
          Download Report
        </button>
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[18px] top-2 bottom-2 w-px bg-[#1e1e2a]" />

        <div className="space-y-3">
          {entries.map((entry) => {
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
                      <span className="text-[13px] font-medium text-[#f5f5f7]">
                        {EVENT_LABELS[entry.event_type]}
                      </span>
                      {entry.channel && (
                        <span className="ml-2 text-[11px] text-[#505057]">
                          via {CHANNEL_LABELS[entry.channel] ?? entry.channel}
                        </span>
                      )}
                      {entry.actor_type === "agent" && (
                        <span className="ml-2 text-[11px] text-[#8a8b91] bg-[#ffffff08] px-1.5 py-0.5 rounded">
                          manual
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#505057] tabular-nums shrink-0">
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
                    <div className="text-[12px] text-[#8a8b91] mt-0.5">→ {entry.recipient}</div>
                  )}

                  {hasContent && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="flex items-center gap-1 mt-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {isExpanded ? "Hide" : "Show"} content
                    </button>
                  )}

                  {isExpanded && entry.content_snapshot && (
                    <pre className="mt-2 text-[11px] text-zinc-500 whitespace-pre-wrap font-mono leading-relaxed bg-[#0d0d12] border border-[#1e1e2a] rounded-lg p-3 max-h-48 overflow-y-auto">
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
