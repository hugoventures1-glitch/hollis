import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Mail,
  MessageSquare,
  Phone,
  CheckCircle2,
  Clock,
  XCircle,
  SkipForward,
  ArrowLeft,
} from "lucide-react";
import { StageBadge } from "@/components/renewals/stage-badge";
import { DaysBadge } from "@/components/renewals/days-badge";
import { daysUntilExpiry, TOUCHPOINT_LABELS } from "@/types/renewals";
import type { PolicyDetail, CampaignTouchpoint, SendLog, TouchpointStatus } from "@/types/renewals";
import { RenewalOverrideControls } from "@/components/renewals/RenewalOverrideControls";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const TOUCHPOINT_ICONS = {
  email_90: Mail,
  email_60: Mail,
  sms_30: MessageSquare,
  script_14: Phone,
};

const STATUS_ICON_MAP: Record<TouchpointStatus, React.ReactNode> = {
  pending:    <Clock size={14} className="text-[#8a8b91]" />,
  processing: <Clock size={14} className="text-amber-400" />,
  sent:       <CheckCircle2 size={14} className="text-[#00d4aa]" />,
  failed:     <XCircle size={14} className="text-red-400" />,
  skipped:    <SkipForward size={14} className="text-[#505057]" />,
};

const STATUS_LABEL_MAP: Record<TouchpointStatus, string> = {
  pending:    "Scheduled",
  processing: "Sending…",
  sent:       "Sent",
  failed:     "Failed",
  skipped:    "Skipped",
};

export default async function PolicyDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: policy, error } = await supabase
    .from("policies")
    .select("*, campaign_touchpoints(*), send_logs(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !policy) notFound();

  const p = policy as PolicyDetail;
  const days = daysUntilExpiry(p.expiration_date);

  const touchpoints = [...(p.campaign_touchpoints ?? [])].sort(
    (a: CampaignTouchpoint, b: CampaignTouchpoint) =>
      a.scheduled_at.localeCompare(b.scheduled_at)
  );
  const sendLogs = [...(p.send_logs ?? [])].sort(
    (a: SendLog, b: SendLog) => b.sent_at.localeCompare(a.sent_at)
  );

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link
          href="/renewals"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
        >
          <ArrowLeft size={13} />
          Renewals
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7] truncate max-w-xs">{p.policy_name}</span>

        <div className="ml-auto">
          <StageBadge stage={p.campaign_stage} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-10 space-y-8">

          {/* Policy summary card */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-[22px] font-bold text-[#f5f5f7] leading-tight">{p.policy_name}</h1>
                <p className="text-[14px] text-[#8a8b91] mt-1">{p.carrier}</p>
              </div>
              <DaysBadge days={days} className="text-[13px] px-3 py-1" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-[#1e1e2a]">
              <InfoBlock label="Client" value={p.client_name} />
              <InfoBlock label="Email" value={p.client_email ?? "—"} />
              <InfoBlock label="Phone" value={p.client_phone ?? "—"} />
              <InfoBlock
                label="Premium"
                value={p.premium ? `$${Number(p.premium).toLocaleString()}` : "—"}
              />
              <InfoBlock
                label="Expiration"
                value={new Date(p.expiration_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              />
              <InfoBlock label="Status" value={p.status} capitalize />
              <InfoBlock
                label="Last Contact"
                value={p.last_contact_at
                  ? new Date(p.last_contact_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })
                  : "Never contacted"}
              />
              <InfoBlock
                label="Created"
                value={new Date(p.created_at).toLocaleDateString("en-US", {
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
            }}
          />

          {/* Campaign timeline */}
          <div>
            <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-4">
              Campaign Timeline
            </div>
            <div className="space-y-3">
              {touchpoints.map((tp: CampaignTouchpoint) => {
                const Icon = TOUCHPOINT_ICONS[tp.type];
                return (
                  <div
                    key={tp.id}
                    className={`rounded-xl border p-5 transition-colors ${
                      tp.status === "sent"
                        ? "bg-[#111118] border-[#1e1e2a]"
                        : tp.status === "failed"
                        ? "bg-red-950/20 border-red-800/30"
                        : tp.status === "skipped"
                        ? "bg-[#0d0d12] border-[#1e1e2a]/60 opacity-50"
                        : "bg-[#111118] border-[#1e1e2a]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          tp.status === "sent"
                            ? "bg-[#00d4aa]/10"
                            : tp.status === "failed"
                            ? "bg-red-900/30"
                            : "bg-[#ffffff06]"
                        }`}>
                          <Icon
                            size={15}
                            className={
                              tp.status === "sent"
                                ? "text-[#00d4aa]"
                                : tp.status === "failed"
                                ? "text-red-400"
                                : "text-[#8a8b91]"
                            }
                          />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium text-[#f5f5f7]">
                            {TOUCHPOINT_LABELS[tp.type]}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1 text-[12px] text-[#8a8b91]">
                              {STATUS_ICON_MAP[tp.status]}
                              <span>{STATUS_LABEL_MAP[tp.status]}</span>
                            </div>
                            <span className="text-[#505057]">·</span>
                            <span className="text-[12px] text-[#505057]">
                              Scheduled{" "}
                              {new Date(tp.scheduled_at + "T00:00:00").toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </span>
                            {tp.sent_at && (
                              <>
                                <span className="text-[#505057]">·</span>
                                <span className="text-[12px] text-[#505057]">
                                  Sent{" "}
                                  {new Date(tp.sent_at).toLocaleDateString("en-US", {
                                    month: "short", day: "numeric",
                                  })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Subject + content preview for sent touchpoints */}
                    {tp.status === "sent" && tp.content && (
                      <div className="mt-4 pt-4 border-t border-[#1e1e2a]">
                        {tp.subject && (
                          <div className="text-[12px] font-medium text-[#8a8b91] mb-1">
                            Subject: <span className="text-[#c5c5cb]">{tp.subject}</span>
                          </div>
                        )}
                        <pre className="text-[12px] text-[#8a8b91] whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
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
              <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-4">
                Send Log
              </div>
              <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e1e2a] bg-[#0d0d12]">
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Channel</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Recipient</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Status</th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sendLogs.map((log: SendLog) => (
                      <tr key={log.id} className="border-b border-[#1e1e2a]/60 last:border-b-0">
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[12px] capitalize ${
                            log.channel === "email" ? "text-[#60a5fa]" : "text-[#c084fc]"
                          }`}>
                            {log.channel === "email"
                              ? <Mail size={12} />
                              : <MessageSquare size={12} />}
                            {log.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-[#c5c5cb]">{log.recipient}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[12px] ${
                            log.status === "sent"    ? "text-[#00d4aa]" :
                            log.status === "bounced" ? "text-amber-400"  :
                            "text-red-400"
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[12px] text-[#505057] tabular-nums">
                          {new Date(log.sent_at).toLocaleString("en-US", {
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
      <div className="text-[11px] font-medium text-[#505057] uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className={`text-[14px] text-[#c5c5cb] ${capitalize ? "capitalize" : ""}`}>
        {value}
      </div>
    </div>
  );
}
