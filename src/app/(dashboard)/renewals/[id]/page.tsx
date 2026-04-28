import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  MessageSquare,
  Phone,
  CheckCircle2,
  Clock,
  XCircle,
  SkipForward,
} from "lucide-react";
import { Breadcrumb } from "@/components/nav/Breadcrumb";
import { decodeCrumbs } from "@/lib/trail";
import { StageBadge } from "@/components/renewals/stage-badge";
import { DaysBadge } from "@/components/renewals/days-badge";
import { daysUntilExpiry, TOUCHPOINT_LABELS } from "@/types/renewals";
import type {
  PolicyDetailFull,
  CampaignTouchpoint,
  SendLog,
  TouchpointStatus,
} from "@/types/renewals";
import { RenewalOverrideControls } from "@/components/renewals/RenewalOverrideControls";
import { RenewalViewTracker } from "@/components/analytics/RenewalViewTracker";
import { InsurerTermsPanel } from "@/components/renewals/InsurerTermsPanel";
import { AuditTimeline } from "@/components/renewals/AuditTimeline";
import { PolicyTimelinePanel } from "@/components/renewals/PolicyTimelinePanel";
import type { TimelineConfig } from "@/types/timeline";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trail?: string; back?: string; backId?: string; backName?: string }>;
}

const TOUCHPOINT_ICONS: Record<string, React.ElementType> = {
  email_90: Mail,
  email_60: Mail,
  sms_30: MessageSquare,
  script_14: Phone,
  submission_60: Mail,
  recommendation_30: Mail,
  final_notice_7: Mail,
};

const STATUS_ICON_MAP: Record<TouchpointStatus, React.ReactNode> = {
  pending:    <Clock size={14} className="text-[#8a8a8a]" />,
  processing: <Clock size={14} className="text-[#9e9e9e]" />,
  sent:       <CheckCircle2 size={14} className="text-[#FAFAFA]" />,
  failed:     <XCircle size={14} className="text-[#FF4444]" />,
  skipped:    <SkipForward size={14} className="text-[#6b6b6b]" />,
};

const STATUS_LABEL_MAP: Record<TouchpointStatus, string> = {
  pending:    "Scheduled",
  processing: "Sending…",
  sent:       "Sent",
  failed:     "Failed",
  skipped:    "Skipped",
};

