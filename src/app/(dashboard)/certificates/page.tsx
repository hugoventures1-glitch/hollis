"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle,
  FileText,
  Send,
  Eye,
  Loader2,
} from "lucide-react";
import type { COIRequest, COIRequestStatus, CertificateStatus } from "@/types/coi";
import { COVERAGE_TYPE_LABELS, formatLimit } from "@/types/coi";
import { RejectButton } from "./_components/RejectButton";
import { ApproveButton } from "./_components/ApproveButton";
import { CertsTable, type CertWithSequences } from "./_components/CertsTable";
import { SequencesTab } from "./_components/SequencesTab";
import { useHollisData } from "@/hooks/useHollisData";
import { Breadcrumb } from "@/components/nav/Breadcrumb";
import { decodeCrumbs } from "@/lib/trail";

// ── Status style maps ─────────────────────────────────────────────────────────

const REQUEST_STATUS_STYLES: Record<COIRequestStatus, string> = {
  pending:            "bg-border text-text-secondary border border-border",
  approved:           "bg-hover-overlay text-text-primary border border-border",
  rejected:           "bg-red-900/30 text-red-400 border border-red-700/30",
  sent:               "bg-hover-overlay text-text-primary border border-border",
  ready_for_approval: "bg-hover-overlay text-text-primary border border-border",
  needs_review:       "bg-border text-text-secondary border border-border",
};

const CERT_STATUS_STYLES: Record<CertificateStatus, string> = {
  draft:    "bg-hover-overlay text-text-secondary border border-border-subtle",
  sent:     "bg-hover-overlay text-text-primary border border-border",
  expired:  "bg-red-900/30 text-red-400 border border-red-700/30",
  outdated: "bg-danger/[0.06] text-danger border border-danger/[0.2]",
};

