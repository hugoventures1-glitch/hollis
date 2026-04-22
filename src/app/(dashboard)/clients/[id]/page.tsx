import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { ClientAIPanel } from "./ClientAIPanel";
import { ClientEditDrawer } from "./ClientEditDrawer";
import { DocChasePanel } from "./DocChasePanel";
import { QuickActions } from "./QuickActions";
import { Circle } from "lucide-react";
import { Breadcrumb } from "@/components/nav/Breadcrumb";
import { decodeCrumbs, buildTrailParam } from "@/lib/trail";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trail?: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CHECKLIST_MILESTONES: { key: string; label: string }[] = [
  { key: "email_90_sent",       label: "90-day outreach" },
  { key: "email_60_sent",       label: "60-day outreach" },
  { key: "sms_30_sent",         label: "30-day SMS" },
  { key: "questionnaire_sent",  label: "Questionnaire" },
  { key: "submission_sent",     label: "Submission" },
  { key: "recommendation_sent", label: "Recommendation" },
  { key: "confirmed",           label: "Renewal confirmed" },
];

const STAGE_ORDER = [
  "pending", "email_90_sent", "email_60_sent", "sms_30_sent",
  "script_14_ready", "questionnaire_sent", "submission_sent",
  "recommendation_sent", "final_notice_sent", "confirmed", "complete",
];

function isStageComplete(currentStage: string | null, targetStage: string): boolean {
  if (!currentStage) return false;
  if (currentStage === "lapsed") return false;
  const cur = STAGE_ORDER.indexOf(currentStage);
  const tgt = STAGE_ORDER.indexOf(targetStage);
  return cur >= tgt && tgt !== -1;
}

