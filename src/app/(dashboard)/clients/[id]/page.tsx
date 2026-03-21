import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { CommunicationTimeline } from "@/components/clients/CommunicationTimeline";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function InfoBlock({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[14px] text-[#FAFAFA]">{value ?? "—"}</div>
    </div>
  );
}

function SectionHeader({ label, href, linkLabel }: { label: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-widest">{label}</div>
      {href && linkLabel && (
        <Link href={href} className="text-[12px] text-[#6b6b6b] hover:text-[#FAFAFA] transition-colors">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function daysUntil(dateStr: string): number {
  const exp = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
}

function urgencyColor(days: number): string {
  if (days <= 30) return "#FF4444";
  if (days <= 60) return "#F59E0B";
  return "#3A3A3A";
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: "#00D97E",
  at_risk: "#F59E0B",
  critical: "#FF4444",
  stalled: "#3A3A3A",
};

const STAGE_LABEL: Record<string, string> = {
  pending:             "Not started",
  email_90_sent:       "90d email sent",
  email_60_sent:       "60d email sent",
  sms_30_sent:         "30d SMS sent",
  script_14_ready:     "Script ready",
  questionnaire_sent:  "Questionnaire sent",
  submission_sent:     "Submitted",
  recommendation_sent: "Recommendation sent",
  final_notice_sent:   "Final notice sent",
  confirmed:           "Confirmed",
  complete:            "Complete",
  lapsed:              "Lapsed",
};

const COI_STATUS_COLORS: Record<string, string> = {
  pending:             "text-[#8a8a8a] bg-white/[0.04] border-[#1C1C1C]",
  ready_for_approval:  "text-[#FAFAFA] bg-[#FAFAFA]/[0.06] border-[#2a2a2a]",
  needs_review:        "text-[#F59E0B] bg-amber-950/20 border-amber-800/20",
};

const CERT_STATUS_COLORS: Record<string, string> = {
  sent:     "text-[#FAFAFA] bg-[#FAFAFA]/[0.06] border-[#1C1C1C]",
  draft:    "text-[#8a8a8a] bg-white/[0.04] border-[#1C1C1C]",
  expired:  "text-red-400 bg-red-950/20 border-red-800/20",
  outdated: "text-[#9e9e9e] bg-[#1C1C1C] border-[#1C1C1C]",
};

const DOC_STATUS_COLORS: Record<string, string> = {
  pending: "text-[#8a8a8a] bg-white/[0.04] border-[#1C1C1C]",
  active:  "text-[#FAFAFA] bg-[#FAFAFA]/[0.06] border-[#2a2a2a]",
};

const VERDICT_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  all_clear:       { label: "All Clear",       color: "#00D97E", bg: "rgba(0,217,126,0.08)", border: "rgba(0,217,126,0.2)" },
  issues_found:    { label: "Issues Found",    color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
  critical_issues: { label: "Critical Issues", color: "#FF4444", bg: "rgba(255,68,68,0.08)",  border: "rgba(255,68,68,0.2)"  },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !client) notFound();

  const nameFilter = `%${client.name}%`;
  const emailFilter = client.email ?? "";

  // All module data fetched in parallel
  const [
    activePoliciesRes,
    openCoiRes,
    activeDocChaseRes,
    policyChecksRes,
    certsRes,
  ] = await Promise.all([
    // Active policies linked by client_name
    supabase
      .from("policies")
      .select("id, policy_name, expiration_date, campaign_stage, health_label, carrier, premium")
      .eq("user_id", user.id)
      .eq("status", "active")
      .ilike("client_name", nameFilter)
      .order("expiration_date", { ascending: true }),

    // Open COI requests (exclude terminal: sent, rejected)
    supabase
      .from("coi_requests")
      .select("id, holder_name, status, created_at, certificate_id")
      .eq("user_id", user.id)
      .ilike("insured_name", nameFilter)
      .not("status", "in", '("sent","rejected")')
      .order("created_at", { ascending: false })
      .limit(10),

    // Active/pending doc chase requests
    supabase
      .from("doc_chase_requests")
      .select("id, document_type, status, escalation_level, client_name")
      .eq("user_id", user.id)
      .in("status", ["pending", "active"])
      .or(
        emailFilter
          ? `client_name.ilike.${nameFilter},client_email.eq.${emailFilter}`
          : `client_name.ilike.${nameFilter}`,
      )
      .order("created_at", { ascending: false })
      .limit(10),

    // Policy checks via FK (client_id)
    supabase
      .from("policy_checks")
      .select("id, summary_verdict, overall_confidence, document_count, created_at, policy_check_flags(id, severity, resolution_status)")
      .eq("user_id", user.id)
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(5),

    // Certificates issued
    supabase
      .from("certificates")
      .select("id, certificate_number, holder_name, status, expiration_date")
      .eq("user_id", user.id)
      .ilike("insured_name", nameFilter)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const activePolicies = activePoliciesRes.data ?? [];
  const openCois       = openCoiRes.data       ?? [];
  const activeDocChase = activeDocChaseRes.data ?? [];
  const policyChecks   = (policyChecksRes.data  ?? []) as Array<{
    id: string;
    summary_verdict: string | null;
    overall_confidence: string | null;
    document_count: number;
    created_at: string;
    policy_check_flags: Array<{ id: string; severity: string; resolution_status: string }>;
  }>;
  const certificates   = certsRes.data          ?? [];

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C] text-[#FAFAFA] overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Link
          href="/clients"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
        >
          <ArrowLeft size={13} />
          Clients
        </Link>
        <ChevronRight size={12} className="text-[#6b6b6b]" />
        <span className="text-[13px] text-[#FAFAFA] truncate">{client.name}</span>
      </div>

      <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-8">

        {/* ── Identity card ───────────────────────────────────────────────── */}
        <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shrink-0">
              <span className="text-[22px] font-bold text-[#FAFAFA]">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-[#FAFAFA] leading-tight">{client.name}</h1>
              {client.industry && (
                <p className="text-[14px] text-[#8a8a8a] mt-0.5 capitalize">
                  {client.industry.replace(/_/g, " ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 pt-5 border-t border-[#1C1C1C]">
            <InfoBlock label="Email"         value={client.email} />
            <InfoBlock label="Phone"         value={client.phone} />
            <InfoBlock label="State"         value={client.primary_state} />
            <InfoBlock label="Business Type" value={client.business_type?.replace(/_/g, " ")} />
            <InfoBlock label="Industry"      value={client.industry?.replace(/_/g, " ")} />
            <InfoBlock label="Employees"     value={client.num_employees} />
          </div>

          {(client.annual_revenue || client.num_locations) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5 pt-5 mt-5 border-t border-[#1C1C1C]">
              {client.annual_revenue && (
                <InfoBlock
                  label="Annual Revenue"
                  value={`$${Number(client.annual_revenue).toLocaleString()}`}
                />
              )}
              {client.num_locations && (
                <InfoBlock label="Locations" value={client.num_locations} />
              )}
              {client.owns_vehicles !== undefined && client.owns_vehicles !== null && (
                <InfoBlock label="Owns Vehicles" value={client.owns_vehicles ? "Yes" : "No"} />
              )}
            </div>
          )}

          {client.notes && (
            <div className="pt-5 mt-5 border-t border-[#1C1C1C]">
              <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-2">Notes</div>
              <p className="text-[14px] text-[#8a8a8a] leading-relaxed">{client.notes}</p>
            </div>
          )}
        </div>

        {/* ── Active Policies ─────────────────────────────────────────────── */}
        <div>
          <SectionHeader label="Active Policies" href="/renewals" linkLabel="All renewals" />

          {activePolicies.length === 0 ? (
            <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-8 text-center">
              <RefreshCcw size={20} className="text-[#6b6b6b] mx-auto mb-2" />
              <p className="text-[13px] text-[#6b6b6b]">No active policies for this client</p>
              <Link
                href="/renewals/upload"
                className="inline-block mt-3 text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
              >
                Add a policy →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activePolicies.map((policy) => {
                const days   = daysUntil(policy.expiration_date);
                const dColor = urgencyColor(days);
                const hColor = HEALTH_COLOR[policy.health_label ?? ""] ?? "#3A3A3A";
                const stageLabel = STAGE_LABEL[policy.campaign_stage ?? ""] ?? policy.campaign_stage ?? "—";
                const expStr = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day:   "numeric",
                  year:  "numeric",
                });
                return (
                  <Link
                    key={policy.id}
                    href={`/renewals/${policy.id}`}
                    className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#111111] border border-[#1C1C1C] hover:border-[#2a2a2a] transition-colors group"
                  >
                    {/* Health dot */}
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: hColor, boxShadow: `0 0 6px ${hColor}66` }}
                    />

                    {/* Policy name + stage */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#FAFAFA] truncate">{policy.policy_name}</div>
                      <div className="text-[12px] text-[#6b6b6b] mt-0.5 truncate">
                        {stageLabel}
                        {policy.carrier ? <> · {policy.carrier}</> : null}
                      </div>
                    </div>

                    {/* Expiry date */}
                    <div className="shrink-0 text-right hidden sm:block">
                      <div
                        className="text-[11px]"
                        style={{ fontFamily: "var(--font-mono)", color: "#444" }}
                      >
                        {expStr}
                      </div>
                    </div>

                    {/* Days remaining */}
                    <div className="shrink-0 text-right" style={{ width: 44 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize:   18,
                          fontWeight: 700,
                          lineHeight: 1,
                          color:      dColor,
                        }}
                      >
                        {Math.abs(days)}
                      </div>
                      <div
                        style={{
                          fontFamily:    "var(--font-mono)",
                          fontSize:      9,
                          color:         "#2E2E2E",
                          marginTop:     2,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {days < 0 ? "PAST" : "DAYS"}
                      </div>
                    </div>

                    <span className="text-[#6b6b6b] group-hover:text-[#FAFAFA] transition-colors shrink-0 text-[13px]">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Open COI Requests ───────────────────────────────────────────── */}
        {openCois.length > 0 && (
          <div>
            <SectionHeader label="COI Requests" href="/certificates" linkLabel="View all" />
            <div className="space-y-2">
              {openCois.map((req) => {
                const statusStyle = COI_STATUS_COLORS[req.status] ?? COI_STATUS_COLORS.pending;
                const statusLabel = req.status.replace(/_/g, " ");
                const createdStr  = new Date(req.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day:   "numeric",
                });
                const href = req.certificate_id
                  ? `/certificates/${req.certificate_id}`
                  : "/certificates";
                return (
                  <Link
                    key={req.id}
                    href={href}
                    className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#111111] border border-[#1C1C1C] hover:border-[#2a2a2a] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#FAFAFA] truncate">
                        {req.holder_name ?? "Unknown holder"}
                      </div>
                      <div className="text-[12px] text-[#6b6b6b] mt-0.5">Requested {createdStr}</div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize shrink-0 ${statusStyle}`}
                    >
                      {statusLabel}
                    </span>
                    <span className="text-[#6b6b6b] group-hover:text-[#FAFAFA] transition-colors shrink-0 text-[13px]">→</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Active Doc Chase ─────────────────────────────────────────────── */}
        {activeDocChase.length > 0 && (
          <div>
            <SectionHeader label="Document Requests" href="/documents" linkLabel="View all" />
            <div className="space-y-2">
              {activeDocChase.map((req) => {
                const statusStyle  = DOC_STATUS_COLORS[req.status] ?? DOC_STATUS_COLORS.pending;
                const escalLabel   = req.escalation_level === "phone_script"
                  ? "Phone script"
                  : req.escalation_level === "sms"
                  ? "SMS"
                  : "Email";
                return (
                  <Link
                    key={req.id}
                    href="/documents"
                    className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#111111] border border-[#1C1C1C] hover:border-[#2a2a2a] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#FAFAFA] truncate">{req.document_type}</div>
                      <div className="text-[12px] text-[#6b6b6b] mt-0.5">
                        Via {escalLabel}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize shrink-0 ${statusStyle}`}
                    >
                      {req.status}
                    </span>
                    <span className="text-[#6b6b6b] group-hover:text-[#FAFAFA] transition-colors shrink-0 text-[13px]">→</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Policy Checks ────────────────────────────────────────────────── */}
        {policyChecks.length > 0 && (
          <div>
            <SectionHeader label="Policy Checks" />
            <div className="space-y-2">
              {policyChecks.map((check) => {
                const verdict      = check.summary_verdict ?? "issues_found";
                const vs           = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.issues_found;
                const openFlags    = check.policy_check_flags.filter(f => f.resolution_status !== "dismissed");
                const criticalCount = openFlags.filter(f => f.severity === "critical").length;
                const dateStr      = new Date(check.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day:   "numeric",
                  year:  "numeric",
                });
                const flagSummary = openFlags.length === 0
                  ? "No open flags"
                  : `${openFlags.length} flag${openFlags.length !== 1 ? "s" : ""}${criticalCount > 0 ? ` · ${criticalCount} critical` : ""}`;
                return (
                  <Link
                    key={check.id}
                    href={`/policies/${check.id}`}
                    className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#111111] border border-[#1C1C1C] hover:border-[#2a2a2a] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            color:      vs.color,
                            background: vs.bg,
                            border:     `1px solid ${vs.border}`,
                          }}
                        >
                          {vs.label}
                        </span>
                        <span className="text-[12px] text-[#6b6b6b] truncate">{flagSummary}</span>
                      </div>
                      <div className="text-[12px] text-[#555] mt-1">
                        {dateStr} · {check.document_count ?? 0} doc{check.document_count !== 1 ? "s" : ""} analyzed
                      </div>
                    </div>
                    <span className="text-[#6b6b6b] group-hover:text-[#FAFAFA] transition-colors shrink-0 text-[13px]">→</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Certificates Issued ──────────────────────────────────────────── */}
        <div>
          <SectionHeader label="Certificates Issued" href="/certificates" linkLabel="View all" />

          {certificates.length === 0 ? (
            <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-8 text-center">
              <FileText size={20} className="text-[#6b6b6b] mx-auto mb-2" />
              <p className="text-[13px] text-[#6b6b6b]">No certificates issued for this client</p>
            </div>
          ) : (
            <div className="space-y-2">
              {certificates.map((cert) => (
                <Link
                  key={cert.id}
                  href={`/certificates/${cert.id}`}
                  className="flex items-center justify-between px-5 py-3.5 rounded-xl bg-[#111111] border border-[#1C1C1C] hover:border-[#2a2a2a] transition-colors group"
                >
                  <div>
                    <div className="text-[13px] font-medium text-[#FAFAFA]">
                      {cert.certificate_number}
                    </div>
                    <div className="text-[12px] text-[#6b6b6b] mt-0.5">
                      Holder: {cert.holder_name ?? "—"}
                      {cert.expiration_date && <> · Exp {cert.expiration_date}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                        CERT_STATUS_COLORS[cert.status] ?? CERT_STATUS_COLORS.draft
                      }`}
                    >
                      {cert.status}
                    </span>
                    <span className="text-[#6b6b6b] group-hover:text-[#FAFAFA] transition-colors text-[13px]">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Communication History ────────────────────────────────────────── */}
        <div>
          <SectionHeader label="Communication History" />
          <CommunicationTimeline clientId={client.id} />
        </div>

      </div>
    </div>
  );
}
