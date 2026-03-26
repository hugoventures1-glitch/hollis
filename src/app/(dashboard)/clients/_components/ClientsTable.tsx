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
      className="grid grid-cols-12 items-center px-4 py-3 rounded-lg transition-colors group border border-transparent cursor-pointer"
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(255,255,255,0.018)";
        el.querySelectorAll<HTMLElement>("[data-dim]").forEach((d) => { d.style.color = "#777777"; });
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "";
        el.querySelectorAll<HTMLElement>("[data-dim]").forEach((d) => { d.style.color = ""; });
      }}
    >
      {/* Name */}
      <div className="col-span-4 flex items-center gap-3 min-w-0 transition-transform duration-200 group-hover:scale-105">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(250,250,250,0.06)", border: "1px solid #1C1C1C" }}>
          <span className="text-[12px] font-bold" style={{ color: "#FAFAFA" }}>
            {client.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <span className="text-[14px] font-medium truncate" style={{ color: "#FAFAFA" }}>
          {client.name}
        </span>
      </div>

      {/* Contact */}
      <div className="col-span-3 min-w-0">
        {client.email && (
          <div className="flex items-center gap-1.5 text-[13px] truncate transition-colors duration-200" style={{ color: "#555555" }} data-dim>
            <Mail size={11} className="shrink-0" style={{ color: "#333333" }} />
            {client.email}
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-1.5 text-[12px] mt-0.5 transition-colors duration-200" style={{ color: "#333333" }} data-dim>
            <Phone size={11} className="shrink-0" />
            {client.phone}
          </div>
        )}
      </div>

      {/* Type */}
      <div className="col-span-2">
        {client.business_type && (
          <span className="text-[12px] capitalize transition-colors duration-200" style={{ color: "#333333" }} data-dim>
            {client.business_type.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* State */}
      <div className="col-span-1">
        <span className="text-[12px] transition-colors duration-200" style={{ color: "#333333" }} data-dim>
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
          className="inline-flex items-center h-7 px-2 transition-colors"
          style={{ color: "#333333" }}
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
      <div className="grid grid-cols-12 px-4 pb-2 mb-1" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="col-span-4 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
          Name
        </div>
        <div className="col-span-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
          Contact
        </div>
        <div className="col-span-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
          Type
        </div>
        <div className="col-span-1 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
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
