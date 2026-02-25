import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, ChevronRight, AlertTriangle, Clock, CheckCircle, FileText } from "lucide-react";
import type { COIRequest, Certificate, COIRequestStatus, CertificateStatus } from "@/types/coi";
import { COVERAGE_TYPE_LABELS, formatLimit } from "@/types/coi";
import { RejectButton } from "./_components/RejectButton";

export const dynamic = "force-dynamic";

const REQUEST_STATUS_STYLES: Record<COIRequestStatus, string> = {
  pending:  "bg-amber-900/30 text-amber-400 border border-amber-700/30",
  approved: "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/25",
  rejected: "bg-red-900/30 text-red-400 border border-red-700/30",
  sent:     "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/25",
};

const CERT_STATUS_STYLES: Record<CertificateStatus, string> = {
  draft:    "bg-[#ffffff08] text-[#8a8b91] border border-[#ffffff10]",
  sent:     "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/25",
  expired:  "bg-red-900/30 text-red-400 border border-red-700/30",
  outdated: "bg-orange-900/30 text-orange-400 border border-orange-700/30",
};

function StatusBadge({ status, table }: { status: string; table: "request" | "cert" }) {
  const styles = table === "request"
    ? REQUEST_STATUS_STYLES
    : CERT_STATUS_STYLES;
  const label = table === "request"
    ? { pending: "Pending", approved: "Approved", rejected: "Rejected", sent: "Sent" }
    : { draft: "Draft", sent: "Sent", expired: "Expired", outdated: "Outdated" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status as keyof typeof styles] ?? ""}`}>
      {label[status as keyof typeof label] ?? status}
    </span>
  );
}

interface SearchParams {
  tab?: string;
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function CertificatesPage({ searchParams }: PageProps) {
  const { tab = "requests" } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: requestsData }, { data: certsData }] = await Promise.all([
    supabase
      .from("coi_requests")
      .select("*")
      .eq("agent_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("certificates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const requests = (requestsData ?? []) as COIRequest[];
  const certs = (certsData ?? []) as Certificate[];

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const staleCount = certs.filter(c => c.status === "expired" || c.status === "outdated").length;

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">

      {/* Header */}
      <div className="flex items-center justify-between px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <div className="flex items-center gap-2 text-[13px] text-[#8a8b91]">
          <span>Hollis</span>
          <ChevronRight size={12} />
          <span className="text-[#f5f5f7]">Certificates</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/certificates/request/${user.id}`}
            target="_blank"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md border border-[#1e1e2a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] hover:border-[#2e2e3a] transition-colors"
          >
            Copy Portal Link
          </Link>
          <Link
            href="/certificates/new"
            className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors shadow-[0_0_20px_rgba(0,212,170,0.35),0_0_6px_rgba(0,212,170,0.2)]"
          >
            <Plus size={13} />
            New COI
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-0 px-10 py-7 border-b border-[#252530] shrink-0">
        <div className="pr-10">
          <div className="text-[28px] font-bold text-[#f5f5f7] leading-none">{certs.filter(c => c.status === "sent").length}</div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Issued</div>
        </div>
        <div className="px-10 border-l border-[#1e1e2a]">
          <div className="text-[28px] font-bold text-amber-400 leading-none">{pendingCount}</div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Pending Requests</div>
        </div>
        <div className="px-10 border-l border-[#1e1e2a]">
          <div className="text-[28px] font-bold text-[#8a8b91] leading-none">{certs.filter(c => c.has_gap).length}</div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Coverage Gaps</div>
        </div>
        {staleCount > 0 && (
          <div className="px-10 border-l border-[#1e1e2a]">
            <div className="text-[28px] font-bold text-orange-400 leading-none">{staleCount}</div>
            <div className="text-[12px] text-[#8a8b91] mt-1.5">Stale / Expired</div>
          </div>
        )}
      </div>

      {/* Stale COI banner */}
      {staleCount > 0 && (
        <div className="flex items-center gap-3 px-10 py-3 bg-orange-950/30 border-b border-orange-800/30 shrink-0">
          <AlertTriangle size={14} className="text-orange-400 shrink-0" />
          <span className="text-[13px] text-orange-300">
            {staleCount} certificate{staleCount !== 1 ? "s" : ""} {staleCount !== 1 ? "are" : "is"} expired or outdated and may need reissuing.
          </span>
          <button
            onClick={undefined}
            className="ml-auto text-[12px] text-orange-400 hover:text-orange-300 underline"
          >
            View
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-10 py-3 border-b border-[#1e1e2a] shrink-0">
        {[
          { key: "requests", label: "Requests", count: pendingCount },
          { key: "certificates", label: "Issued COIs", count: certs.length },
        ].map(({ key, label, count }) => (
          <Link
            key={key}
            href={`/certificates?tab=${key}`}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              tab === key
                ? "bg-[rgba(255,255,255,0.06)] text-[#f5f5f7]"
                : "text-[#8a8b91] hover:text-[#f5f5f7] hover:bg-white/[0.03]"
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                tab === key ? "bg-[#00d4aa]/20 text-[#00d4aa]" : "text-[#505057]"
              }`}>
                {count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Requests tab ── */}
        {tab === "requests" && (
          requests.length === 0 ? (
            <EmptyState
              icon={<Clock size={24} className="text-[#8a8b91]" />}
              title="No COI requests yet"
              description={`Share your portal link with clients to receive requests. Go to Certificates and copy your portal link.`}
            />
          ) : (
            <div className="divide-y divide-[#1e1e2a]">
              {requests.map(req => (
                <RequestRow key={req.id} req={req} userId={user.id} />
              ))}
            </div>
          )
        )}

        {/* ── Certificates tab ── */}
        {tab === "certificates" && (
          certs.length === 0 ? (
            <EmptyState
              icon={<FileText size={24} className="text-[#8a8b91]" />}
              title="No certificates issued yet"
              description="Generate your first COI from an incoming request or click New COI."
            >
              <Link
                href="/certificates/new"
                className="h-9 px-5 flex items-center gap-2 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
              >
                <Plus size={14} />
                New COI
              </Link>
            </EmptyState>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-[#0d0d12] z-10">
                <tr className="border-b border-[#1e1e2a]">
                  <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Certificate</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Holder</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Coverage</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Issued</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Expires</th>
                  <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {certs.map(cert => (
                  <tr
                    key={cert.id}
                    className={`group border-b border-[#1e1e2a]/60 hover:bg-white/[0.02] transition-colors ${
                      cert.has_gap ? "bg-red-950/[0.06]" : ""
                    }`}
                  >
                    <td className="px-10 py-3">
                      <Link href={`/certificates/${cert.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-[#505057]">{cert.certificate_number}</span>
                          {cert.has_gap && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                              <AlertTriangle size={10} /> Gap
                            </span>
                          )}
                        </div>
                        <div className="text-[14px] font-medium text-[#f5f5f7] group-hover:text-[#00d4aa] transition-colors mt-0.5">
                          {cert.insured_name}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-[#c5c5cb]">{cert.holder_name}</div>
                      {cert.holder_city && (
                        <div className="text-[11px] text-[#505057]">
                          {[cert.holder_city, cert.holder_state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cert.coverage_snapshot.gl?.enabled && <CovTag label="GL" />}
                        {cert.coverage_snapshot.auto?.enabled && <CovTag label="Auto" />}
                        {cert.coverage_snapshot.umbrella?.enabled && <CovTag label="Umb" />}
                        {cert.coverage_snapshot.wc?.enabled && <CovTag label="WC" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#8a8b91] tabular-nums">
                      {new Date(cert.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#8a8b91] tabular-nums">
                      {cert.expiration_date
                        ? new Date(cert.expiration_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-10 py-3">
                      <StatusBadge status={cert.status} table="cert" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

// ── Request row (expanded card) ───────────────────────────────

function RequestRow({ req, userId }: { req: COIRequest; userId: string }) {
  const isActionable = req.status === "pending";

  return (
    <div className={`px-10 py-5 hover:bg-white/[0.01] transition-colors ${!isActionable ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={req.status} table="request" />
            <span className="text-[11px] text-[#505057]">
              {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Insured */}
            <div>
              <div className="text-[11px] font-medium text-[#505057] uppercase tracking-wider mb-1">Insured</div>
              <div className="text-[14px] font-medium text-[#f5f5f7]">{req.insured_name}</div>
              <div className="text-[12px] text-[#8a8b91] mt-0.5">Requested by {req.requester_name}</div>
            </div>

            {/* Holder */}
            <div>
              <div className="text-[11px] font-medium text-[#505057] uppercase tracking-wider mb-1">Certificate Holder</div>
              <div className="text-[13px] text-[#c5c5cb]">{req.holder_name}</div>
              {req.holder_city && (
                <div className="text-[12px] text-[#505057]">
                  {[req.holder_city, req.holder_state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>

            {/* Coverage required */}
            <div>
              <div className="text-[11px] font-medium text-[#505057] uppercase tracking-wider mb-1">Coverage Required</div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {req.coverage_types.map(t => (
                  <CovTag key={t} label={COVERAGE_TYPE_LABELS[t]?.split(" ")[0] ?? t} />
                ))}
              </div>
              <div className="space-y-0.5 text-[11px] text-[#8a8b91]">
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
                  {req.coverage_check_result.gaps.map((g, i) => (
                    <li key={i} className="text-[11px] text-red-300">• {g}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {req.project_description && (
            <div className="mt-2 text-[12px] text-[#505057] italic">"{req.project_description}"</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isActionable && (
            <>
              <Link
                href={`/certificates/new?request=${req.id}`}
                className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
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
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
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
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#ffffff06] text-[#8a8b91] border border-[#ffffff0f]">
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
      <div className="w-14 h-14 rounded-full bg-[#1a1a24] flex items-center justify-center mb-4">
        {icon}
      </div>
      <div className="text-[16px] font-semibold text-[#f5f5f7] mb-1">{title}</div>
      <div className="text-[13px] text-[#8a8b91] mb-6 max-w-xs">{description}</div>
      {children}
    </div>
  );
}
