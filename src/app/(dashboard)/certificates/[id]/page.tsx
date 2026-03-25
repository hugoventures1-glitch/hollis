import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, AlertTriangle, CheckCircle } from "lucide-react";
import type { Certificate } from "@/types/coi";
import { formatLimit } from "@/types/coi";
import { FollowUpSection } from "../_components/FollowUpSection";
import { SendCOIButton } from "./SendCOIButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; backId?: string; backName?: string }>;
}

const STATUS_STYLES = {
  draft:    "bg-[#ffffff08] text-[#8a8a8a] border border-[#ffffff10]",
  sent:     "bg-[#FAFAFA]/[0.06] text-[#FAFAFA] border border-[#1C1C1C]",
  expired:  "bg-red-900/30 text-red-400 border border-red-700/30",
  outdated: "bg-[#FF4444]/[0.06] text-[#FF4444] border border-[#FF4444]/[0.2]",
};

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-[#6b6b6b] uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-[13px] text-[#FAFAFA]">{value || "—"}</div>
    </div>
  );
}

function CoverageSection({ label, enabled, rows }: { label: string; enabled: boolean; rows: [string, string][] }) {
  return (
    <div className={`rounded-lg border p-4 ${enabled ? "border-[#1C1C1C] bg-[#0C0C0C]" : "border-[#1C1C1C]/40 bg-[#0C0C0C] opacity-40"}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-4 h-4 rounded border flex items-center justify-center ${enabled ? "bg-[#FAFAFA] border-[#FAFAFA]" : "border-[#333333]"}`}>
          {enabled && <CheckCircle size={10} className="text-black" />}
        </div>
        <span className="text-[13px] font-semibold text-[#FAFAFA]">{label}</span>
      </div>
      {enabled && (
        <div className="space-y-1.5">
          {rows.map(([k, v]) => v ? (
            <div key={k} className="flex justify-between text-[12px]">
              <span className="text-[#6b6b6b]">{k}</span>
              <span className="text-[#FAFAFA] font-medium">{v}</span>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

export default async function CertificateDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const backHref  = sp.back === "client" && sp.backId   ? `/clients/${sp.backId}`                   : "/certificates";
  const backLabel = sp.back === "client" && sp.backName ? decodeURIComponent(sp.backName) : "Certificates";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) notFound();
  const cert = data as Certificate;
  const snap = cert.coverage_snapshot;

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">

      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Link href={backHref} className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">
          <ArrowLeft size={13} /> {backLabel}
        </Link>
        <ChevronRight size={12} className="text-[#6b6b6b]" />
        <span className="font-mono text-[12px] text-[#6b6b6b]">{cert.certificate_number}</span>

        <div className="ml-auto flex items-center gap-3">
          {cert.has_gap && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-400">
              <AlertTriangle size={12} /> Coverage gap
            </div>
          )}
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS_STYLES[cert.status]}`}>
            {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
          </span>
          <span className="h-8 px-4 flex items-center gap-1.5 rounded-md border border-[#1C1C1C] text-[12px] text-[#555555]">
            Certificate generation coming soon
          </span>
          {cert.status === "draft" && (
            <SendCOIButton certId={cert.id} defaultEmail={cert.holder_email ?? ""} />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-10 py-10">

          {/* Gap warning */}
          {cert.has_gap && cert.gap_details && cert.gap_details.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl bg-red-950/30 border border-red-800/40 p-4 mb-6">
              <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-[13px] font-semibold text-red-400 mb-2">Coverage gaps on this certificate</div>
                <ul className="space-y-1">
                  {cert.gap_details.map((g, i) => (
                    <li key={i} className="text-[12px] text-red-300">• {g}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">

            {/* Left column */}
            <div className="col-span-2 space-y-5">

              {/* Summary card */}
              <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-6">
                <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-4">Certificate Summary</div>
                <div className="grid grid-cols-2 gap-5">
                  <InfoBlock label="Insured" value={cert.insured_name} />
                  <InfoBlock label="Insured Address" value={cert.insured_address ?? ""} />
                  <InfoBlock label="Certificate Holder" value={cert.holder_name} />
                  <InfoBlock label="Holder Location" value={[cert.holder_city, cert.holder_state, cert.holder_zip].filter(Boolean).join(", ")} />
                  <InfoBlock label="Producer" value={cert.producer_name ?? ""} />
                  <InfoBlock label="Producer Contact" value={[cert.producer_phone, cert.producer_email].filter(Boolean).join(" · ")} />
                  <InfoBlock label="Effective" value={cert.effective_date ? new Date(cert.effective_date + "T00:00:00").toLocaleDateString("en-AU", { month: "long", day: "numeric", year: "numeric" }) : ""} />
                  <InfoBlock label="Expires" value={cert.expiration_date ? new Date(cert.expiration_date + "T00:00:00").toLocaleDateString("en-AU", { month: "long", day: "numeric", year: "numeric" }) : ""} />
                </div>
                {cert.additional_insured_language && (
                  <div className="mt-4 pt-4 border-t border-[#1C1C1C]">
                    <div className="text-[11px] font-medium text-[#6b6b6b] uppercase tracking-wider mb-1">Additional Insured Language</div>
                    <p className="text-[12px] text-[#8a8a8a] leading-relaxed">{cert.additional_insured_language}</p>
                  </div>
                )}
                {cert.description && (
                  <div className="mt-4 pt-4 border-t border-[#1C1C1C]">
                    <div className="text-[11px] font-medium text-[#6b6b6b] uppercase tracking-wider mb-1">Description of Operations</div>
                    <p className="text-[12px] text-[#8a8a8a] leading-relaxed">{cert.description}</p>
                  </div>
                )}
              </div>

              {/* Coverage */}
              <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-6">
                <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-4">Coverage Detail</div>
                <div className="grid grid-cols-2 gap-3">
                  <CoverageSection
                    label="General Liability"
                    enabled={snap.gl?.enabled ?? false}
                    rows={[
                      ["Type", snap.gl?.claims_made ? "Claims-Made" : "Occurrence"],
                      ["Each Occurrence", formatLimit(snap.gl?.each_occurrence ?? null)],
                      ["General Aggregate", formatLimit(snap.gl?.general_aggregate ?? null)],
                      ["Products-Comp/Op Agg", formatLimit(snap.gl?.products_comp_ops_agg ?? null)],
                      ["Personal & Adv Inj", formatLimit(snap.gl?.personal_adv_injury ?? null)],
                      ["Policy Number", snap.gl?.policy_number ?? ""],
                      ["Expires", snap.gl?.expiration ?? ""],
                      ["Insurer", snap.gl?.insurer ?? ""],
                    ]}
                  />
                  <CoverageSection
                    label="Automobile Liability"
                    enabled={snap.auto?.enabled ?? false}
                    rows={[
                      ["Auto Type", [
                        snap.auto?.any_auto && "Any Auto",
                        snap.auto?.owned_autos_only && "Owned",
                        snap.auto?.hired_autos_only && "Hired",
                        snap.auto?.non_owned_autos_only && "Non-Owned",
                      ].filter(Boolean).join(", ") ?? ""],
                      ["Combined Single Limit", formatLimit(snap.auto?.combined_single_limit ?? null)],
                      ["Policy Number", snap.auto?.policy_number ?? ""],
                      ["Expires", snap.auto?.expiration ?? ""],
                      ["Insurer", snap.auto?.insurer ?? ""],
                    ]}
                  />
                  <CoverageSection
                    label="Umbrella / Excess"
                    enabled={snap.umbrella?.enabled ?? false}
                    rows={[
                      ["Type", snap.umbrella?.is_umbrella ? "Umbrella" : "Excess"],
                      ["Each Occurrence", formatLimit(snap.umbrella?.each_occurrence ?? null)],
                      ["Aggregate", formatLimit(snap.umbrella?.aggregate ?? null)],
                      ["Policy Number", snap.umbrella?.policy_number ?? ""],
                      ["Expires", snap.umbrella?.expiration ?? ""],
                      ["Insurer", snap.umbrella?.insurer ?? ""],
                    ]}
                  />
                  <CoverageSection
                    label="Workers Compensation"
                    enabled={snap.wc?.enabled ?? false}
                    rows={[
                      ["E.L. Each Accident", formatLimit(snap.wc?.el_each_accident ?? null)],
                      ["Disease - Policy Limit", formatLimit(snap.wc?.el_disease_policy_limit ?? null)],
                      ["Disease - Each Employee", formatLimit(snap.wc?.el_disease_each_employee ?? null)],
                      ["Policy Number", snap.wc?.policy_number ?? ""],
                      ["Expires", snap.wc?.expiration ?? ""],
                      ["Insurer", snap.wc?.insurer ?? ""],
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">

              {/* Send status */}
              <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5">
                <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-3">Delivery</div>
                {cert.status === "sent" ? (
                  <div>
                    <div className="flex items-center gap-2 text-[#FAFAFA] text-[13px] font-medium mb-2">
                      <CheckCircle size={14} /> Sent
                    </div>
                    <div className="text-[12px] text-[#8a8a8a]">{cert.sent_to_email}</div>
                    <div className="text-[11px] text-[#6b6b6b] mt-1">
                      {cert.sent_at && new Date(cert.sent_at).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[12px] text-[#8a8a8a] mb-3">Not yet sent</div>
                    <div className="w-full h-8 flex items-center justify-center rounded-md border border-[#1C1C1C] text-[12px] text-[#555555] mb-2">
                      Certificate generation coming soon
                    </div>
                    <div className="w-full">
                      <SendCOIButton certId={cert.id} defaultEmail={cert.holder_email ?? ""} />
                    </div>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 space-y-3">
                <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-3">Metadata</div>
                <InfoBlock label="Certificate #" value={cert.certificate_number} />
                <InfoBlock label="Created" value={new Date(cert.created_at).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" })} />
                {cert.request_id && <InfoBlock label="Source Request" value={cert.request_id.slice(0, 8) + "…"} />}
              </div>

              {/* Holder Follow-Up */}
              <FollowUpSection
                certificateId={cert.id}
                holderName={cert.holder_name}
                holderEmail={cert.holder_email ?? null}
                expirationDate={cert.expiration_date ?? null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