function InfoBlock({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[15px] text-[#FAFAFA]">{value ?? "—"}</div>
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
  if (days <= 60) return "#AAAAAA";
  return "#FAFAFA";
}

function urgencyGlow(days: number): string {
  if (days <= 30) return "0 0 24px rgba(255,68,68,0.35)";
  if (days <= 60) return "0 0 18px rgba(255,255,255,0.08)";
  return "none";
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

  const [activePoliciesRes, docChaseRes] = await Promise.all([
    supabase
      .from("policies")
      .select("id, policy_name, expiration_date, campaign_stage, health_label, carrier, premium")
      .eq("user_id", user.id)
      .eq("status", "active")
      .ilike("client_name", nameFilter)
      .order("expiration_date", { ascending: true }),

    supabase
      .from("doc_chase_requests")
      .select("id, document_type, status, escalation_level, created_at, last_client_reply")
      .eq("user_id", user.id)
      .in("status", ["pending", "active"])
      .or(
        emailFilter
          ? `client_name.ilike.${nameFilter},client_email.eq.${emailFilter}`
          : `client_name.ilike.${nameFilter}`
      )
      .order("created_at", { ascending: false }),
  ]);

  const activePolicies = activePoliciesRes.data ?? [];
  const docChases      = docChaseRes.data ?? [];
  const nearestPolicy  = activePolicies[0] ?? null;

  return (
    <div className="h-full bg-[#0C0C0C] text-[#FAFAFA] flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 h-[56px] border-b border-[#1C1C1C] shrink-0">
          <Breadcrumb crumbs={crumbs} current={client.name} />
        </div>

        <div className="flex flex-col gap-5 px-6 py-7">

          {/* ── AI Panel — full width ───────────────────────────────────── */}
          <ClientAIPanel clientId={client.id} clientName={client.name} />

          {/* ── Main row: Identity card + Renewal Status + Sidebar ──────── */}
          <div className="flex gap-4 items-stretch">

            {/* Identity card — flex-1, no internal dividers */}
            <div className="flex-1 min-w-0 rounded-xl bg-[#111111] border border-[#1C1C1C] p-6 flex flex-col gap-5">
              <div className="flex items-start gap-4">
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

              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                <InfoBlock label="Email"         value={client.email} />
                <InfoBlock label="Phone"         value={client.phone} />
                <InfoBlock label="State"         value={client.primary_state} />
                <InfoBlock label="Business Type" value={client.business_type?.replace(/_/g, " ")} />
                <InfoBlock label="Industry"      value={client.industry?.replace(/_/g, " ")} />
                <InfoBlock label="Employees"     value={client.num_employees} />
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

              {client.notes && (
                <div>
                  <div className="text-[12px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-2">Notes</div>
                  <p className="text-[15px] text-[#8a8a8a] leading-relaxed">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Status column — Renewal Status */}
            <div className="flex-1 min-w-0">
            <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-6 flex flex-col gap-5">
              <div className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
                Renewal Status
              </div>

              {nearestPolicy ? (() => {
                const days   = daysUntil(nearestPolicy.expiration_date);
                const dColor = urgencyColor(days);
                const dGlow  = urgencyGlow(days);
                const hColor = HEALTH_COLOR[nearestPolicy.health_label ?? ""] ?? "#3A3A3A";
                const stage  = STAGE_LABEL[nearestPolicy.campaign_stage ?? ""] ?? nearestPolicy.campaign_stage ?? "—";
                return (
                  <>
                    <div className="flex items-end gap-2">
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 700, lineHeight: 1, color: dColor, textShadow: dGlow }}>
                        {Math.abs(days)}
                      </span>
                      <span className="text-[13px] pb-1.5" style={{ color: "#444" }}>
                        {days < 0 ? "days past" : "days left"}
                      </span>
                    </div>
                    <div>
                      <div className="text-[14px] font-medium truncate" style={{ color: "#FAFAFA" }}>
                        {nearestPolicy.policy_name}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hColor, boxShadow: `0 0 5px ${hColor}66` }} />
                        <span className="text-[13px]" style={{ color: "#555" }}>{stage}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-[13px]" style={{ color: "#333" }}>
                        {activePolicies.length} active {activePolicies.length === 1 ? "policy" : "policies"}
                      </span>
                      <Link
                        href={`/renewals/${nearestPolicy.id}?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
                        className="text-[13px] transition-colors text-[#555] hover:text-[#FAFAFA]"
                      >
                        View renewal →
                      </Link>
                    </div>
                  </>
                );
              })() : (
                <div className="flex flex-col items-center justify-center flex-1 py-4 gap-2">
                  <RefreshCcw size={18} style={{ color: "#252525" }} />
                  <span className="text-[13px]" style={{ color: "#333" }}>No active renewals</span>
                </div>
              )}
            </div>
            </div>{/* end status column */}

            {/* Sidebar column — Renewal Checklist + Quick Actions */}
            <div className="w-80 shrink-0">
            <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-6 flex flex-col gap-5">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-widest mb-5" style={{ color: "#444" }}>
                  Renewal Checklist
                </div>

                {!nearestPolicy ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <Circle size={16} style={{ color: "#252525" }} />
                    <span className="text-[12px]" style={{ color: "#333" }}>No active renewals</span>
                  </div>
                ) : (() => {
                  const stage = nearestPolicy.campaign_stage ?? "pending";
                  const isLapsed = stage === "lapsed";
                  return (
                    <div className="flex flex-col gap-3">
                      <div className="text-[12px] truncate font-medium mb-1" style={{ color: "#555" }}>
                        {nearestPolicy.policy_name}
                      </div>
                      {CHECKLIST_MILESTONES.map(({ key, label }) => {
                        const done    = !isLapsed && isStageComplete(stage, key);
                        const current = !isLapsed && stage === key;
                        const isFinal = key === "confirmed";
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-3 rounded-md"
                            style={current ? {
                              background: "rgba(255,255,255,0.04)",
                              padding: "4px 6px",
                              margin: "-4px -6px",
                              boxShadow: "0 0 0 1px rgba(255,255,255,0.07)",
                            } : {}}
                          >
                            <div
                              className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                              style={{
                                background: done ? (isFinal ? "#00D97E22" : "#FAFAFA11") : "transparent",
                                border: done
                                  ? `1px solid ${isFinal ? "#00D97E" : "#444"}`
                                  : current
                                    ? "1px solid rgba(255,255,255,0.22)"
                                    : "1px solid #252525",
                              }}
                            >
                              {done && (
                                <div className="w-1.5 h-1.5 rounded-full" style={{ background: isFinal ? "#00D97E" : "#555" }} />
                              )}
                            </div>
                            <span
                              className="text-[13px] leading-tight"
                              style={{
                                color: done
                                  ? isFinal ? "#00D97E" : "#AAAAAA"
                                  : current ? "#DDDDDD" : "#444",
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                      {isLapsed && (
                        <div className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>Lapsed</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {activePolicies.length > 0 && (
                <div>
                  <QuickActions clientId={client.id} policies={activePolicies.map((p) => ({
                    id: p.id,
                    policy_name: p.policy_name,
                    campaign_stage: p.campaign_stage ?? null,
                  }))} />
                </div>
              )}
            </div>
            </div>{/* end sidebar column */}
          </div>{/* end main row */}

          {/* Doc Chase Panel */}
          <DocChasePanel
            clientName={client.name}
            clientEmail={client.email ?? null}
            chases={docChases.map((c) => ({
              id: c.id,
              document_type: c.document_type,
              status: c.status,
              escalation_level: (c as { escalation_level?: string }).escalation_level ?? "email",
              created_at: c.created_at,
              last_client_reply: (c as { last_client_reply?: string | null }).last_client_reply ?? null,
              validation_status: (c as { validation_status?: "pass" | "fail" | "partial" | "unreadable" | null }).validation_status ?? null,
              validation_summary: (c as { validation_summary?: string | null }).validation_summary ?? null,
              validation_issues: (c as { validation_issues?: string[] | null }).validation_issues ?? null,
            }))}
            startChaseHref={`/documents?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
          />

        </div>

    </div>
  );
}
