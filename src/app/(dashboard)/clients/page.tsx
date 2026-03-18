"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Users, Loader2, Search } from "lucide-react";
import { ClientsTable } from "./_components/ClientsTable";
import { useHollisData } from "@/hooks/useHollisData";

type TabId = "all" | "companies" | "individuals";

export default function ClientsPage() {
  const { clients, loading, backgroundRefreshing } = useHollisData();

  const [query, setQuery]   = useState("");
  const [tab,   setTab]     = useState<TabId>("all");
  const inputRef            = useRef<HTMLInputElement>(null);

  const companies   = clients.filter((c) => c.business_type && c.business_type !== "individual");
  const individuals = clients.filter((c) => !c.business_type || c.business_type === "individual");

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "all",         label: "All",         count: clients.length   },
    { id: "companies",   label: "Companies",   count: companies.length   },
    { id: "individuals", label: "Individuals", count: individuals.length },
  ];

  const baseRows =
    tab === "companies"   ? companies :
    tab === "individuals" ? individuals :
    clients;

  const q = query.trim().toLowerCase();
  const rows = q
    ? baseRows.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.business_type?.toLowerCase().includes(q) ||
        c.primary_state?.toLowerCase().includes(q)
      )
    : baseRows;

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
        </div>
      </header>

      {/* Search + Tabs bar */}
      <div
        className="shrink-0 px-6 flex items-center gap-6"
        style={{ height: 60, borderBottom: "1px solid #1A1A1A" }}
      >
        {/* Search box */}
        <div
          className="flex items-center gap-3 px-4 rounded-xl transition-all duration-200 flex-shrink-0 cursor-text"
          style={{ width: 280, height: 44, background: "#0E0E0E", border: "1px solid #2A2A2A" }}
          onClick={() => inputRef.current?.focus()}
        >
          <Search size={16} style={{ color: "#555", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder="Search clients"
            className="flex-1 bg-transparent outline-none placeholder-[#555]"
            style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#AAAAAA" }}
          />
          {query && (
            <button
              onClick={(e) => { e.stopPropagation(); setQuery(""); }}
              className="text-[11px] shrink-0 transition-colors"
              style={{ color: "#555", lineHeight: 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#888")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            >
              ×
            </button>
          )}
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-2 px-2 rounded-lg flex-shrink-0"
          style={{ background: "#1A1A1A", height: 40 }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-all rounded-md"
                style={{
                  color:      active ? "#FAFAFA" : "#555",
                  background: active ? "#0E0E0E" : "transparent",
                  border:     active ? "1px solid #252525" : "1px solid transparent",
                }}
              >
                {t.label}
                <span
                  className="tabular-nums"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: active ? "#666" : "#333" }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin" style={{ color: "#333333" }} />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <Users size={22} style={{ color: "#333333" }} />
            </div>
            <h2 className="text-[16px] font-semibold mb-1" style={{ color: "#FAFAFA" }}>No clients yet</h2>
            <p className="text-[13px] mb-6 max-w-xs" style={{ color: "#555555" }}>
              Drop your spreadsheet in Settings → Import Data and Hollis will map everything automatically.
            </p>
            <Link
              href="/settings?tab=import"
              className="h-9 px-5 rounded-md text-[13px] font-semibold transition-colors"
              style={{ background: "#FAFAFA", color: "#0C0C0C" }}
            >
              Go to Import Data
            </Link>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-[13px]" style={{ color: "#444" }}>
            No clients match your search.
          </div>
        ) : (
          <ClientsTable clients={rows} />
        )}
      </div>
    </div>
  );
}
