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
import { daysUntilExpiry, TOUCHPOINT_LABELS, TOUCHPOINT_DESCRIPTIONS } from "@/types/renewals";
import type {
  PolicyDetailFull,
  CampaignTouchpoint,
  SendLog,
  TouchpointStatus,
} from "@/types/renewals";
import { RenewalOverrideControls } from "@/components/renewals/RenewalOverrideControls";
// import { InsurerTermsPanel } from "@/components/renewals/InsurerTermsPanel";
import { AuditTimeline } from "@/components/renewals/AuditTimeline";
import { RejectScriptButton } from "@/components/renewals/RejectScriptButton";
import { PolicyTimelinePanel } from "@/components/renewals/PolicyTimelinePanel";
import type { TimelineConfig } from "@/types/timeline";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trail?: string; back?: string; backId?: string; backName?: string }>;
}

function scheduleTiming(scheduledAt: string, status: string): { label: string; urgent: boolean } {
  if (status === "sent") return { label: "Sent", urgent: false };
  if (status === "skipped") return { label: "Skipped", urgent: false };
  if (status === "failed") return { label: "Failed — retry needed", urgent: true };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sched = new Date(scheduledAt + "T00:00:00"); sched.setHours(0, 0, 0, 0);
  const diff = Math.round((sched.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { label: "Overdue — sends next cron run", urgent: true };
  if (diff === 0) return { label: "Sends today", urgent: true };
  if (diff === 1) return { label: "Sends tomorrow", urgent: false };
  if (diff < 7) return { label: `Sends in ${diff} days`, urgent: false };
  const weeks = Math.round(diff / 7);
  return { label: `Sends in ${weeks === 1 ? "1 week" : `${weeks} weeks`}`, urgent: false };
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
  pending:    <Clock size={14} className="text-text-secondary" />,
  processing: <Clock size={14} className="text-text-secondary" />,
  sent:       <CheckCircle2 size={14} className="text-text-primary" />,
  failed:     <XCircle size={14} className="text-danger" />,
  skipped:    <SkipForward size={14} className="text-text-tertiary" />,
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
                <h1 className="text-[22px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{p.policy_name}</h1>
                <p className="text-[14px] mt-1" style={{ color: "var(--text-secondary)" }}>{p.carrier}</p>
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

          {/* Policy Timeline Editor */}
          <PolicyTimelinePanel
            policyId={p.id}
            policyTimeline={policyTimeline}
            brokerTimeline={brokerTimeline}
            daysUntilExpiry={days}
          />

          {/* Campaign timeline */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>
              Campaign Timeline
            </div>
            <div className="space-y-3">
              {touchpoints.length === 0 && (
                <div className="text-[13px] py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  No touchpoints yet.
                </div>
              )}
              {touchpoints.map((tp: CampaignTouchpoint, tpIndex: number) => {
                const Icon = TOUCHPOINT_ICONS[tp.type] ?? Mail;
                const tpBg = tp.status === "failed" ? "rgba(255,68,68,0.06)" : "var(--surface)";
                const tpBorder = tp.status === "failed" ? "rgba(255,68,68,0.2)" : "var(--border)";
                const tpOpacity = tp.status === "skipped" ? 0.5 : 1;
                const iconBg = tp.status === "sent" ? "rgba(250,250,250,0.08)" : tp.status === "failed" ? "rgba(255,68,68,0.08)" : "rgba(255,255,255,0.04)";
                const iconColor = tp.status === "sent" ? "var(--text-primary)" : tp.status === "failed" ? "var(--danger)" : "var(--text-secondary)";
                const timing = scheduleTiming(tp.scheduled_at, tp.status);
                const isFirstPending = tpIndex === 0 && tp.status === "pending";
                const isScriptPending = tp.type === "script_14" && tp.status === "pending";
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
                          <div className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                            {TOUCHPOINT_LABELS[tp.type]}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                            {TOUCHPOINT_DESCRIPTIONS[tp.type]}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                              style={{
                                background: timing.urgent ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.04)",
                                color: timing.urgent ? "#fbbf24" : "var(--text-secondary)",
                                border: timing.urgent ? "1px solid rgba(251,191,36,0.2)" : "1px solid var(--border-subtle)",
                              }}
                            >
                              {timing.label}
                            </span>
                            {tp.sent_at && (
                              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                on {new Date(tp.sent_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isFirstPending && (
                          <form method="POST" action={`/api/actions/renew/${p.id}`}>
                            <button
                              type="submit"
                              className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-[12px] font-medium transition-colors"
                              style={{ background: "var(--border)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}
                            >
                              Send Now
                            </button>
                          </form>
                        )}
                        {isScriptPending && (
                          <RejectScriptButton policyId={p.id} />
                        )}
                      </div>
                    </div>

                    {tp.status === "sent" && tp.content && (
                      <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                        {tp.subject && (
                          <div className="text-[12px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                            Subject: <span style={{ color: "var(--text-primary)" }}>{tp.subject}</span>
                          </div>
                        )}
                        <pre className="text-[12px] whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto" style={{ color: "var(--text-secondary)" }}>
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
              <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>
                Send Log
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--background)" }}>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Channel</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Recipient</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Status</th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sendLogs.map((log: SendLog) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }} className="last:border-b-0">
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[12px] capitalize" style={{ color: "var(--text-secondary)" }}>
                            {log.channel === "email"
                              ? <Mail size={12} />
                              : <MessageSquare size={12} />}
                            {log.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px]" style={{ color: "var(--text-primary)" }}>{log.recipient}</td>
                        <td className="px-4 py-3">
                          <span className="text-[12px]" style={{
                            color: log.status === "sent" ? "var(--text-primary)" :
                                   log.status === "bounced" ? "var(--danger)" :
                                   "var(--danger)"
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[12px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
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
      <div className="text-[11px] font-medium uppercase tracking-wider mb-0.5" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div className={`text-[14px] ${capitalize ? "capitalize" : ""}`} style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
