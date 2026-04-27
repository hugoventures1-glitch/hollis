import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { ClientEditDrawer } from "./ClientEditDrawer";
import { DocChasePanel } from "./DocChasePanel";
import { QuickActions } from "./QuickActions";
import { CommsHistoryPanel } from "./CommsHistoryPanel";
import type { CommsLogEntry } from "./CommsHistoryPanel";
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

const AGENT_ACTION_TYPES = new Set([
  "renewal_intent_classified", "approval_queued", "escalation",
  "renewal_email", "renewal_sms", "doc_chase_email", "doc_chase_sms",
  "doc_chase_escalated",
]);

function actionActor(actionType: string, tier: string | null): string {
  if (tier) return "agent";
  return AGENT_ACTION_TYPES.has(actionType) ? "agent" : "system";
}

function fmtAuditTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-")
    + " "
    + d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const policyIds      = activePolicies.map((p) => p.id);

  // ── Audit log + comms history ────────────────────────────────────────────────
  const orFilter = policyIds.length > 0
    ? `client_id.eq.${client.id},policy_id.in.(${policyIds.join(",")})`
    : `client_id.eq.${client.id}`;

  const [auditRes, sendLogsRes, signalsRes] = await Promise.all([
    supabase
      .from("hollis_actions")
      .select("id, action_type, trigger_reason, outcome, tier, created_at")
      .eq("broker_id", user.id)
      .or(orFilter)
      .order("created_at", { ascending: false })
      .limit(5),

    policyIds.length > 0
      ? supabase
          .from("send_logs")
          .select("id, channel, recipient, status, sent_at, campaign_touchpoints(type, subject)")
          .eq("user_id", user.id)
          .in("policy_id", policyIds)
          .order("sent_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as unknown[] }),

    policyIds.length > 0
      ? supabase
          .from("inbound_signals")
          .select("id, source, raw_signal, sender_name, created_at")
          .eq("user_id", user.id)
          .in("policy_id", policyIds)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const auditRows = (auditRes.data ?? []) as {
    id: string; action_type: string; trigger_reason: string;
    outcome: string; tier: string | null; created_at: string;
  }[];

  // Normalise comms history entries
  const rawSendLogs = (sendLogsRes.data ?? []) as {
    id: string; channel: string; recipient: string; status: string; sent_at: string;
    campaign_touchpoints: { type: string; subject: string | null } | null;
  }[];
  const rawSignals = (signalsRes.data ?? []) as {
    id: string; source: string; raw_signal: string; sender_name: string | null; created_at: string;
  }[];

  const commsEntries: CommsLogEntry[] = [
    ...rawSendLogs.map((l) => ({
      id: l.id,
      kind: l.channel as "email" | "sms",
      label: l.campaign_touchpoints?.subject
        ?? l.campaign_touchpoints?.type?.replace(/_/g, " ")
        ?? l.recipient,
      status: l.status,
      ts: l.sent_at,
    })),
    ...rawSignals.map((s) => ({
      id: s.id,
      kind: (s.source === "manual" ? "note" : s.source) as "email" | "sms" | "note",
      label: s.sender_name
        ? `${s.sender_name}: ${s.raw_signal.slice(0, 80)}`
        : s.raw_signal.slice(0, 80),
      ts: s.created_at,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const renewalWorkspaceHref = nearestPolicy
    ? `/renewals/${nearestPolicy.id}?trail=${buildTrailParam(crumbs, client.name, selfHref)}`
    : undefined;

  const docChaseProps = docChases.map((c) => ({
    id: c.id,
    document_type: c.document_type,
    status: c.status,
    escalation_level: (c as { escalation_level?: string }).escalation_level ?? "email",
    created_at: c.created_at,
    last_client_reply: (c as { last_client_reply?: string | null }).last_client_reply ?? null,
    validation_status: (c as { validation_status?: "pass" | "fail" | "partial" | "unreadable" | null }).validation_status ?? null,
    validation_summary: (c as { validation_summary?: string | null }).validation_summary ?? null,
    validation_issues: (c as { validation_issues?: string[] | null }).validation_issues ?? null,
  }));

  return (
    <div className="h-full bg-[#0C0C0C] text-[#FAFAFA] flex flex-col overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Breadcrumb crumbs={crumbs} current={client.name} />
      </div>

      <div className="flex flex-col gap-4 px-6 py-6">

        {/* ── Top row: Identity | Renewal Status | Quick Actions ──────── */}
        <div className="flex gap-4 items-stretch">

          {/* Identity card */}
          <div className="flex-1 min-w-0 rounded-xl bg-[#111111] border border-[#1C1C1C] p-6 flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shrink-0">
                <span className="text-[20px] font-bold text-[#FAFAFA]">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[20px] font-bold text-[#FAFAFA] leading-tight">{client.name}</h1>
                {activePolicies.length > 0 && (
                  <p className="text-[13px] text-[#555] mt-0.5">
                    {activePolicies.length} active {activePolicies.length === 1 ? "policy" : "policies"}
                  </p>
                )}
              </div>
              <ClientEditDrawer client={client} />
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-5">
              <InfoBlock label="Email"         value={client.email} />
              <InfoBlock label="Phone"         value={client.phone} />
              <InfoBlock label="State"         value={client.primary_state} />
              <InfoBlock label="Business Type" value={client.business_type?.replace(/_/g, " ")} />
              <InfoBlock label="Industry"      value={client.industry?.replace(/_/g, " ")} />
              <InfoBlock label="Employees"     value={client.num_employees} />
              <InfoBlock label="Locations"     value={client.num_locations ?? null} />
              <InfoBlock label="Owns Vehicles" value={client.owns_vehicles != null ? (client.owns_vehicles ? "Yes" : "No") : null} />
            </div>

            {client.notes && (
              <div>
                <div className="text-[12px] font-semibold text-[#6b6b6b] uppercase tracking-wider mb-2">Notes</div>
                <p className="text-[14px] text-[#8a8a8a] leading-relaxed">{client.notes}</p>
              </div>
            )}
          </div>

          {/* Renewal Status + Checklist */}
          <div className="flex-1 min-w-0 rounded-xl bg-[#111111] border border-[#1C1C1C] p-6 flex flex-col gap-5">
            <div className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
              Renewal Status
            </div>

            {nearestPolicy ? (() => {
              const days   = daysUntil(nearestPolicy.expiration_date);
              const dColor = urgencyColor(days);
              const dGlow  = urgencyGlow(days);
              const hColor = HEALTH_COLOR[nearestPolicy.health_label ?? ""] ?? "#3A3A3A";
              const stage  = STAGE_LABEL[nearestPolicy.campaign_stage ?? ""] ?? nearestPolicy.campaign_stage ?? "—";
              const csStage = nearestPolicy.campaign_stage ?? "pending";
              const isLapsed = csStage === "lapsed";
              return (
                <>
                  <div className="flex items-end gap-2">
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 700, lineHeight: 1, color: dColor, textShadow: dGlow }}>
                      {Math.abs(days)}
                    </span>
                    <span className="text-[13px] pb-1.5" style={{ color: "#444" }}>
                      {days < 0 ? "days past due" : "days left"}
                    </span>
                  </div>

                  {/* Policy badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-medium"
                      style={{ background: "#1A1A1A", border: "1px solid #252525", color: "#888" }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hColor }} />
                      {stage} · {nearestPolicy.policy_name}
                    </span>
                  </div>

                  {/* Checklist */}
                  <div className="border-t border-[#1A1A1A] pt-4 flex flex-col gap-1">
                    <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#333" }}>
                      Checklist
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {CHECKLIST_MILESTONES.map(({ key, label }) => {
                        const done    = !isLapsed && isStageComplete(csStage, key);
                        const current = !isLapsed && csStage === key;
                        const isFinal = key === "confirmed";
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <div
                              className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
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
                              className="text-[12px] leading-tight"
                              style={{
                                color: done
                                  ? isFinal ? "#00D97E" : "#888"
                                  : current ? "#DDDDDD" : "#383838",
                              }}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {isLapsed && (
                      <div className="mt-1 text-[12px]" style={{ color: "#FF4444" }}>Lapsed</div>
                    )}
                  </div>
                </>
              );
            })() : (
              <div className="flex flex-col items-center justify-center flex-1 py-8 gap-2">
                <RefreshCcw size={18} style={{ color: "#252525" }} />
                <span className="text-[13px]" style={{ color: "#333" }}>No active renewals</span>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {activePolicies.length > 0 && (
            <div className="w-72 shrink-0 flex flex-col">
              <QuickActions
                clientId={client.id}
                policies={activePolicies.map((p) => ({
                  id: p.id,
                  policy_name: p.policy_name,
                  campaign_stage: p.campaign_stage ?? null,
                }))}
                renewalWorkspaceHref={renewalWorkspaceHref}
                className="h-full"
              />
            </div>
          )}
        </div>{/* end top row */}

        {/* ── Bottom row: Comms History | Doc Chase + Audit Log ───────── */}
        <div className="flex gap-4 items-stretch">

          {/* Comms History — left */}
          <div className="flex-1 min-w-0 min-h-[320px] flex flex-col">
            <CommsHistoryPanel entries={commsEntries} />
          </div>

          {/* Right column: Doc Chase + Audit Log stacked */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">

            {/* Doc Chase */}
            <DocChasePanel
              clientName={client.name}
              clientEmail={client.email ?? null}
              chases={docChaseProps}
              startChaseHref={`/documents?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
            />

            {/* Audit Log */}
            <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 flex flex-col gap-4">
              <div className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
                Audit Log
              </div>

              {auditRows.length === 0 ? (
                <div className="flex items-center justify-center py-4">
                  <span className="text-[13px]" style={{ color: "#333" }}>No actions recorded yet.</span>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-[#191919]">
                  {auditRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-3 py-2">
                      <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "#444" }}>
                        {fmtAuditTs(row.created_at)}
                      </span>
                      <span className="text-[12px] flex-1 truncate" style={{ color: "#AAAAAA" }}>
                        {row.trigger_reason}
                      </span>
                      <span className="text-[11px] shrink-0" style={{ color: "#333" }}>
                        {actionActor(row.action_type, row.tier)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Link
                href={`/activity?trail=${buildTrailParam(crumbs, client.name, selfHref)}`}
                className="text-[12px] transition-colors"
                style={{ color: "#444" }}
              >
                View full log →
              </Link>
            </div>
          </div>

        </div>{/* end bottom row */}

      </div>

    </div>
  );
}