export default async function PolicyDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  // Trail-based breadcrumb (new). Backward compat: old ?back=client&backId=... still works.
  const crumbs = sp.trail
    ? decodeCrumbs(sp.trail)
    : sp.back === "client" && sp.backId && sp.backName
      ? [{ label: decodeURIComponent(sp.backName), href: `/clients/${sp.backId}` }]
      : [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: policy, error }, { data: agentProfile }] = await Promise.all([
    supabase
      .from("policies")
      .select(`
        *,
        campaign_touchpoints(*),
        send_logs(*),
        renewal_audit_log(*),
        insurer_terms(*)
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("agent_profiles")
      .select("renewal_timeline")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (error || !policy) notFound();

  const p = policy as unknown as PolicyDetailFull;
  const days = daysUntilExpiry(p.expiration_date);
  const brokerTimeline = (agentProfile?.renewal_timeline as TimelineConfig | null) ?? null;
  const policyTimeline = (p.custom_timeline as TimelineConfig | null) ?? null;

  const touchpoints = [...(p.campaign_touchpoints ?? [])].sort(
    (a: CampaignTouchpoint, b: CampaignTouchpoint) =>
      a.scheduled_at.localeCompare(b.scheduled_at)
  );
  const sendLogs = [...(p.send_logs ?? [])].sort(
    (a: SendLog, b: SendLog) => b.sent_at.localeCompare(a.sent_at)
  );

  const auditEntries = p.renewal_audit_log ?? [];
  const insurerTerms = p.insurer_terms ?? [];

  const hasTerms = insurerTerms.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>
      <RenewalViewTracker policyId={p.id} policyName={p.policy_name} />
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <Breadcrumb crumbs={crumbs} current={p.policy_name} />
        <div className="ml-auto">
          <StageBadge stage={p.campaign_stage} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-10 space-y-8">

          {/* Policy summary card */}
          <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold leading-tight" style={{ color: "#FAFAFA" }}>{p.policy_name}</h1>
                <p className="text-[14px] mt-1" style={{ color: "#555555" }}>{p.carrier}</p>
              </div>
              <DaysBadge days={days} className="text-[13px] px-3 py-1" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
              <InfoBlock label="Client" value={p.client_name} />
              <InfoBlock label="Email" value={p.client_email ?? "—"} />
              <InfoBlock label="Phone" value={p.client_phone ?? "—"} />
              <InfoBlock
                label="Premium"
                value={p.premium ? `$${Number(p.premium).toLocaleString()}` : "—"}
              />
              <InfoBlock
                label="Expiration"
                value={new Date(p.expiration_date + "T00:00:00").toLocaleDateString("en-AU", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              />
              <InfoBlock label="Status" value={p.status} capitalize />
              {p.client_confirmed_at && (
                <InfoBlock
                  label="Confirmed"
                  value={new Date(p.client_confirmed_at).toLocaleDateString("en-AU", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                />
              )}
              {p.lapsed_at && (
                <InfoBlock
                  label="Lapsed"
                  value={new Date(p.lapsed_at).toLocaleDateString("en-AU", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                />
              )}
              <InfoBlock
                label="Last Contact"
                value={p.last_contact_at
                  ? new Date(p.last_contact_at).toLocaleDateString("en-AU", {
                      month: "short", day: "numeric", year: "numeric",
                    })
                  : "Never contacted"}
              />
              <InfoBlock
                label="Created"
                value={new Date(p.created_at).toLocaleDateString("en-AU", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              />
            </div>
          </div>

          {/* Renewal override controls */}
          <RenewalOverrideControls
            policy={{
              id: p.id,
              renewal_paused: p.renewal_paused ?? false,
              renewal_paused_until: p.renewal_paused_until ?? null,
              renewal_manual_override: p.renewal_manual_override ?? null,
              require_approval: p.require_approval ?? false,
              campaign_stage: p.campaign_stage,
              client_name: p.client_name,
              client_email: p.client_email ?? null,
            }}
          />

          {/* Insurer Terms (F1) */}
          <InsurerTermsPanel
            policyId={p.id}
            terms={insurerTerms}
            priorPremium={p.premium ?? null}
          />

          {/* Policy Timeline Editor */}
          <PolicyTimelinePanel
            policyId={p.id}
            policyTimeline={policyTimeline}
            brokerTimeline={brokerTimeline}
            daysUntilExpiry={days}
          />

          {/* Campaign timeline */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#555555" }}>
              Campaign Timeline
            </div>
            <div className="space-y-3">
              {touchpoints.length === 0 && (
                <div className="text-[13px] py-4 text-center" style={{ color: "#333333" }}>
                  No touchpoints yet.
                </div>
              )}
              {touchpoints.map((tp: CampaignTouchpoint) => {
                const Icon = TOUCHPOINT_ICONS[tp.type] ?? Mail;
                const tpBg = tp.status === "failed" ? "rgba(255,68,68,0.06)" : "var(--surface)";
                const tpBorder = tp.status === "failed" ? "rgba(255,68,68,0.2)" : "var(--border)";
                const tpOpacity = tp.status === "skipped" ? 0.5 : 1;
                const iconBg = tp.status === "sent" ? "rgba(250,250,250,0.08)" : tp.status === "failed" ? "rgba(255,68,68,0.08)" : "rgba(255,255,255,0.04)";
                const iconColor = tp.status === "sent" ? "#FAFAFA" : tp.status === "failed" ? "#FF4444" : "#555555";
                return (
                  <div
                    key={tp.id}
                    className="rounded-xl p-5 transition-colors"
                    style={{ background: tpBg, border: `1px solid ${tpBorder}`, opacity: tpOpacity }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: iconBg }}>
                          <Icon size={15} style={{ color: iconColor }} />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium" style={{ color: "#FAFAFA" }}>
                            {TOUCHPOINT_LABELS[tp.type]}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1 text-[12px]" style={{ color: "#555555" }}>
                              {STATUS_ICON_MAP[tp.status]}
                              <span>{STATUS_LABEL_MAP[tp.status]}</span>
                            </div>
                            <span style={{ color: "#333333" }}>·</span>
                            <span className="text-[12px]" style={{ color: "#333333" }}>
                              Scheduled{" "}
                              {new Date(tp.scheduled_at + "T00:00:00").toLocaleDateString("en-AU", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </span>
                            {tp.sent_at && (
                              <>
                                <span style={{ color: "#333333" }}>·</span>
                                <span className="text-[12px]" style={{ color: "#333333" }}>
                                  Sent{" "}
                                  {new Date(tp.sent_at).toLocaleDateString("en-AU", {
                                    month: "short", day: "numeric",
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {tp.status === "sent" && tp.content && (
                      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                        {tp.subject && (
                          <div className="text-[12px] font-medium mb-1" style={{ color: "#555555" }}>
                            Subject: <span style={{ color: "#FAFAFA" }}>{tp.subject}</span>
                          </div>
                        )}
                        <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto" style={{ color: "#555555" }}>
                          {tp.content}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Send logs */}
          {sendLogs.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#555555" }}>
                Send Log
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--background)" }}>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#555555" }}>Channel</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#555555" }}>Recipient</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#555555" }}>Status</th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "#555555" }}>Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sendLogs.map((log: SendLog) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }} className="last:border-b-0">
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[12px] capitalize" style={{ color: "#555555" }}>
                            {log.channel === "email"
                              ? <Mail size={12} />
                              : <MessageSquare size={12} />}
                            {log.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px]" style={{ color: "#FAFAFA" }}>{log.recipient}</td>
                        <td className="px-4 py-3">
                          <span className="text-[12px]" style={{
                            color: log.status === "sent" ? "#FAFAFA" :
                                   log.status === "bounced" ? "#888888" :
                                   "#FF4444"
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[12px] tabular-nums" style={{ color: "#333333" }}>
                          {new Date(log.sent_at).toLocaleString("en-AU", {
                            month: "short", day: "numeric",
                            hour: "numeric", minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audit Timeline (F4) */}
          <AuditTimeline entries={auditEntries} />

        </div>
      </div>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider mb-0.5" style={{ color: "#333333" }}>
        {label}
      </div>
      <div className={`text-[14px] ${capitalize ? "capitalize" : ""}`} style={{ color: "#FAFAFA" }}>
        {value}
      </div>
    </div>
  );
}
