"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Phone, ArrowRight } from "lucide-react";
import { ActionButton } from "@/components/actions/ActionButton";
import { useToast } from "@/components/actions/MicroToast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  business_type?: string | null;
  industry?: string | null;
  primary_state?: string | null;
  created_at: string;
}

interface ClientsTableProps {
  clients: Client[];
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ClientRow({ client }: { client: Client }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRequestCOI = useCallback(
    async () => {
      if (loading) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/actions/coi/request/${client.id}`, {
          method: "POST",
        });
        const data = await res.json();

        if (!res.ok || data.error) {
          toast(data.error ?? "Could not create COI request", "error");
          return;
        }

        toast(`COI request created for ${client.name}`, "success");
        router.push(`/certificates/new?request=${data.requestId}`);
      } catch {
        toast("Connection error — please try again", "error");
      } finally {
        setLoading(false);
      }
    },
    [client, loading, toast, router]
  );

  return (
    <div
      onClick={() => router.push(`/clients/${client.id}`)}
      className="grid grid-cols-12 items-center px-4 py-3 rounded-lg hover:bg-white/[0.03] transition-colors group border border-transparent hover:border-[#1e1e2a] cursor-pointer"
    >
      {/* Name */}
      <div className="col-span-4 flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center shrink-0">
          <span className="text-[12px] font-bold text-[#00d4aa]">
            {client.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-[14px] font-medium text-[#f5f5f7] truncate">
          {client.name}
        </span>
      </div>

      {/* Contact */}
      <div className="col-span-3 min-w-0">
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

      {/* Type */}
      <div className="col-span-2">
        {client.business_type && (
          <span className="text-[12px] text-[#505057] capitalize">
            {client.business_type.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* State */}
      <div className="col-span-1">
        <span className="text-[12px] text-[#505057]">
          {client.primary_state ?? "—"}
        </span>
      </div>

      {/* Actions — fade on hover, stop row-click propagation */}
      <div
        className="col-span-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <ActionButton
          label="Request COI"
          onClick={handleRequestCOI}
          loading={loading}
          variant="default"
        />
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center h-7 px-2 text-zinc-600 hover:text-zinc-300 transition-colors"
          title="View client"
        >
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export function ClientsTable({ clients }: ClientsTableProps) {
  return (
    <div className="px-6 py-4">
      {/* Column headers */}
      <div className="grid grid-cols-12 px-4 pb-2 border-b border-[#1e1e2a] mb-1">
        <div className="col-span-4 text-[11px] font-medium text-[#505057] uppercase tracking-wider">
          Name
        </div>
        <div className="col-span-3 text-[11px] font-medium text-[#505057] uppercase tracking-wider">
          Contact
        </div>
        <div className="col-span-2 text-[11px] font-medium text-[#505057] uppercase tracking-wider">
          Type
        </div>
        <div className="col-span-1 text-[11px] font-medium text-[#505057] uppercase tracking-wider">
          State
        </div>
        <div className="col-span-2" />
      </div>

      {/* Rows */}
      {clients.map((client) => (
        <ClientRow key={client.id} client={client} />
      ))}
    </div>
  );
}
