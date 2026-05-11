"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface FollowUpMessage {
  status: string;
  scheduled_for: string | null;
}

interface SequenceRow {
  id: string;
  certificate_id: string;
  holder_name: string;
  holder_email: string;
  sequence_status: "active" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  holder_followup_messages: FollowUpMessage[];
  certificates: {
    insured_name: string;
    certificate_number: string;
  } | null;
}

const SEQ_STATUS_STYLES: Record<
  SequenceRow["sequence_status"],
  { className: string; icon: React.ElementType; label: string }
> = {
  active:    { className: "bg-hover-overlay text-text-primary border border-border",         icon: Clock,        label: "Active"    },
  completed: { className: "bg-hover-overlay text-text-secondary border border-border-subtle", icon: CheckCircle2, label: "Completed" },
  cancelled: { className: "bg-hover-overlay text-text-tertiary border border-border-subtle",  icon: XCircle,      label: "Cancelled" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function SequencesTab() {
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      supabase
        .from("holder_followup_sequences")
        .select(`
          id,
          certificate_id,
          holder_name,
          holder_email,
          sequence_status,
          created_at,
          completed_at,
          holder_followup_messages ( status, scheduled_for ),
          certificates ( insured_name, certificate_number )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setSequences((data ?? []) as unknown as SequenceRow[]);
          setLoading(false);
        });
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <div className="w-14 h-14 rounded-full bg-hover-overlay border border-border flex items-center justify-center mb-4">
          <Mail size={22} className="text-text-primary" />
        </div>
        <div className="text-[16px] font-semibold text-text-primary mb-1">No follow-up sequences yet</div>
        <div className="text-[13px] text-text-tertiary max-w-xs">
          Start a sequence from the Issued COIs tab to automatically follow up with certificate holders.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-10 py-6">
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Holder", "Certificate", "Status", "Touches", "Next Touch", "Started"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sequences.map((seq) => {
              const msgs = seq.holder_followup_messages ?? [];
              const sentCount = msgs.filter((m) => m.status === "sent").length;
              const style = SEQ_STATUS_STYLES[seq.sequence_status];
              const StatusIcon = style.icon;

              const nextTouchDate = seq.sequence_status === "active"
                ? msgs
                    .filter((m) => m.status === "pending" && m.scheduled_for)
                    .map((m) => new Date(m.scheduled_for!))
                    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
                : null;

              return (
                <tr key={seq.id} className="border-b border-border last:border-0 hover:bg-white/[0.02] transition-colors group">
                  <td className="px-5 py-3.5">
                    <Link href={`/certificates/${seq.certificate_id}`} className="block">
                      <div className="text-[13px] font-medium text-text-primary group-hover:text-text-primary transition-colors">
                        {seq.holder_name}
                      </div>
                      <div className="text-[11px] text-text-tertiary font-mono mt-0.5">{seq.holder_email}</div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/certificates/${seq.certificate_id}`} className="block">
                      <div className="text-[13px] text-text-primary">{seq.certificates?.insured_name ?? "—"}</div>
                      {seq.certificates?.certificate_number && (
                        <div className="text-[11px] text-text-tertiary font-mono mt-0.5">{seq.certificates.certificate_number}</div>
                      )}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.className}`}>
                      <StatusIcon size={9} />
                      {style.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-[13px] text-text-primary tabular-nums">{sentCount} / {msgs.length}</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">sent</div>
                  </td>
                  <td className="px-5 py-3.5">
                    {nextTouchDate ? (
                      <>
                        <div className="text-[13px] text-text-primary">{fmtDate(nextTouchDate.toISOString())}</div>
                        <div className="text-[11px] text-text-tertiary mt-0.5">scheduled</div>
                      </>
                    ) : (
                      <span className="text-[12px] text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="text-[13px] text-text-primary">{fmtDate(seq.created_at)}</div>
                    {seq.completed_at && (
                      <div className="text-[11px] text-text-tertiary mt-0.5">Done {fmtDate(seq.completed_at)}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
