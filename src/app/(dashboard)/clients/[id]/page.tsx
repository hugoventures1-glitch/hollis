import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RefreshCcw, CheckCircle2, Circle } from "lucide-react";
import { QuickActions } from "./QuickActions";
import { ClientAIPanel } from "./ClientAIPanel";
import { ClientEditDrawer } from "./ClientEditDrawer";
import { Breadcrumb } from "@/components/nav/Breadcrumb";
import { decodeCrumbs, buildTrailParam } from "@/lib/trail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trail?: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function InfoBlock({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[14px] text-[#FAFAFA]">{value ?? "—"}</div>
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
  return "#FAFAFA";
}

const HEALTH_COLOR: Record<string, string> = {
  healthy:  "#00D97E",
  at_risk:  "#F59E0B",
  critical: "#FF4444",
  stalled:  "#3A3A3A",
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

const STAGE_ORDER = [
  "pending", "email_90_sent", "email_60_sent", "sms_30_sent",
  "script_14_ready", "questionnaire_sent", "submission_sent",
  "recommendation_sent", "final_notice_sent", "confirmed", "complete",
];

const CHECKLIST_MILESTONES: { key: string; label: string }[] = [
  { key: "email_90_sent",        label: "90-day outreach" },
  { key: "email_60_sent",        label: "60-day outreach" },
  { key: "sms_30_sent",          label: "30-day SMS" },
  { key: "questionnaire_sent",   label: "Questionnaire" },
  { key: "submission_sent",      label: "Submission" },
  { key: "recommendation_sent",  label: "Recommendation" },
  { key: "confirmed",            label: "Renewal confirmed" },
];

function isStageComplete(currentStage: string | null, targetStage: string): boolean {
  if (!currentStage) return false;
  if (currentStage === "lapsed") return false;
  const cur = STAGE_ORDER.indexOf(currentStage);
  const tgt = STAGE_ORDER.indexOf(targetStage);
  return cur >= tgt && tgt !== -1;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ClientDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const crumbs  = decodeCrumbs(sp.trail);
  const selfHref = `/clients/${id}`; // base URL for this page (no trail param)

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !client) notFound();

  const nameFilter  = `%${client.name}%`;
  const emailFilter = client.email ?? "";

  const [
    activePoliciesRes,
    openCoiRes,
    activeDocChaseRes,
  ] = await Promise.all([
    supabase
      .from("policies")
      .select("id, policy_name, expiration_date, campaign_stage, health_label, carrier, premium")
      .eq("user_id", user.id)
      .eq("status", "active")
      .ilike("client_name", nameFilter)
      .order("expiration_date", { ascending: true }),

    supabase
      .from("coi_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .ilike("insured_name", nameFilter)
      .not("status", "in", '("sent","rejected","cancelled")'),

    supabase
      .from("doc_chase_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "active"])
      .or(
        emailFilter
          ? `client_name.ilike.${nameFilter},client_email.eq.${emailFilter}`
          : `client_name.ilike.${nameFilter}`
      ),
  ]);

  const activePolicies  = activePoliciesRes.data ?? [];
  const pendingCoiCount = openCoiRes.data?.length ?? 0;
  const activeDocCount  = activeDocChaseRes.data?.length ?? 0;

  // Nearest expiring policy
  const nearestPolicy = activePolicies[0] ?? null;

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C] text-[#FAFAFA] overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Breadcrumb crumbs={crumbs} current={client.name} />
      </div>

      <div className="max-w-5xl mx-auto w-full px-6 py-8 space-y-6">

        {/* ── Top row: Renewal checklist + Identity card ─────────────────── */}
        <div className="flex gap-4 items-start">

          {/* Renewal Checklist */}
          <div className="w-56 shrink-0 rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 flex flex-col gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
              Renewal Checklist
            </div>

            {activePolicies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Circle size={16} style={{ color: "#252525" }} />
                <span className="text-[11px]" style={{ color: "#333" }}>No active renewals</span>
              </div>
            ) : (() => {
              const policy = activePolicies[0];
              const stage  = policy.campaign_stage ?? "pending";
              const isLapsed = stage === "lapsed";
              return (
                <>
                  <div className="text-[11px] truncate font-medium" style={{ color: "#555" }}>
                    {policy.policy_name}
                  </div>
                  <div className="flex flex-col gap-2 mt-1">
                    {CHECKLIST_MILESTONES.map(({ key, label }) => {
                      const done    = !isLapsed && isStageComplete(stage, key);
                      const current = !isLapsed && stage === key;
                      const isFinal = key === "confirmed";
                      return (
                        <div key={key} className="flex items-center gap-2.5">
                          <div
                            className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                            style={{
                              background: done ? (isFinal ? "#00D97E22" : "#FAFAFA11") : "transparent",
                              border: done
                                ? `1px solid ${isFinal ? "#00D97E" : "#444"}`
                                : current
                                  ? "1px solid #F59E0B"
                                  : "1px solid #252525",
                            }}
                          >
                            {done && (
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: isFinal ? "#00D97E" : "#555" }}
                              />
                            )}
                          </div>
                          <span
                            className="text-[12px] leading-tight"
                            style={{
                              color: done
                                ? isFinal ? "#00D97E" : "#AAAAAA"
                                : current
                                  ? "#F59E0B"
                                  : "#333",
                            }}
                          >
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {isLapsed && (
                    <div className="mt-1 text-[11px]" style={{ color: "#FF4444" }}>Lapsed</div>
                  )}
                  {activePolicies.length > 1 && (
                    <div className="mt-auto pt-3 text-[11px]" style={{ color: "#333", borderTop: "1px solid #1C1C1C" }}>
                      +{activePolicies.length - 1} more {activePolicies.length - 1 === 1 ? "policy" : "policies"}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Identity card */}
          <div className="flex-1 rounded-xl bg-[#111111] border border-[#1C1C1C] p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shrink-0">
              <span className="text-[22px] font-bold text-[#FAFAFA]">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-bold text-[#FAFAFA] leading-tight">{client.name}</h1>
              {client.industry && (
                <p className="text-[14px] text-[#8a8a8a] mt-0.5 capitalize">
                  {client.industry.replace(/_/g, " ")}
                </p>
              )}
            </div>
            <ClientEditDrawer client={client} />
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
          </div>{/* end identity card */}
        </div>{/* end top row flex */}

        {/* ── Status cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">

          {/* Renewal Status */}
          <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 flex flex-col gap-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
              Renewal Status
            </div>

            {nearestPolicy ? (() => {
              const days    = daysUntil(nearestPolicy.expiration_date);
              const dColor  = urgencyColor(days);
              const hColor  = HEALTH_COLOR[nearestPolicy.health_label ?? ""] ?? "#3A3A3A";
              const stage   = STAGE_LABEL[nearestPolicy.campaign_stage ?? ""] ?? nearestPolicy.campaign_stage ?? "—";
              return (
                <>
                  {/* Days number */}
                  <div className="flex items-end gap-2">
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 40,
                        fontWeight: 700,
                        lineHeight: 1,
                        color: dColor,
                      }}
                    >
                      {Math.abs(days)}
                    </span>
                    <span className="text-[12px] pb-1" style={{ color: "#333" }}>
                      {days < 0 ? "days past" : "days left"}
                    </span>
                  </div>

                  {/* Policy name + stage */}
                  <div>
                    <div className="text-[13px] font-medium truncate" style={{ color: "#FAFAFA" }}>
                      {nearestPolicy.policy_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: hColor, boxShadow: `0 0 5px ${hColor}66` }}
                      />
                      <span className="text-[12px]" style={{ color: "#555" }}>{stage}</span>
                    </div>
                  </div>

                  {/* Count + link */}
                  <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: "1px solid #1A1A1A" }}>
                    <span className="text-[12px]" style={{ color: "#333" }}>
                      {activePolicies.length} active {activePolicies.length === 1 ? "policy" : "policies"}
                    </span>
                    <Link
                      href={`/renewals/${nearestPolicy.id}?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
                      className="text-[12px] transition-colors text-[#555] hover:text-[#FAFAFA]"
                    >
                      View renewal →
                    </Link>
                  </div>
                </>
              );
            })() : (
              <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2">
                <RefreshCcw size={18} style={{ color: "#252525" }} />
                <span className="text-[12px]" style={{ color: "#333" }}>No active renewals</span>
              </div>
            )}
          </div>

          {/* Open Items */}
          <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 flex flex-col gap-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
              Open Items
            </div>

            {pendingCoiCount === 0 && activeDocCount === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2">
                <CheckCircle2 size={18} style={{ color: "#252525" }} />
                <span className="text-[12px]" style={{ color: "#333" }}>All clear</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2 flex-1">
                {pendingCoiCount > 0 && (
                  <Link
                    href={`/certificates?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group"
                    style={{ background: "#0E0E0E", border: "1px solid #1C1C1C" }}
                  >
                    <span className="text-[13px]" style={{ color: "#AAAAAA" }}>
                      {pendingCoiCount} COI{pendingCoiCount !== 1 ? "s" : ""} pending
                    </span>
                    <span className="text-[12px] transition-colors" style={{ color: "#333" }}>→</span>
                  </Link>
                )}
                {activeDocCount > 0 && (
                  <Link
                    href={`/documents?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group"
                    style={{ background: "#0E0E0E", border: "1px solid #1C1C1C" }}
                  >
                    <span className="text-[13px]" style={{ color: "#AAAAAA" }}>
                      {activeDocCount} doc{activeDocCount !== 1 ? "s" : ""} being chased
                    </span>
                    <span className="text-[12px] transition-colors" style={{ color: "#333" }}>→</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        {activePolicies.length > 0 && (
          <QuickActions
            clientId={client.id}
            policies={activePolicies.map((p) => ({
              id: p.id,
              policy_name: p.policy_name,
              campaign_stage: p.campaign_stage ?? null,
            }))}
          />
        )}

        {/* ── AI Panel ────────────────────────────────────────────────────── */}
        <ClientAIPanel clientId={client.id} clientName={client.name} />

      </div>
    </div>
  );
}