function StatusBadge({ status, table }: { status: string; table: "request" | "cert" }) {
  const styles = table === "request" ? REQUEST_STATUS_STYLES : CERT_STATUS_STYLES;
  const label =
    table === "request"
      ? {
          pending:            "Pending",
          approved:           "Approved",
          rejected:           "Rejected",
          sent:               "Sent",
          ready_for_approval: "Ready to Send",
          needs_review:       "Needs Review",
        }
      : { draft: "Draft", sent: "Sent", expired: "Expired", outdated: "Outdated" };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
        styles[status as keyof typeof styles] ?? ""
      }`}
    >
      {label[status as keyof typeof label] ?? status}
    </span>
  );
}

// ── Inner content (uses useSearchParams — needs Suspense wrapper) ─────────────

function CertificatesContent() {
  const searchParams = useSearchParams();
  const tab    = searchParams.get("tab") ?? "requests";
  const crumbs = decodeCrumbs(searchParams.get("trail"));

  const { coiRequests: requests, certificates: certs, userId, loading, backgroundRefreshing } = useHollisData();

  // Approval queue
  const readyItems = requests.filter((r) => r.status === "ready_for_approval");
  const needsReviewItems = requests.filter((r) => r.status === "needs_review");
  const hasQueue = readyItems.length > 0 || needsReviewItems.length > 0;

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const staleCount = certs.filter(
    (c) => c.status === "expired" || c.status === "outdated"
  ).length;

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center">
        <Loader2 size={22} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] border-b border-border shrink-0">
        <Breadcrumb crumbs={crumbs} current="Certificates" />
        <div className="flex items-center gap-3">
          {backgroundRefreshing && (
            <span className="w-1.5 h-1.5 rounded-full bg-text-primary/40 animate-pulse shrink-0" title="Syncing…" />
          )}
          <Link
            href={userId ? `/certificates/request/${userId}` : "#"}
            target="_blank"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md border border-border text-[13px] text-text-secondary hover:text-text-primary hover:border-border transition-colors"
          >
            Copy Portal Link
          </Link>
          <Link
            href="/certificates/new"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity shadow-[0_0_20px_rgba(0,212,170,0.35),0_0_6px_rgba(0,212,170,0.2)]"
          >
            <Plus size={13} />
            New COI
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-0 px-10 py-7 border-b border-border shrink-0">
        <div className="pr-10">
          <div className="text-[28px] font-bold text-text-primary leading-none">
            {certs.length}
          </div>
          <div className="text-[12px] text-text-secondary mt-1.5">Issued</div>
        </div>
        <div className="px-10 border-l border-border">
          <div className="text-[28px] font-bold text-text-secondary leading-none">{pendingCount}</div>
          <div className="text-[12px] text-text-secondary mt-1.5">Pending Requests</div>
        </div>
        {readyItems.length > 0 && (
          <div className="px-10 border-l border-border">
            <div className="text-[28px] font-bold text-text-primary leading-none">
              {readyItems.length}
            </div>
            <div className="text-[12px] text-text-secondary mt-1.5">Ready to Send</div>
          </div>
        )}
        <div className="px-10 border-l border-border">
          <div className="text-[28px] font-bold text-text-secondary leading-none">
            {certs.filter((c) => c.has_gap).length}
          </div>
          <div className="text-[12px] text-text-secondary mt-1.5">Coverage Gaps</div>
        </div>
        {staleCount > 0 && (
          <div className="px-10 border-l border-border">
            <div className="text-[28px] font-bold text-danger leading-none">{staleCount}</div>
            <div className="text-[12px] text-text-secondary mt-1.5">Stale / Expired</div>
          </div>
        )}
      </div>

      {/* Stale COI banner */}
      {staleCount > 0 && (
        <div className="flex items-center gap-3 px-10 py-3 bg-danger/[0.04] border-b border-danger/[0.15] shrink-0">
          <AlertTriangle size={14} className="text-danger shrink-0" />
          <span className="text-[13px] text-danger">
            {staleCount} certificate{staleCount !== 1 ? "s" : ""}{" "}
            {staleCount !== 1 ? "are" : "is"} expired or outdated and may need reissuing.
          </span>
          <button className="ml-auto text-[12px] text-danger hover:text-danger underline">
            View
          </button>
        </div>
      )}

      {/* ── Approval Queue ──────────────────────────────────────────────────── */}
      {hasQueue ? (
        <div className="shrink-0 border-b border-border bg-background">

          {/* Ready to Send */}
          {readyItems.length > 0 && (
            <div className="px-10 pt-6 pb-4">
              <div className="flex items-center gap-2.5 mb-4">
                <Send size={14} className="text-text-primary" />
                <h2 className="text-[13px] font-semibold text-text-primary">Ready to Send</h2>
                <span className="text-[11px] font-semibold text-text-primary bg-hover-overlay border border-border rounded-full px-1.5 py-0.5">
                  {readyItems.length}
                </span>
              </div>
              <div className="space-y-2">
                {readyItems.map((req) => (
                  <ReadyCard key={req.id} req={req} />
                ))}
              </div>
            </div>
          )}

          {/* Needs Review */}
          {needsReviewItems.length > 0 && (
            <div
              className={`px-10 pb-6 ${
                readyItems.length > 0 ? "pt-2 border-t border-border" : "pt-6"
              }`}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <AlertTriangle size={14} className="text-text-secondary" />
                <h2 className="text-[13px] font-semibold text-text-primary">Needs Review</h2>
                <span className="text-[11px] font-semibold text-text-secondary bg-border border border-border rounded-full px-1.5 py-0.5">
                  {needsReviewItems.length}
                </span>
              </div>
              <div className="space-y-2">
                {needsReviewItems.map((req) => (
                  <NeedsReviewCard key={req.id} req={req} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-10 py-3.5 border-b border-border shrink-0 bg-background">
          <p className="text-[13px] text-text-tertiary">
            All caught up — no pending COI requests.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-10 py-3 border-b border-border shrink-0">
        {[
          { key: "requests",     label: "Requests",           count: pendingCount },
          { key: "certificates", label: "Issued COIs",        count: certs.length },
          { key: "sequences",    label: "Follow-Up Sequences", count: 0           },
        ].map(({ key, label, count }) => (
          <Link
            key={key}
            href={`/certificates?tab=${key}`}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              tab === key
                ? "bg-hover-overlay text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]"
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  tab === key ? "bg-text-primary/20 text-text-primary" : "text-text-tertiary"
                }`}
              >
                {count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Requests tab ── */}
        {tab === "requests" &&
          (requests.filter((r) => r.status === "pending").length === 0 ? (
            <EmptyState
              icon={<Clock size={24} className="text-text-secondary" />}
              title="No COI requests yet"
              description="Share your portal link with clients to receive requests. Go to Certificates and copy your portal link."
            />
          ) : (
            <div className="divide-y divide-border">
              {requests
                .filter((r) => r.status === "pending")
                .map((req) => (
                  <RequestRow key={req.id} req={req} />
                ))}
            </div>
          ))}

        {/* ── Certificates tab ── */}
        {tab === "certificates" &&
          (certs.length === 0 ? (
            <EmptyState
              icon={<FileText size={24} className="text-text-secondary" />}
              title="No certificates issued yet"
              description="Generate your first COI from an incoming request or click New COI."
            >
              <Link
                href="/certificates/new"
                className="h-9 px-5 flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity"
              >
                <Plus size={14} />
                New COI
              </Link>
            </EmptyState>
          ) : (
            <CertsTable certs={certs as CertWithSequences[]} />
          ))}

        {/* ── Follow-Up Sequences tab ── */}
        {tab === "sequences" && <SequencesTab />}

      </div>
    </div>
  );
}

