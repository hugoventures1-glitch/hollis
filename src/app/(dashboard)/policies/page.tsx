import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata = { title: "Policy Checks — Hollis" };
import Link from "next/link";
import { Plus, ChevronRight, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import {
  SEVERITY_BADGE_STYLES,
  VERDICT_STYLES,
  type SummaryVerdict,
  type PolicyCheckStatus,
} from "@/types/policies";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: SummaryVerdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-hover-overlay text-text-secondary border border-border-subtle">
        Pending
      </span>
    );
  }
  const s = VERDICT_STYLES[verdict];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function StatusBadge({ status }: { status: PolicyCheckStatus }) {
  const styles: Record<PolicyCheckStatus, string> = {
    pending:    "bg-hover-overlay text-text-secondary border border-border-subtle",
    processing: "bg-blue-900/20 text-blue-400 border border-blue-800/30",
    complete:   "",  // shown as verdict badge instead
    failed:     "bg-red-900/30 text-red-400 border border-red-700/30",
  };
  if (status === "complete") return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${styles[status]}`}>
      {status === "processing" ? "Analyzing…" : status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default async function PoliciesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: checks } = await supabase
    .from("policy_checks")
    .select("*, clients(id, name), policy_check_flags(severity, annotation_status)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = checks ?? [];

  // Derive counts
  const totalChecks = rows.length;
  const criticalChecks = rows.filter(c =>
    Array.isArray(c.policy_check_flags) &&
    c.policy_check_flags.some((f: { severity: string }) => f.severity === "critical")
  ).length;
  const pendingChecks = rows.filter(c =>
    c.overall_status === "pending" || c.overall_status === "processing"
  ).length;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] border-b border-border shrink-0">
        <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>Policy Audit</span>
        <Link
          href="/policies/new"
          className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity"
        >
          <Plus size={13} />
          New Check
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-10 py-8">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl bg-surface border border-border p-5">
              <div className="text-[28px] font-bold text-text-primary tabular-nums">{totalChecks}</div>
              <div className="text-[12px] text-text-tertiary mt-1">Total Checks</div>
            </div>
            <div className="rounded-xl bg-surface border border-border p-5">
              <div className={`text-[28px] font-bold tabular-nums ${criticalChecks > 0 ? "text-red-400" : "text-text-primary"}`}>
                {criticalChecks}
              </div>
              <div className="text-[12px] text-text-tertiary mt-1">With Critical Issues</div>
            </div>
            <div className="rounded-xl bg-surface border border-border p-5">
              <div className={`text-[28px] font-bold tabular-nums ${pendingChecks > 0 ? "text-text-secondary" : "text-text-primary"}`}>
                {pendingChecks}
              </div>
              <div className="text-[12px] text-text-tertiary mt-1">In Progress</div>
            </div>
          </div>

          {/* Table */}
          {rows.length === 0 ? (

            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-hover-overlay border border-border flex items-center justify-center mb-4">
                <ShieldCheck size={24} className="text-text-primary" />
              </div>
              <div className="text-[16px] font-semibold text-text-primary mb-1">No policy checks yet</div>
              <div className="text-[13px] text-text-secondary mb-6 max-w-xs">
                Upload a policy PDF to check for coverage gaps, E&amp;O risks, and discrepancies.
              </div>
              <Link
                href="/policies/new"
                className="h-9 px-5 flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity"
              >
                <Plus size={13} />
                Run your first check
              </Link>
            </div>

          ) : (

            <div className="rounded-xl border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-4 px-5 py-2.5 bg-background border-b border-border">
                <div className="col-span-3 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Client</div>
                <div className="col-span-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Verdict</div>
                <div className="col-span-3 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Flags (C / W / A)</div>
                <div className="col-span-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Docs</div>
                <div className="col-span-2 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Checked</div>
              </div>

              {/* Table rows */}
              {rows.map(check => {
                const flags = (check.policy_check_flags ?? []) as Array<{ severity: string; annotation_status: string | null }>;
                const critical = flags.filter(f => f.severity === "critical").length;
                const warning  = flags.filter(f => f.severity === "warning").length;
                const advisory = flags.filter(f => f.severity === "advisory").length;
                const unannotated = flags.filter(f => !f.annotation_status).length;
                const clientName = (check.clients as { name: string } | null)?.name ?? "Ad-hoc Check";

                return (
                  <Link
                    key={check.id}
                    href={`/policies/${check.id}`}
                    className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-border/60 last:border-b-0 hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Client */}
                    <div className="col-span-3 flex flex-col justify-center">
                      <div className="text-[13px] font-medium text-text-primary group-hover:text-text-primary transition-colors truncate">
                        {clientName}
                      </div>
                      {check.client_industry && (
                        <div className="text-[11px] text-text-tertiary mt-0.5 truncate">{check.client_industry}</div>
                      )}
                    </div>

                    {/* Verdict */}
                    <div className="col-span-2 flex items-center">
                      {check.overall_status === "complete"
                        ? <VerdictBadge verdict={check.summary_verdict as SummaryVerdict | null} />
                        : <StatusBadge status={check.overall_status as PolicyCheckStatus} />
                      }
                    </div>

                    {/* Flag counts */}
                    <div className="col-span-3 flex items-center gap-2">
                      {check.overall_status === "complete" ? (
                        <>
                          <span className={`text-[12px] font-medium tabular-nums ${critical > 0 ? SEVERITY_BADGE_STYLES.critical.split(" ").slice(1).join(" ") : "text-text-tertiary"}`}>
                            {critical}C
                          </span>
                          <span className="text-border">/</span>
                          <span className={`text-[12px] font-medium tabular-nums ${warning > 0 ? SEVERITY_BADGE_STYLES.warning.split(" ").slice(1).join(" ") : "text-text-tertiary"}`}>
                            {warning}W
                          </span>
                          <span className="text-border">/</span>
                          <span className={`text-[12px] font-medium tabular-nums ${advisory > 0 ? "text-blue-400" : "text-text-tertiary"}`}>
                            {advisory}A
                          </span>
                          {unannotated > 0 && (
                            <span className="ml-2 flex items-center gap-1 text-[11px] text-text-secondary">
                              <Clock size={10} />
                              {unannotated} pending
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[12px] text-text-tertiary">—</span>
                      )}
                    </div>

                    {/* Document count */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-[13px] text-text-secondary tabular-nums">
                        {check.document_count} {check.document_count === 1 ? "doc" : "docs"}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-[12px] text-text-tertiary tabular-nums">
                        {new Date(check.created_at).toLocaleDateString("en-AU", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

          )}

          {/* E&O notice */}
          {rows.length > 0 && (
            <div className="flex items-center gap-2 mt-6 text-[11px] text-text-tertiary">
              <AlertTriangle size={11} />
              All flag annotations are logged with timestamp for E&amp;O documentation.
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
