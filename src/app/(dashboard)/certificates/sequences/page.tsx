import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, CheckCircle2, XCircle, Clock, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

// ── Types ────────────────────────────────────────────────────

interface FollowUpMessage {
  status: string;
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

// ── Helpers ───────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SEQ_STATUS_STYLES: Record<
  SequenceRow["sequence_status"],
  { className: string; icon: React.ElementType; label: string }
> = {
  active:    { className: "bg-[#FAFAFA]/[0.06] text-[#FAFAFA] border border-[#1C1C1C]",    icon: Clock,        label: "Active"    },
  completed: { className: "bg-[#ffffff08] text-[#8a8a8a] border border-[#ffffff10]",       icon: CheckCircle2, label: "Completed" },
  cancelled: { className: "bg-[#ffffff08] text-[#6b6b6b] border border-[#ffffff10]",       icon: XCircle,      label: "Cancelled" },
};

// ── Page ─────────────────────────────────────────────────────

export default async function SequencesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("holder_followup_sequences")
    .select(`
      id,
      certificate_id,
      holder_name,
      holder_email,
      sequence_status,
      created_at,
      completed_at,
      holder_followup_messages ( status ),
      certificates ( insured_name, certificate_number )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const sequences = (data ?? []) as unknown as SequenceRow[];

  const totalActive    = sequences.filter((s) => s.sequence_status === "active").length;
  const totalCompleted = sequences.filter((s) => s.sequence_status === "completed").length;

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">

      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Link
          href="/certificates"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
        >
          <ArrowLeft size={13} />
          Certificates
        </Link>
        <ChevronRight size={12} className="text-[#6b6b6b]" />
        <span className="text-[13px] text-[#FAFAFA]">Follow-Up Sequences</span>

        <div className="ml-auto flex items-center gap-3">
          {totalActive > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#FAFAFA] bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] rounded-full px-2.5 py-1">
              <Clock size={10} />
              {totalActive} active
            </span>
          )}
          {totalCompleted > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-[#8a8a8a] bg-[#ffffff08] border border-[#ffffff10] rounded-full px-2.5 py-1">
              <CheckCircle2 size={10} />
              {totalCompleted} completed
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-10 py-8">

          {sequences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center mb-4">
                <Mail size={22} className="text-[#FAFAFA]" />
              </div>
              <div className="text-[16px] font-semibold text-[#FAFAFA] mb-1">
                No follow-up sequences yet
              </div>
              <div className="text-[13px] text-[#6b6b6b] max-w-xs">
                Start a sequence from any certificate detail page to automatically
                follow up with certificate holders after expiry.
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#1C1C1C] bg-[#111111] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1C1C1C]">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider">
                      Holder
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider">
                      Certificate
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider">
                      Touches
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-wider">
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map((seq) => {
                    const msgs = seq.holder_followup_messages ?? [];
                    const sentCount = msgs.filter((m) => m.status === "sent").length;
                    const style = SEQ_STATUS_STYLES[seq.sequence_status];
                    const StatusIcon = style.icon;

                    return (
                      <tr
                        key={seq.id}
                        className="border-b border-[#1C1C1C] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/certificates/${seq.certificate_id}`}
                            className="block"
                          >
                            <div className="text-[13px] font-medium text-[#FAFAFA] group-hover:text-[#FAFAFA] transition-colors">
                              {seq.holder_name}
                            </div>
                            <div className="text-[11px] text-[#6b6b6b] font-mono mt-0.5">
                              {seq.holder_email}
                            </div>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link href={`/certificates/${seq.certificate_id}`} className="block">
                            <div className="text-[13px] text-[#FAFAFA]">
                              {seq.certificates?.insured_name ?? "—"}
                            </div>
                            {seq.certificates?.certificate_number && (
                              <div className="text-[11px] text-[#6b6b6b] font-mono mt-0.5">
                                {seq.certificates.certificate_number}
                              </div>
                            )}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link href={`/certificates/${seq.certificate_id}`} className="block">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${style.className}`}
                            >
                              <StatusIcon size={9} />
                              {style.label}
                            </span>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link href={`/certificates/${seq.certificate_id}`} className="block">
                            <div className="text-[13px] text-[#FAFAFA] tabular-nums">
                              {sentCount} / {msgs.length}
                            </div>
                            <div className="text-[11px] text-[#6b6b6b] mt-0.5">sent</div>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link href={`/certificates/${seq.certificate_id}`} className="block">
                            <div className="text-[13px] text-[#FAFAFA]">
                              {fmtDate(seq.created_at)}
                            </div>
                            {seq.completed_at && (
                              <div className="text-[11px] text-[#6b6b6b] mt-0.5">
                                Done {fmtDate(seq.completed_at)}
                              </div>
                            )}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
