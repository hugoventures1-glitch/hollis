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
      className="group grid grid-cols-12 items-center px-4 cursor-pointer select-none transition-colors duration-100"
      style={{
        minHeight: 68,
        backgroundImage: "linear-gradient(to right, transparent 0%, transparent 16px, #353535 16px, #353535 calc(100% - 16px), transparent calc(100% - 16px), transparent 100%)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 1px",
        backgroundPosition: "0 100%",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.018)";
        (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-dim='bright']").forEach((d) => { d.style.color = "#FAFAFA"; });
        (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-dim='meta']").forEach((d) => { d.style.color = "rgba(250,250,250,0.25)"; });
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "";
        (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-dim='bright']").forEach((d) => { d.style.color = "rgba(250,250,250,0.2)"; });
        (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-dim='meta']").forEach((d) => { d.style.color = "rgba(250,250,250,0.1)"; });
      }}
    >
      {/* Name + Contact — single unified scale block */}
      <div className="col-span-7 flex items-center gap-3 min-w-0 py-4 transition-transform duration-200 group-hover:scale-105">
        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(250,250,250,0.06)", border: "1px solid #1C1C1C" }}>
          <span className="text-[11px] font-bold" style={{ color: "#FAFAFA" }}>
            {client.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <div
            className="truncate leading-snug"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              color: "#FAFAFA",
            }}
          >
            {client.name}
          </div>
          {client.email && (
            <div
              className="flex items-center gap-1.5 mt-0.5 truncate transition-colors duration-200"
              style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(250,250,250,0.2)" }}
              data-dim="bright"
            >
              <Mail size={10} className="shrink-0" />
              {client.email}
            </div>
          )}
          {!client.email && client.phone && (
            <div
              className="flex items-center gap-1.5 mt-0.5 transition-colors duration-200"
              style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(250,250,250,0.1)" }}
              data-dim="meta"
            >
              <Phone size={10} className="shrink-0" />
              {client.phone}
            </div>
          )}
        </div>
      </div>

      {/* Type */}
      <div className="col-span-2">
        {client.business_type && (
          <span
            className="text-[11px] capitalize transition-colors duration-200"
            style={{ fontFamily: "var(--font-mono)", color: "rgba(250,250,250,0.1)" }}
            data-dim="meta"
          >
            {client.business_type.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* State */}
      <div className="col-span-1">
        <span
          className="text-[11px] transition-colors duration-200"
          style={{ fontFamily: "var(--font-mono)", color: "rgba(250,250,250,0.1)" }}
          data-dim="meta"
        >
          {client.primary_state ?? "—"}
        </span>
      </div>

      {/* Actions — fade + slide in on hover */}
      <div
        className="col-span-2 flex items-center justify-end gap-1 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
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
          style={{ color: "#444" }}
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
      <div className="grid grid-cols-12 px-4 pb-2 mb-1" style={{ borderBottom: "1px solid #353535" }}>
        <div className="col-span-7 text-[11px] font-medium uppercase tracking-wider" style={{ color: "#333333" }}>
          Client
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
