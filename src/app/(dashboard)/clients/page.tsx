import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Plus } from "lucide-react";
import { ClientsTable } from "./_components/ClientsTable";

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
          <ClientsTable clients={rows} />
        )}
      </div>
    </div>
  );
}
