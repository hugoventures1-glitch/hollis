"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
  Zap,
  Copy,
  Check,
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
  type ResolutionStatus,
  type SummaryVerdict,
  type FlagSeverity,
  type ActionType,
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
    return <ShieldCheck size={18} className="text-[#FAFAFA]" />;
  }
  return <AlertTriangle size={18} className="text-[#9e9e9e]" />;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Tab type ──────────────────────────────────────────────────

type ResolutionTab = "open" | "actioned" | "dismissed";

// ── Flag card ─────────────────────────────────────────────────

interface FlagCardProps {
  flag: PolicyCheckFlag;
  checkId: string;
  clientName: string;
  carrier: string | null;
  expanded: boolean;
  onToggle: () => void;
  onAnnotate: (status: AnnotationStatus, reason?: string) => Promise<void>;
  onResolve: (status: ResolutionStatus) => Promise<void>;
  annotating: boolean;
  resolving: boolean;
}

function FlagCard({
  flag,
  checkId,
  clientName,
  carrier,
  expanded,
  onToggle,
  onAnnotate,
  onResolve,
  annotating,
  resolving,
}: FlagCardProps) {
  // E&O annotation state
  const [dismissMode, setDismissMode] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  // Resolution draft state
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const borderColor =
    flag.severity === "critical"
      ? "border-l-red-500"
      : flag.severity === "warning"
      ? "border-l-[#888888]"
      : "border-l-blue-500";

  const isAnnotated = !!flag.annotation_status;
  const isResolved =
    flag.resolution_status === "actioned" ||
    flag.resolution_status === "dismissed";

  async function handleAnnotate(status: AnnotationStatus, reason?: string) {
    await onAnnotate(status, reason);
    setDismissMode(false);
    setDismissReason("");
  }

  async function handleAct() {
    if (draftOpen && draft) {
      // Already have a draft — just toggle closed
      setDraftOpen(false);
      return;
    }
    setDraftOpen(true);
    setDraft(null);
    setDraftError(null);
    setDraftLoading(true);
    try {
      const res = await fetch(
        `/api/policy-checks/${checkId}/flags/${flag.id}/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft_prompt: flag.draft_prompt ?? `Address the coverage flag: ${flag.title}. Issue: ${flag.what_found}. Expected: ${flag.what_expected}.`,
            action_type: flag.action_type ?? "email_client",
            client_name: clientName,
            carrier,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Draft generation failed");
      }
      const json = await res.json();
      setDraft(json.draft ?? "");
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Failed to generate draft");
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleMarkActioned() {
    await onResolve("actioned");
    setDraftOpen(false);
  }

  return (
    <div
      className={`rounded-xl border border-[#1C1C1C] bg-[#111111] border-l-2 ${borderColor} mb-2 overflow-hidden`}
    >
      {/* Card header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <SeverityBadge severity={flag.severity} />
        <span className="flex-1 text-[13px] font-medium text-[#FAFAFA] text-left">
          {flag.title}
        </span>

        {/* Action chip */}
        {flag.action_label && !isResolved && (
          <span className="hidden sm:inline-flex items-center gap-1 shrink-0 text-[10px] font-medium text-[#FAFAFA] bg-[#FAFAFA]/[0.12] border border-[#1C1C1C] rounded-full px-2 py-0.5">
            <Zap size={9} />
            {flag.action_label}
          </span>
        )}

        {flag.coverage_line && (
          <span className="text-[10px] text-[#6b6b6b] bg-[#ffffff06] border border-[#ffffff0e] rounded px-1.5 py-0.5 shrink-0">
            {flag.coverage_line.toUpperCase()}
          </span>
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${CONFIDENCE_STYLES[flag.confidence]}`}
        >
          {flag.confidence} conf.
        </span>
        {isAnnotated && !expanded && (
          <span className="text-[10px] text-[#6b6b6b] shrink-0">
            {ANNOTATION_LABELS[flag.annotation_status!]}
          </span>
        )}
        {expanded ? (
          <ChevronUp size={14} className="text-[#6b6b6b] shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[#6b6b6b] shrink-0" />
        )}
      </button>

      {/* Annotation ribbon (collapsed) */}
      {isAnnotated && !expanded && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <CheckCircle2 size={11} className="text-[#6b6b6b]" />
          <span className="text-[11px] text-[#6b6b6b]">
            {ANNOTATION_LABELS[flag.annotation_status!]}
            {flag.annotation_reason ? ` — ${flag.annotation_reason}` : ""}
            {flag.annotated_at ? ` · ${formatDate(flag.annotated_at)}` : ""}
          </span>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1C1C1C]/60">
          <div className="pt-3 space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                Flag Type
              </div>
              <div className="text-[12px] text-[#8a8a8a]">
                {FLAG_TYPE_LABELS[flag.flag_type]}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                What Was Found
              </div>
              <div className="text-[13px] text-[#FAFAFA] leading-relaxed">
                {flag.what_found}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                What Was Expected
              </div>
              <div className="text-[13px] text-[#FAFAFA] leading-relaxed">
                {flag.what_expected}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">
                Why It Matters
              </div>
              <div className="text-[13px] text-[#FAFAFA] leading-relaxed">
                {flag.why_it_matters}
              </div>
            </div>
          </div>

          {/* ── Resolution section ──────────────────────────── */}
          <div className="mt-4 pt-3 border-t border-[#1C1C1C]/60">
            <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-2.5">
              Resolve Flag
            </div>

            {flag.resolution_status === "actioned" ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-[#FAFAFA]" />
                <span className="text-[12px] text-[#8a8a8a]">
                  Marked as <span className="text-[#FAFAFA] font-medium">Actioned</span>
                </span>
                <button
                  onClick={() => onResolve("open")}
                  disabled={resolving}
                  className="ml-auto text-[11px] text-[#6b6b6b] hover:text-[#FAFAFA] transition-colors"
                >
                  Undo
                </button>
              </div>
            ) : flag.resolution_status === "dismissed" ? (
              <div className="flex items-center gap-2">
                <X size={13} className="text-[#6b6b6b]" />
                <span className="text-[12px] text-[#8a8a8a]">
                  Dismissed
                </span>
                <button
                  onClick={() => onResolve("open")}
                  disabled={resolving}
                  className="ml-auto text-[11px] text-[#6b6b6b] hover:text-[#FAFAFA] transition-colors"
                >
                  Undo
                </button>
              </div>
            ) : (
              <>
                {/* Action chip full-width (mobile fallback) */}
                {flag.action_label && (
                  <div className="flex items-center gap-1.5 mb-3 text-[11px] font-medium text-[#FAFAFA]">
                    <Zap size={10} />
                    {flag.action_label}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAct}
                    disabled={resolving || draftLoading}
                    className="h-7 px-3 rounded-md bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] text-[#FAFAFA] text-[12px] font-medium hover:bg-[#FAFAFA]/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {draftLoading ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Zap size={11} />
                    )}
                    {draftOpen && !draftLoading ? "Close Draft" : "Act"}
                  </button>
                  <button
                    onClick={() => onResolve("dismissed")}
                    disabled={resolving || draftLoading}
                    className="h-7 px-3 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors disabled:opacity-40"
                  >
                    {resolving ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      "Dismiss"
                    )}
                  </button>
                </div>

                {/* Inline draft area */}
                {draftOpen && (
                  <div className="mt-3 rounded-lg bg-[#0C0C0C] border border-[#1C1C1C] overflow-hidden">
                    {draftLoading && (
                      <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[#6b6b6b]">
                        <Loader2 size={12} className="animate-spin text-[#FAFAFA]" />
                        Generating draft…
                      </div>
                    )}
                    {draftError && (
                      <div className="px-3 py-3 text-[12px] text-red-400">
                        {draftError}
                      </div>
                    )}
                    {draft !== null && !draftLoading && (
                      <>
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={10}
                          className="w-full bg-transparent px-3 py-3 text-[12px] text-[#FAFAFA] font-mono leading-relaxed outline-none resize-none"
                        />
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#1C1C1C] bg-[#ffffff03]">
                          <button
                            onClick={handleCopy}
                            className="h-7 px-3 flex items-center gap-1.5 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors"
                          >
                            {copied ? (
                              <Check size={11} className="text-[#FAFAFA]" />
                            ) : (
                              <Copy size={11} />
                            )}
                            {copied ? "Copied" : "Copy"}
                          </button>
                          <button
                            onClick={handleMarkActioned}
                            disabled={resolving}
                            className="h-7 px-3 flex items-center gap-1.5 rounded-md bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] text-[#FAFAFA] text-[12px] font-medium hover:bg-[#FAFAFA]/20 transition-colors disabled:opacity-40"
                          >
                            {resolving ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={11} />
                            )}
                            Mark as Actioned
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── E&O annotation section ──────────────────────── */}
          <div className="mt-4 pt-3 border-t border-[#1C1C1C]/60">
            <div className="text-[10px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-2.5">
              E&amp;O Documentation
            </div>
            {isAnnotated ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-[#FAFAFA]" />
                <span className="text-[12px] text-[#8a8a8a]">
                  <span className="text-[#FAFAFA] font-medium">
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
                <div className="text-[11px] text-[#8a8a8a] mb-2">
                  Reason for dismissal{" "}
                  <span className="text-red-400">*required</span>
                </div>
                <textarea
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                  placeholder="e.g. Client confirmed this coverage is not required by contract"
                  rows={3}
                  className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] placeholder:text-[#6b6b6b] outline-none focus:border-[#555555] resize-none mb-3"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAnnotate("dismissed", dismissReason)}
                    disabled={!dismissReason.trim() || annotating}
                    className="h-7 px-3 rounded-md bg-[#888888] text-white text-[12px] font-medium hover:bg-[#FAFAFA] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
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
                    className="h-7 px-3 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
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
                  className="h-7 px-3 rounded-md bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] text-[#FAFAFA] text-[12px] font-medium hover:bg-[#FAFAFA]/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  {annotating && <Loader2 size={11} className="animate-spin" />}
                  Accept
                </button>
                <button
                  onClick={() => setDismissMode(true)}
                  disabled={annotating}
                  className="h-7 px-3 rounded-md bg-[#1C1C1C] border border-[#1C1C1C] text-[#9e9e9e] text-[12px] font-medium hover:bg-[#1C1C1C] transition-colors disabled:opacity-40"
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

// ── Flag group section ────────────────────────────────────────

interface FlagGroupProps {
  label: string;
  labelColor: string;
  flags: PolicyCheckFlag[];
  checkId: string;
  clientName: string;
  carrier: string | null;
  expandedFlags: Set<string>;
  annotatingFlags: Set<string>;
  resolvingFlags: Set<string>;
  onToggle: (id: string) => void;
  onAnnotate: (id: string, status: AnnotationStatus, reason?: string) => Promise<void>;
  onResolve: (id: string, status: ResolutionStatus) => Promise<void>;
  nounSingular: string;
  nounPlural: string;
}

function FlagGroup({
  label, labelColor, flags, checkId, clientName, carrier,
  expandedFlags, annotatingFlags, resolvingFlags,
  onToggle, onAnnotate, onResolve,
  nounSingular, nounPlural,
}: FlagGroupProps) {
  if (flags.length === 0) return null;
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>
          {label}
        </span>
        <span className="text-[11px] text-[#6b6b6b]">
          {flags.length} {flags.length === 1 ? nounSingular : nounPlural}
        </span>
      </div>
      {flags.map((flag) => (
        <FlagCard
          key={flag.id}
          flag={flag}
          checkId={checkId}
          clientName={clientName}
          carrier={carrier}
          expanded={expandedFlags.has(flag.id)}
          onToggle={() => onToggle(flag.id)}
          onAnnotate={(status, reason) => onAnnotate(flag.id, status, reason)}
          onResolve={(status) => onResolve(flag.id, status)}
          annotating={annotatingFlags.has(flag.id)}
          resolving={resolvingFlags.has(flag.id)}
        />
      ))}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function PolicyCheckDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const sp        = useSearchParams();
  const backParam = sp.get("back");
  const backId    = sp.get("backId");
  const backName  = sp.get("backName");
  const backHref  = backParam === "client" && backId   ? `/clients/${backId}`                   : "/policies";
  const backLabel = backParam === "client" && backName ? decodeURIComponent(backName) : "Policy Audit";

  const [check, setCheck] = useState<PolicyCheckWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [annotating, setAnnotating] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ResolutionTab>("open");

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

  const handleAnnotate = useCallback(async (
    flagId: string,
    status: AnnotationStatus,
    reason?: string
  ) => {
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
  }, [id]);

  const handleResolve = useCallback(async (
    flagId: string,
    status: ResolutionStatus
  ) => {
    setResolving((r) => new Set([...r, flagId]));
    try {
      const res = await fetch(`/api/policy-checks/${id}/flags/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution_status: status }),
      });
      if (res.ok) {
        setCheck((prev) =>
          prev
            ? {
                ...prev,
                policy_check_flags: prev.policy_check_flags.map((f) =>
                  f.id === flagId ? { ...f, resolution_status: status } : f
                ),
              }
            : null
        );
        // Auto-switch tab when a flag is resolved away from current tab
        if (status !== activeTab && status !== "open") {
          // keep user on current tab after resolving — they'll see it disappear
        }
      }
    } finally {
      setResolving((r) => {
        const next = new Set(r);
        next.delete(flagId);
        return next;
      });
    }
  }, [id, activeTab]);

  // ── Loading / error ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#0C0C0C]">
        <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
          <Link
            href="/policies"
            className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
          >
            <ArrowLeft size={13} />
            Policy Audit
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="text-[#6b6b6b] animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !check) {
    return (
      <div className="flex flex-col h-full bg-[#0C0C0C]">
        <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
          <Link
            href="/policies"
            className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
          >
            <ArrowLeft size={13} />
            Policy Audit
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[14px] text-[#6b6b6b]">{error ?? "Not found"}</div>
        </div>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────

  const flags = check.policy_check_flags ?? [];
  const totalFlags = flags.length;

  const openFlags      = flags.filter((f) => f.resolution_status === "open");
  const actionedFlags  = flags.filter((f) => f.resolution_status === "actioned");
  const dismissedFlags = flags.filter((f) => f.resolution_status === "dismissed");

  const resolvedCount = actionedFlags.length + dismissedFlags.length;
  const progressPct = totalFlags > 0 ? Math.round((resolvedCount / totalFlags) * 100) : 0;

  const criticalFlags  = flags.filter((f) => f.severity === "critical");
  const warningFlags   = flags.filter((f) => f.severity === "warning");
  const advisoryFlags  = flags.filter((f) => f.severity === "advisory");
  const unannotated    = flags.filter((f) => !f.annotation_status).length;

  const clientName = check.clients?.name ?? "Ad-hoc Check";
  const carrier: string | null =
    (check.policy_check_documents?.[0]?.extracted_carrier as string | null) ?? null;
  const verdict = check.summary_verdict;
  const verdictStyle = verdict ? VERDICT_STYLES[verdict] : null;
  const verdictLabel = verdictStyle?.label ?? "Pending";

  const failedDocs = (check.policy_check_documents ?? []).filter(
    (d) => d.extraction_status === "failed"
  );

  // Active tab's flags split by severity
  const tabFlags: PolicyCheckFlag[] =
    activeTab === "open"
      ? openFlags
      : activeTab === "actioned"
      ? actionedFlags
      : dismissedFlags;

  const tabCritical  = tabFlags.filter((f) => f.severity === "critical");
  const tabWarning   = tabFlags.filter((f) => f.severity === "warning");
  const tabAdvisory  = tabFlags.filter((f) => f.severity === "advisory");

  const TABS: { key: ResolutionTab; label: string; count: number }[] = [
    { key: "open",      label: "Open",      count: openFlags.length },
    { key: "actioned",  label: "Actioned",  count: actionedFlags.length },
    { key: "dismissed", label: "Dismissed", count: dismissedFlags.length },
  ];

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#8a8a8a]">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 hover:text-[#FAFAFA] transition-colors"
          >
            <ArrowLeft size={13} />
            {backLabel}
          </Link>
          <ChevronRight size={12} className="text-[#6b6b6b]" />
          <span className="text-[#FAFAFA]">{clientName}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Unannotated badge */}
          {unannotated > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#9e9e9e] bg-[#1C1C1C] border border-[#1C1C1C] rounded-full px-2.5 py-1">
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
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors"
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
        <div className="flex-1 overflow-y-auto border-r border-[#1C1C1C]">
          <div className="px-8 py-6">

            {/* Failed doc notice */}
            {failedDocs.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-[#1C1C1C] border border-[#1C1C1C] px-4 py-3 mb-5">
                <AlertTriangle
                  size={14}
                  className="text-[#9e9e9e] shrink-0 mt-0.5"
                />
                <div className="text-[12px] text-[#9e9e9e]">
                  {failedDocs.length} document
                  {failedDocs.length !== 1 ? "s" : ""} could not be read —
                  flags may be incomplete.{" "}
                  <span className="text-[#9e9e9e]/70">
                    {failedDocs.map((d) => d.original_filename).join(", ")}
                  </span>
                </div>
              </div>
            )}

            {/* Progress bar (only when there are flags) */}
            {totalFlags > 0 && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-[#6b6b6b]">Resolution progress</span>
                  <span className="text-[11px] text-[#8a8a8a] tabular-nums">
                    {resolvedCount} / {totalFlags} resolved
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#1C1C1C] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#FAFAFA] transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Tab filter */}
            {totalFlags > 0 && (
              <div className="flex items-center gap-1 mb-5 bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg p-1 w-fit">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium transition-colors ${
                      activeTab === tab.key
                        ? "bg-[#1C1C1C] text-[#FAFAFA]"
                        : "text-[#6b6b6b] hover:text-[#8a8a8a]"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums font-semibold ${
                        activeTab === tab.key
                          ? tab.key === "open"
                            ? "bg-[#1C1C1C] text-[#9e9e9e]"
                            : "bg-[#FAFAFA]/[0.06] text-[#FAFAFA]"
                          : "bg-[#ffffff08] text-[#6b6b6b]"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* All clear */}
            {flags.length === 0 && check.overall_status === "complete" && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center mb-4">
                  <ShieldCheck size={24} className="text-[#FAFAFA]" />
                </div>
                <div className="text-[16px] font-semibold text-[#FAFAFA] mb-1">
                  No issues found
                </div>
                <div className="text-[13px] text-[#8a8a8a]">
                  This policy meets all coverage requirements.
                </div>
              </div>
            )}

            {/* Empty tab state */}
            {totalFlags > 0 && tabFlags.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 size={20} className="text-[#6b6b6b] mb-3" />
                <div className="text-[13px] text-[#6b6b6b]">
                  No {activeTab} flags
                </div>
              </div>
            )}

            {/* Flag groups for active tab */}
            <FlagGroup
              label="Critical"
              labelColor="text-red-400"
              flags={tabCritical}
              checkId={id}
              clientName={clientName}
              carrier={carrier}
              expandedFlags={expandedFlags}
              annotatingFlags={annotating}
              resolvingFlags={resolving}
              onToggle={toggleFlag}
              onAnnotate={handleAnnotate}
              onResolve={handleResolve}
              nounSingular="issue"
              nounPlural="issues"
            />
            <FlagGroup
              label="Warnings"
              labelColor="text-[#9e9e9e]"
              flags={tabWarning}
              checkId={id}
              clientName={clientName}
              carrier={carrier}
              expandedFlags={expandedFlags}
              annotatingFlags={annotating}
              resolvingFlags={resolving}
              onToggle={toggleFlag}
              onAnnotate={handleAnnotate}
              onResolve={handleResolve}
              nounSingular="issue"
              nounPlural="issues"
            />
            <FlagGroup
              label="Advisory"
              labelColor="text-blue-400"
              flags={tabAdvisory}
              checkId={id}
              clientName={clientName}
              carrier={carrier}
              expandedFlags={expandedFlags}
              annotatingFlags={annotating}
              resolvingFlags={resolving}
              onToggle={toggleFlag}
              onAnnotate={handleAnnotate}
              onResolve={handleResolve}
              nounSingular="note"
              nounPlural="notes"
            />

          </div>
        </div>

        {/* Right: Summary panel */}
        <div className="w-72 shrink-0 overflow-y-auto">
          <div className="px-5 py-6 space-y-4">

            {/* Verdict card */}
            <div className="rounded-xl border border-[#1C1C1C] bg-[#111111] p-4">
              <div className="flex items-center gap-2 mb-3">
                <VerdictIcon verdict={verdict} />
                <span className={`text-[14px] font-semibold ${verdictStyle?.text ?? "text-[#FAFAFA]"}`}>
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

              {check.requires_review && (
                <div className="flex items-start gap-2 mt-3 rounded-lg bg-[#1C1C1C] border border-[#1C1C1C] px-3 py-2.5">
                  <AlertTriangle size={13} className="text-[#9e9e9e] shrink-0 mt-0.5" />
                  <div className="text-[11px] text-[#9e9e9e] leading-snug">
                    <span className="font-semibold block">Manual review required</span>
                    AI confidence is low. Verify each flag against the source document before acting.
                  </div>
                </div>
              )}

              {check.summary_note && (
                <p className="text-[12px] text-[#8a8a8a] leading-relaxed mt-3">
                  {check.summary_note}
                </p>
              )}

              {/* Flag counts */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="text-center">
                  <div
                    className={`text-[20px] font-bold tabular-nums ${criticalFlags.length > 0 ? "text-red-400" : "text-[#FAFAFA]"}`}
                  >
                    {criticalFlags.length}
                  </div>
                  <div className="text-[10px] text-[#6b6b6b] mt-0.5">
                    Critical
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-[20px] font-bold tabular-nums ${warningFlags.length > 0 ? "text-[#9e9e9e]" : "text-[#FAFAFA]"}`}
                  >
                    {warningFlags.length}
                  </div>
                  <div className="text-[10px] text-[#6b6b6b] mt-0.5">
                    Warning
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-[20px] font-bold tabular-nums ${advisoryFlags.length > 0 ? "text-blue-400" : "text-[#FAFAFA]"}`}
                  >
                    {advisoryFlags.length}
                  </div>
                  <div className="text-[10px] text-[#6b6b6b] mt-0.5">
                    Advisory
                  </div>
                </div>
              </div>
            </div>

            {/* Documents card */}
            <div className="rounded-xl border border-[#1C1C1C] bg-[#111111] p-4">
              <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-3">
                Documents Reviewed
              </div>
              <div className="space-y-3">
                {(check.policy_check_documents ?? []).map((doc) => (
                  <div key={doc.id} className="flex items-start gap-2.5">
                    <FileText
                      size={12}
                      className="text-[#6b6b6b] shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[#FAFAFA] truncate">
                        {doc.original_filename}
                      </div>
                      {doc.extracted_named_insured && (
                        <div className="text-[11px] text-[#8a8a8a] mt-0.5 truncate">
                          {doc.extracted_named_insured}
                        </div>
                      )}
                      {doc.extracted_expiry_date && (
                        <div className="text-[10px] text-[#6b6b6b] mt-0.5">
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
            <div className="rounded-xl border border-[#1C1C1C] bg-[#111111] p-4">
              <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-3">
                Check Details
              </div>
              <div className="space-y-2">
                {check.clients && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#6b6b6b]">Client</span>
                    <span className="text-[11px] text-[#FAFAFA]">
                      {check.clients.name}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#6b6b6b]">Checked</span>
                  <span className="text-[11px] text-[#FAFAFA]">
                    {formatDate(check.created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#6b6b6b]">Documents</span>
                  <span className="text-[11px] text-[#FAFAFA]">
                    {check.document_count}
                  </span>
                </div>
                {unannotated > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#6b6b6b]">
                      Awaiting review
                    </span>
                    <span className="text-[11px] text-[#9e9e9e]">
                      {unannotated} flags
                    </span>
                  </div>
                )}
                {resolvedCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#6b6b6b]">Resolved</span>
                    <span className="text-[11px] text-[#FAFAFA]">
                      {resolvedCount} / {totalFlags}
                    </span>
                  </div>
                )}
                {check.client_industry && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-[#6b6b6b]">Industry</span>
                    <span className="text-[11px] text-[#FAFAFA]">
                      {check.client_industry}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* E&O notice */}
            <p className="text-[10px] text-[#6b6b6b] leading-relaxed px-1">
              All flag annotations are logged with timestamp for E&amp;O
              documentation.
            </p>

          </div>
        </div>

      </div>
    </div>
  );
}
