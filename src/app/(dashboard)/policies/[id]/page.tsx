"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle2,
  X,
  Download,
  Loader2,
  ArrowLeft,
  Clock,
} from "lucide-react";
import {
  SEVERITY_BADGE_STYLES,
  CONFIDENCE_STYLES,
  VERDICT_STYLES,
  EXTRACTION_STATUS_STYLES,
  ANNOTATION_LABELS,
  FLAG_TYPE_LABELS,
  type PolicyCheckWithDetails,
  type PolicyCheckFlag,
  type AnnotationStatus,
  type SummaryVerdict,
  type FlagSeverity,
} from "@/types/policies";

// ── Badge helpers ─────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: FlagSeverity }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${SEVERITY_BADGE_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

function VerdictIcon({ verdict }: { verdict: SummaryVerdict | null }) {
  if (!verdict || verdict === "all_clear") {
    return <ShieldCheck size={18} className="text-[#00d4aa]" />;
  }
  return <AlertTriangle size={18} className="text-amber-400" />;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Flag card ─────────────────────────────────────────────────

interface FlagCardProps {
  flag: PolicyCheckFlag;
  checkId: string;
  expanded: boolean;
  onToggle: () => void;
  onAnnotate: (status: AnnotationStatus, reason?: string) => Promise<void>;
  annotating: boolean;
}

function FlagCard({
  flag,
  checkId: _checkId,
  expanded,
  onToggle,
  onAnnotate,
  annotating,
}: FlagCardProps) {
  const [dismissMode, setDismissMode] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  const borderColor =
    flag.severity === "critical"
      ? "border-l-red-500"
      : flag.severity === "warning"
      ? "border-l-amber-500"
      : "border-l-blue-500";

  const isAnnotated = !!flag.annotation_status;

  async function handleAnnotate(status: AnnotationStatus, reason?: string) {
    await onAnnotate(status, reason);
    setDismissMode(false);
    setDismissReason("");
  }

  return (
    <div
      className={`rounded-xl border border-[#1e1e2a] bg-[#111118] border-l-2 ${borderColor} mb-2 overflow-hidden`}
    >
      {/* Card header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <SeverityBadge severity={flag.severity} />
        <span className="flex-1 text-[13px] font-medium text-[#f5f5f7] text-left">
          {flag.title}
        </span>
        {flag.coverage_line && (
          <span className="text-[10px] text-[#505057] bg-[#ffffff06] border border-[#ffffff0e] rounded px-1.5 py-0.5 shrink-0">
            {flag.coverage_line.toUpperCase()}
          </span>
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${CONFIDENCE_STYLES[flag.confidence]}`}
        >
          {flag.confidence} conf.
        </span>
        {isAnnotated && !expanded && (
          <span className="text-[10px] text-[#505057] shrink-0">
            {ANNOTATION_LABELS[flag.annotation_status!]}
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="text-[#505057] shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[#505057] shrink-0" />
        )}
      </button>

      {/* Annotation ribbon (collapsed) */}
      {isAnnotated && !expanded && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <CheckCircle2 size={11} className="text-[#505057]" />
          <span className="text-[11px] text-[#505057]">
            {ANNOTATION_LABELS[flag.annotation_status!]}
            {flag.annotation_reason ? ` — ${flag.annotation_reason}` : ""}
            {flag.annotated_at ? ` · ${formatDate(flag.annotated_at)}` : ""}
          </span>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1e1e2a]/60">
          <div className="pt-3 space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-[#505057] uppercase tracking-wider mb-1">
                Flag Type
              </div>
              <div className="text-[12px] text-[#8a8b91]">
                {FLAG_TYPE_LABELS[flag.flag_type]}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#505057] uppercase tracking-wider mb-1">
                What Was Found
              </div>
              <div className="text-[13px] text-[#c5c5cb] leading-relaxed">
                {flag.what_found}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#505057] uppercase tracking-wider mb-1">
                What Was Expected
              </div>
              <div className="text-[13px] text-[#c5c5cb] leading-relaxed">
                {flag.what_expected}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#505057] uppercase tracking-wider mb-1">
                Why It Matters
              </div>
              <div className="text-[13px] text-[#c5c5cb] leading-relaxed">
                {flag.why_it_matters}
              </div>
            </div>
          </div>

          {/* Annotation area */}
          <div className="mt-4 pt-3 border-t border-[#1e1e2a]/60">
            {isAnnotated ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-[#00d4aa]" />
                <span className="text-[12px] text-[#8a8b91]">
                  <span className="text-[#f5f5f7] font-medium">
                    {ANNOTATION_LABELS[flag.annotation_status!]}
                  </span>
                  {flag.annotation_reason
                    ? ` — ${flag.annotation_reason}`
                    : ""}
                  {flag.annotated_at
                    ? ` · ${formatDate(flag.annotated_at)}`
                    : ""}
                </span>
              </div>
            ) : dismissMode ? (
              <div>
                <div className="text-[11px] text-[#8a8b91] mb-2">
                  Reason for dismissal{" "}
                  <span className="text-red-400">*required</span>
                </div>
                <textarea
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  placeholder="e.g. Client confirmed this coverage is not required by contract"
                  rows={3}
                  className="w-full bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f7] placeholder:text-[#505057] outline-none focus:border-[#00d4aa]/50 resize-none mb-3"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAnnotate("dismissed", dismissReason)}
                    disabled={!dismissReason.trim() || annotating}
                    className="h-7 px-3 rounded-md bg-amber-600/80 text-white text-[12px] font-medium hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {annotating && (
                      <Loader2 size={11} className="animate-spin" />
                    )}
                    Confirm Dismiss
                  </button>
                  <button
                    onClick={() => {
                      setDismissMode(false);
                      setDismissReason("");
                    }}
                    className="h-7 px-3 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAnnotate("accepted")}
                  disabled={annotating}
                  className="h-7 px-3 rounded-md bg-[#00d4aa]/10 border border-[#00d4aa]/25 text-[#00d4aa] text-[12px] font-medium hover:bg-[#00d4aa]/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {annotating && <Loader2 size={11} className="animate-spin" />}
                  Accept
                </button>
                <button
                  onClick={() => setDismissMode(true)}
                  disabled={annotating}
                  className="h-7 px-3 rounded-md bg-amber-900/20 border border-amber-800/30 text-amber-400 text-[12px] font-medium hover:bg-amber-900/30 transition-colors disabled:opacity-40"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => handleAnnotate("escalated")}
                  disabled={annotating}
                  className="h-7 px-3 rounded-md bg-red-900/20 border border-red-800/30 text-red-400 text-[12px] font-medium hover:bg-red-900/30 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {annotating && <Loader2 size={11} className="animate-spin" />}
                  Escalate
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function PolicyCheckDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [check, setCheck] = useState<PolicyCheckWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [annotating, setAnnotating] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/policy-checks/${id}`);
      if (!res.ok) {
        setError("Check not found.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCheck(data);
      setLoading(false);
    }
    load();
  }, [id]);

  function toggleFlag(flagId: string) {
    setExpandedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flagId)) next.delete(flagId);
      else next.add(flagId);
      return next;
    });
  }

  async function handleAnnotate(
    flagId: string,
    status: AnnotationStatus,
    reason?: string
  ) {
    setAnnotating((a) => new Set([...a, flagId]));
    try {
      const res = await fetch(`/api/policy-checks/${id}/flags/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotation_status: status,
          annotation_reason: reason,
        }),
      });
      if (res.ok) {
        setCheck((prev) =>
          prev
            ? {
                ...prev,
                policy_check_flags: prev.policy_check_flags.map((f) =>
                  f.id === flagId
                    ? {
                        ...f,
                        annotation_status: status,
                        annotation_reason: reason ?? null,
                        annotated_at: new Date().toISOString(),
                      }
                    : f
                ),
              }
            : null
        );
      }
    } finally {
      setAnnotating((a) => {
        const next = new Set(a);
        next.delete(flagId);
        return next;
      });
    }
  }

  // ── Loading / error ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0d0d12]">
        <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
          <Link
            href="/policies"
            className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
          >
            <ArrowLeft size={13} />
            Policy Audit
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="text-[#505057] animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !check) {
    return (
      <div className="flex flex-col h-full bg-[#0d0d12]">
        <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
          <Link
            href="/policies"
            className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
          >
            <ArrowLeft size={13} />
            Policy Audit
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[14px] text-[#505057]">{error ?? "Not found"}</div>
        </div>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────

  const flags = check.policy_check_flags ?? [];
  const criticalFlags = flags.filter((f) => f.severity === "critical");
  const warningFlags = flags.filter((f) => f.severity === "warning");
  const advisoryFlags = flags.filter((f) => f.severity === "advisory");
  const unannotated = flags.filter((f) => !f.annotation_status).length;

  const clientName = check.clients?.name ?? "Ad-hoc Check";
  const verdict = check.summary_verdict;
  const verdictStyle = verdict ? VERDICT_STYLES[verdict] : null;
  const verdictLabel = verdictStyle?.label ?? "Pending";

  const failedDocs = (check.policy_check_documents ?? []).filter(
    (d) => d.extraction_status === "failed"
  );

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#8a8b91]">
          <Link
            href="/policies"
            className="flex items-center gap-1.5 hover:text-[#f5f5f7] transition-colors"
          >
            <ArrowLeft size={13} />
            Policy Audit
          </Link>
          <ChevronRight size={12} className="text-[#505057]" />
          <span className="text-[#f5f5f7]">{clientName}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Unannotated badge */}
          {unannotated > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded-full px-2.5 py-1">
              <Clock size={10} />
              {unannotated} need review
            </span>
          )}

          {/* Verdict badge */}
          {verdict && verdictStyle && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${verdictStyle.bg} ${verdictStyle.text}`}
            >
              <VerdictIcon verdict={verdict} />
              {verdictLabel}
            </span>
          )}

          {/* Download report */}
          {check.overall_status === "complete" && (
            <a
              href={`/api/policy-checks/${id}/report`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] hover:border-[#3e3e4a] transition-colors"
            >
              <Download size={12} />
              Export PDF
            </a>
          )}
        </div>
      </div>

      {/* Body — two column layout */}
      <div className="flex-1 overflow-hidden flex">

        {/* Left: Flag list (scrollable) */}
        <div className="flex-1 overflow-y-auto border-r border-[#1e1e2a]">
          <div className="px-8 py-6">

            {/* Failed doc notice */}
            {failedDocs.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 px-4 py-3 mb-6">
                <AlertTriangle
                  size={14}
                  className="text-amber-400 shrink-0 mt-0.5"
                />
                <div className="text-[12px] text-amber-300">
                  {failedDocs.length} document
                  {failedDocs.length !== 1 ? "s" : ""} could not be read —
                  flags may be incomplete.{" "}
                  <span className="text-amber-400/70">
                    {failedDocs.map((d) => d.original_filename).join(", ")}
                  </span>
                </div>
              </div>
            )}

            {/* All clear */}
            {flags.length === 0 && check.overall_status === "complete" && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center mb-4">
                  <ShieldCheck size={24} className="text-[#00d4aa]" />
                </div>
                <div className="text-[16px] font-semibold text-[#f5f5f7] mb-1">
                  No issues found
                </div>
                <div className="text-[13px] text-[#8a8b91]">
                  This policy meets all coverage requirements.
                </div>
              </div>
            )}

            {/* Critical flags */}
            {criticalFlags.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">
                    Critical
                  </span>
                  <span className="text-[11px] text-[#505057]">
                    {criticalFlags.length}{" "}
                    {criticalFlags.length === 1 ? "issue" : "issues"}
                  </span>
                </div>
                {criticalFlags.map((flag) => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    checkId={id}
                    expanded={expandedFlags.has(flag.id)}
                    onToggle={() => toggleFlag(flag.id)}
                    onAnnotate={(status, reason) =>
                      handleAnnotate(flag.id, status, reason)
                    }
                    annotating={annotating.has(flag.id)}
                  />
                ))}
              </section>
            )}

            {/* Warning flags */}
            {warningFlags.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                    Warnings
                  </span>
                  <span className="text-[11px] text-[#505057]">
                    {warningFlags.length}{" "}
                    {warningFlags.length === 1 ? "issue" : "issues"}
                  </span>
                </div>
                {warningFlags.map((flag) => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    checkId={id}
                    expanded={expandedFlags.has(flag.id)}
                    onToggle={() => toggleFlag(flag.id)}
                    onAnnotate={(status, reason) =>
                      handleAnnotate(flag.id, status, reason)
                    }
                    annotating={annotating.has(flag.id)}
                  />
                ))}
              </section>
            )}

            {/* Advisory flags */}
            {advisoryFlags.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                    Advisory
                  </span>
                  <span className="text-[11px] text-[#505057]">
                    {advisoryFlags.length}{" "}
                    {advisoryFlags.length === 1 ? "note" : "notes"}
                  </span>
                </div>
                {advisoryFlags.map((flag) => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    checkId={id}
                    expanded={expandedFlags.has(flag.id)}
                    onToggle={() => toggleFlag(flag.id)}
                    onAnnotate={(status, reason) =>
                      handleAnnotate(flag.id, status, reason)
                    }
                    annotating={annotating.has(flag.id)}
                  />
                ))}
              </section>
            )}

          </div>
        </div>

        {/* Right: Summary panel */}
        <div className="w-72 shrink-0 overflow-y-auto">
          <div className="px-5 py-6 space-y-4">

            {/* Verdict card */}
            <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] p-4">
              <div className="flex items-center gap-2 mb-3">
                <VerdictIcon verdict={verdict} />
                <span className={`text-[14px] font-semibold ${verdictStyle?.text ?? "text-[#f5f5f7]"}`}>
                  {verdictLabel}
                </span>
              </div>

              {check.overall_confidence && (
                <span
                  className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[check.overall_confidence]}`}
                >
                  {check.overall_confidence} confidence
                </span>
              )}

              {check.summary_note && (
                <p className="text-[12px] text-[#8a8b91] leading-relaxed mt-3">
                  {check.summary_note}
                </p>
              )}

              {/* Flag counts */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="text-center">
                  <div
                    className={`text-[20px] font-bold tabular-nums ${criticalFlags.length > 0 ? "text-red-400" : "text-[#f5f5f7]"}`}
                  >
                    {criticalFlags.length}
                  </div>
                  <div className="text-[10px] text-[#505057] mt-0.5">
                    Critical
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-[20px] font-bold tabular-nums ${warningFlags.length > 0 ? "text-amber-400" : "text-[#f5f5f7]"}`}
                  >
                    {warningFlags.length}
                  </div>
                  <div className="text-[10px] text-[#505057] mt-0.5">
                    Warning
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-[20px] font-bold tabular-nums ${advisoryFlags.length > 0 ? "text-blue-400" : "text-[#f5f5f7]"}`}
                  >
                    {advisoryFlags.length}
                  </div>
                  <div className="text-[10px] text-[#505057] mt-0.5">
                    Advisory
                  </div>
                </div>
              </div>
            </div>

            {/* Documents card */}
            <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] p-4">
              <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-3">
                Documents Reviewed
              </div>
              <div className="space-y-3">
                {(check.policy_check_documents ?? []).map((doc) => (
                  <div key={doc.id} className="flex items-start gap-2.5">
                    <FileText
                      size={12}
                      className="text-[#505057] shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[#f5f5f7] truncate">
                        {doc.original_filename}
                      </div>
                      {doc.extracted_named_insured && (
                        <div className="text-[11px] text-[#8a8b91] mt-0.5 truncate">
                          {doc.extracted_named_insured}
                        </div>
                      )}
                      {doc.extracted_expiry_date && (
                        <div className="text-[10px] text-[#505057] mt-0.5">
                          Expires{" "}
                          {new Date(doc.extracted_expiry_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                        </div>
                      )}
                      <span
                        className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border mt-1 ${EXTRACTION_STATUS_STYLES[doc.extraction_status]}`}
                      >
                        {doc.extraction_status}
                      </span>
                      {doc.extraction_error && (
                        <div className="text-[10px] text-red-400 mt-1 line-clamp-2">
                          {doc.extraction_error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metadata card */}
            <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] p-4">
              <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-3">
                Check Details
              </div>
              <div className="space-y-2">
                {check.clients && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#505057]">Client</span>
                    <span className="text-[11px] text-[#f5f5f7]">
                      {check.clients.name}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#505057]">Checked</span>
                  <span className="text-[11px] text-[#f5f5f7]">
                    {formatDate(check.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#505057]">Documents</span>
                  <span className="text-[11px] text-[#f5f5f7]">
                    {check.document_count}
                  </span>
                </div>
                {unannotated > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#505057]">
                      Awaiting review
                    </span>
                    <span className="text-[11px] text-amber-400">
                      {unannotated} flags
                    </span>
                  </div>
                )}
                {check.client_industry && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#505057]">Industry</span>
                    <span className="text-[11px] text-[#f5f5f7]">
                      {check.client_industry}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* E&O notice */}
            <div className="flex items-start gap-2 px-1">
              <X size={10} className="text-[#505057] shrink-0 mt-0.5 hidden" />
              <p className="text-[10px] text-[#505057] leading-relaxed">
                All flag annotations are logged with timestamp for E&amp;O
                documentation.
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
