import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Building2,
  Users,
  DollarSign,
  FileText,
} from "lucide-react";
import { CommunicationTimeline } from "@/components/clients/CommunicationTimeline";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function InfoBlock({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[14px] text-[#c5c5cb]">{value ?? "—"}</div>
    </div>
  );
}

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

  // Fetch certificates where insured_name matches this client's name (best-effort)
  const { data: certs } = await supabase
    .from("certificates")
    .select("id, certificate_number, holder_name, status, expiration_date")
    .eq("user_id", user.id)
    .ilike("insured_name", `%${client.name}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  const certificates = certs ?? [];

  const STATUS_COLORS: Record<string, string> = {
    sent:     "text-[#00d4aa] bg-[#00d4aa]/10 border-[#00d4aa]/20",
    draft:    "text-[#8a8b91] bg-white/[0.04] border-[#1e1e2a]",
    expired:  "text-red-400 bg-red-950/20 border-red-800/20",
    outdated: "text-amber-400 bg-amber-950/20 border-amber-800/20",
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d12] text-[#f5f5f7] overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link
          href="/clients"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
        >
          <ArrowLeft size={13} />
          Clients
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7] truncate">{client.name}</span>
      </div>

      <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-8">

        {/* Identity card */}
        <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center shrink-0">
              <span className="text-[22px] font-bold text-[#00d4aa]">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-[#f5f5f7] leading-tight">{client.name}</h1>
              {client.industry && (
                <p className="text-[14px] text-[#8a8b91] mt-0.5 capitalize">
                  {client.industry.replace(/_/g, " ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-5 pt-5 border-t border-[#1e1e2a]">
            <InfoBlock label="Email"   value={client.email} />
            <InfoBlock label="Phone"   value={client.phone} />
            <InfoBlock label="State"   value={client.primary_state} />
            <InfoBlock label="Business Type" value={client.business_type?.replace(/_/g, " ")} />
            <InfoBlock label="Industry"      value={client.industry?.replace(/_/g, " ")} />
            <InfoBlock label="Employees"     value={client.num_employees} />
          </div>

          {(client.annual_revenue || client.num_locations) && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5 pt-5 mt-5 border-t border-[#1e1e2a]">
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
            <div className="pt-5 mt-5 border-t border-[#1e1e2a]">
              <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-2">Notes</div>
              <p className="text-[14px] text-[#8a8b91] leading-relaxed">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Certificates */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-widest">
              Certificates
            </div>
            <Link
              href="/certificates"
              className="text-[12px] text-[#505057] hover:text-[#00d4aa] transition-colors"
            >
              View all →
            </Link>
          </div>

          {certificates.length === 0 ? (
            <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-8 text-center">
              <FileText size={20} className="text-[#3a3a42] mx-auto mb-2" />
              <p className="text-[13px] text-[#505057]">No certificates found for this client</p>
            </div>
          ) : (
            <div className="space-y-2">
              {certificates.map((cert) => (
                <Link
                  key={cert.id}
                  href={`/certificates/${cert.id}`}
                  className="flex items-center justify-between px-5 py-3.5 rounded-xl bg-[#111118] border border-[#1e1e2a] hover:border-[#2e2e3a] transition-colors group"
                >
                  <div>
                    <div className="text-[13px] font-medium text-[#f5f5f7]">
                      {cert.certificate_number}
                    </div>
                    <div className="text-[12px] text-[#505057] mt-0.5">
                      Holder: {cert.holder_name ?? "—"}
                      {cert.expiration_date && (
                        <> · Exp {cert.expiration_date}</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                        STATUS_COLORS[cert.status] ?? STATUS_COLORS.draft
                      }`}
                    >
                      {cert.status}
                    </span>
                    <ArrowLeft
                      size={13}
                      className="text-[#3a3a42] opacity-0 group-hover:opacity-100 transition-opacity rotate-180"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Communication History */}
        <div>
          <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-4">
            Communication History
          </div>
          <CommunicationTimeline clientId={client.id} />
        </div>

      </div>
    </div>
  );
}