// ── Page shell with Suspense boundary ────────────────────────────────────────

export default function CertificatesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full bg-background items-center justify-center">
          <Loader2 size={22} className="animate-spin text-text-tertiary" />
        </div>
      }
    >
      <CertificatesContent />
    </Suspense>
  );
}

// ── Ready to Send card ────────────────────────────────────────────────────────

function ReadyCard({ req }: { req: COIRequest }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface border border-border rounded-xl px-5 py-4 hover:border-border transition-colors">
      <div className="flex items-center gap-4 min-w-0">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-hover-overlay border border-border flex items-center justify-center shrink-0">
          <span className="text-[12px] font-bold text-text-primary">
            {req.insured_name.charAt(0).toUpperCase()}
          </span>
        </div>
        {/* Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[14px] font-semibold text-text-primary truncate">
              {req.insured_name}
            </span>
            {req.auto_generated && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-hover-overlay text-text-primary border border-border shrink-0">
                <CheckCircle size={9} />
                Coverage ✓
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[12px] text-text-tertiary flex-wrap">
            <span>Holder: {req.holder_name}</span>
            {req.holder_city && (
              <span>
                {[req.holder_city, req.holder_state].filter(Boolean).join(", ")}
              </span>
            )}
            {req.coverage_types.length > 0 && (
              <span className="flex items-center gap-1">
                {req.coverage_types.map((t) => (
                  <CovTag
                    key={t}
                    label={COVERAGE_TYPE_LABELS[t]?.split(" ")[0] ?? t}
                  />
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <ApproveButton requestId={req.id} />
        {req.certificate_id && (
          <Link
            href={`/certificates/${req.certificate_id}`}
            className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-border text-[12px] text-text-secondary hover:text-text-primary transition-colors"
          >
            <Eye size={12} />
            Review
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Needs Review card ─────────────────────────────────────────────────────────

function NeedsReviewCard({ req }: { req: COIRequest }) {
  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-border border border-border flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[12px] font-bold text-text-secondary">
              {req.insured_name.charAt(0).toUpperCase()}
            </span>
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[14px] font-semibold text-text-primary truncate">
                {req.insured_name}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-text-tertiary mb-2.5 flex-wrap">
              <span>Holder: {req.holder_name}</span>
              {req.coverage_types.length > 0 && (
                <span className="flex items-center gap-1">
                  {req.coverage_types.map((t) => (
                    <CovTag
                      key={t}
                      label={COVERAGE_TYPE_LABELS[t]?.split(" ")[0] ?? t}
                    />
                  ))}
                </span>
              )}
            </div>
            {/* Coverage gap warning callout */}
            {req.coverage_check_notes && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-border border border-border">
                <AlertTriangle size={12} className="text-text-secondary shrink-0 mt-0.5" />
                <p className="text-[12px] text-text-secondary leading-relaxed">
                  {req.coverage_check_notes}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/certificates/new?request=${req.id}`}
            className="h-8 px-3.5 flex items-center gap-1.5 rounded-md bg-surface border border-border text-[12px] text-text-secondary hover:text-text-primary hover:border-[#3e3e4a] transition-colors"
          >
            Generate COI
          </Link>
          <RejectButton requestId={req.id} />
        </div>
      </div>
    </div>
  );
}

// ── Request row (existing pending requests) ───────────────────────────────────

function RequestRow({ req }: { req: COIRequest }) {
  const isActionable = req.status === "pending";

  return (
    <div className={`px-10 py-5 hover:bg-white/[0.01] transition-colors ${!isActionable ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={req.status} table="request" />
            <span className="text-[11px] text-text-tertiary">
              {new Date(req.created_at).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Insured */}
            <div>
              <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-1">Insured</div>
              <div className="text-[14px] font-medium text-text-primary">{req.insured_name}</div>
              <div className="text-[12px] text-text-secondary mt-0.5">Requested by {req.requester_name}</div>
            </div>

            {/* Holder */}
            <div>
              <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-1">Certificate Holder</div>
              <div className="text-[13px] text-text-primary">{req.holder_name}</div>
              {req.holder_city && (
                <div className="text-[12px] text-text-tertiary">
                  {[req.holder_city, req.holder_state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>

            {/* Coverage required */}
            <div>
              <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-1">Coverage Required</div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {req.coverage_types.map((t) => (
                  <CovTag key={t} label={COVERAGE_TYPE_LABELS[t]?.split(" ")[0] ?? t} />
                ))}
              </div>
              <div className="space-y-0.5 text-[11px] text-text-secondary">
                {req.required_gl_per_occurrence && <div>GL Occ: {formatLimit(req.required_gl_per_occurrence)}</div>}
                {req.required_gl_aggregate && <div>GL Agg: {formatLimit(req.required_gl_aggregate)}</div>}
                {req.required_auto_combined_single && <div>Auto CSL: {formatLimit(req.required_auto_combined_single)}</div>}
                {req.required_umbrella_each_occurrence && <div>Umb: {formatLimit(req.required_umbrella_each_occurrence)}</div>}
              </div>
            </div>
          </div>

          {/* Coverage gap / check result */}
          {req.coverage_check_result && !req.coverage_check_result.passed && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-red-950/30 border border-red-800/30">
              <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-[12px] font-medium text-red-400 mb-1">Coverage gaps detected</div>
                <ul className="space-y-0.5">
                  {req.coverage_check_result.gaps.map((g: string, i: number) => (
                    <li key={i} className="text-[11px] text-red-300">• {g}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {req.project_description && (
            <div className="mt-2 text-[12px] text-text-tertiary italic">
              &ldquo;{req.project_description}&rdquo;
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isActionable && (
            <>
              <Link
                href={`/certificates/new?request=${req.id}`}
                className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity"
              >
                <CheckCircle size={13} />
                Generate COI
              </Link>
              <RejectButton requestId={req.id} />
            </>
          )}
          {req.certificate_id && (
            <Link
              href={`/certificates/${req.certificate_id}`}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-border text-[12px] text-text-secondary hover:text-text-primary transition-colors"
            >
              View COI →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function CovTag({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-hover-overlay text-text-secondary border border-border-subtle">
      {label}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mb-4">
        {icon}
      </div>
      <div className="text-[16px] font-semibold text-text-primary mb-1">{title}</div>
      <div className="text-[13px] text-text-secondary mb-6 max-w-xs">{description}</div>
      {children}
    </div>
  );
}
