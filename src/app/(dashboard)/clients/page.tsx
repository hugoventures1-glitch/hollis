"use client";

import Link from "next/link";
import { Users, Plus, Loader2 } from "lucide-react";
import { ClientsTable } from "./_components/ClientsTable";
import { useHollisData } from "@/hooks/useHollisData";

export default function ClientsPage() {
  const { clients, loading, backgroundRefreshing } = useHollisData();
  const rows = clients;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)", color: "var(--text-primary)" }}>

      {/* Header */}
      <header className="h-[56px] shrink-0 flex items-center justify-between px-6" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          <span style={{ color: "#555555", fontSize: 12 }}>CRM</span>
        </div>
        <div className="flex items-center gap-2.5">
          {backgroundRefreshing && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "rgba(250,250,250,0.2)" }} title="Syncing…" />
          )}
          <span className="text-[13px]" style={{ color: "#333333" }}>{rows.length} clients</span>
          <Link
            href="/import/clients"
            className="h-8 px-3.5 rounded text-[13px] font-bold flex items-center gap-2 transition-colors"
            style={{ background: "#FAFAFA", color: "#0C0C0C" }}
          >
            <Plus size={14} strokeWidth={3} />
            Import
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin" style={{ color: "#333333" }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <Users size={22} style={{ color: "#333333" }} />
            </div>
            <h2 className="text-[16px] font-semibold mb-1" style={{ color: "#FAFAFA" }}>No clients yet</h2>
            <p className="text-[13px] mb-6 max-w-xs" style={{ color: "#555555" }}>
              Import a CSV or add clients manually to get started.
            </p>
            <Link
              href="/import/clients"
              className="h-9 px-5 rounded-md text-[13px] font-semibold transition-colors"
              style={{ background: "#FAFAFA", color: "#0C0C0C" }}
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
