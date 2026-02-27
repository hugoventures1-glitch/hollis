import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Plus, ArrowRight, Mail, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, phone, business_type, industry, primary_state, created_at")
    .eq("user_id", user.id)
    .order("name");

  const rows = clients ?? [];

  return (
    <div className="flex flex-col h-full bg-[#0d0d12] text-[#f5f5f7]">

      {/* Header */}
      <header className="h-[56px] shrink-0 border-b border-[#1e1e2a] flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          <span className="text-[#5e5e64]">CRM</span>
          <span className="text-[#2a2a35]">/</span>
          <span className="text-[#f5f5f7]">Clients</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-[#505057]">{rows.length} clients</span>
          <Link
            href="/renewals/upload"
            className="h-8 bg-[#00d4aa] text-black px-3.5 rounded text-[13px] font-bold hover:bg-[#00bfa0] transition-colors flex items-center gap-2"
          >
            <Plus size={14} strokeWidth={3} />
            Import
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-full bg-[#111118] border border-[#1e1e2a] flex items-center justify-center mb-4">
              <Users size={22} className="text-[#3a3a42]" />
            </div>
            <h2 className="text-[16px] font-semibold text-[#f5f5f7] mb-1">No clients yet</h2>
            <p className="text-[13px] text-[#505057] mb-6 max-w-xs">
              Import a CSV or add clients manually to get started.
            </p>
            <Link
              href="/renewals/upload"
              className="h-9 px-5 rounded-md bg-[#00d4aa] text-black text-[13px] font-semibold hover:bg-[#00bfa0] transition-colors"
            >
              Import CSV
            </Link>
          </div>
        ) : (
          <div className="px-6 py-4">
            {/* Column headers */}
            <div className="grid grid-cols-12 px-4 pb-2 border-b border-[#1e1e2a] mb-1">
              <div className="col-span-4 text-[11px] font-medium text-[#505057] uppercase tracking-wider">Name</div>
              <div className="col-span-4 text-[11px] font-medium text-[#505057] uppercase tracking-wider">Contact</div>
              <div className="col-span-2 text-[11px] font-medium text-[#505057] uppercase tracking-wider">Type</div>
              <div className="col-span-2 text-[11px] font-medium text-[#505057] uppercase tracking-wider">State</div>
            </div>

            {/* Rows */}
            {rows.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="grid grid-cols-12 items-center px-4 py-3 rounded-lg hover:bg-white/[0.03] transition-colors group border border-transparent hover:border-[#1e1e2a]"
              >
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center shrink-0">
                    <span className="text-[12px] font-bold text-[#00d4aa]">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[14px] font-medium text-[#f5f5f7] truncate">{client.name}</span>
                </div>

                <div className="col-span-4 min-w-0">
                  {client.email && (
                    <div className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] truncate">
                      <Mail size={11} className="shrink-0 text-[#505057]" />
                      {client.email}
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1.5 text-[12px] text-[#505057] mt-0.5">
                      <Phone size={11} className="shrink-0" />
                      {client.phone}
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  {client.business_type && (
                    <span className="text-[12px] text-[#505057] capitalize">
                      {client.business_type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>

                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-[12px] text-[#505057]">{client.primary_state ?? "—"}</span>
                  <ArrowRight
                    size={13}
                    className="text-[#3a3a42] opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
