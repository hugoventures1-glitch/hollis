"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/actions/MicroToast";
import { useHollisStore } from "@/stores/hollisStore";

interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  business_type?: string | null;
  industry?: string | null;
  num_employees?: number | null;
  annual_revenue?: number | null;
  owns_vehicles?: boolean | null;
  num_locations?: number | null;
  primary_state?: string | null;
  notes?: string | null;
}

interface ClientEditDrawerProps {
  client: Client;
}

const BUSINESS_TYPE_OPTIONS = [
  { value: "", label: "— Select —" },
  { value: "individual", label: "Individual" },
  { value: "contractor", label: "Contractor" },
  { value: "retail", label: "Retail" },
  { value: "professional_services", label: "Professional Services" },
  { value: "healthcare", label: "Healthcare" },
  { value: "technology", label: "Technology" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "hospitality", label: "Hospitality" },
  { value: "transportation", label: "Transportation" },
  { value: "other", label: "Other" },
];

const INDUSTRY_OPTIONS = [
  { value: "", label: "— Select —" },
  { value: "construction", label: "Construction" },
  { value: "healthcare", label: "Healthcare" },
  { value: "technology", label: "Technology" },
  { value: "retail", label: "Retail" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "hospitality", label: "Hospitality" },
  { value: "transportation", label: "Transportation" },
  { value: "real_estate", label: "Real Estate" },
  { value: "financial_services", label: "Financial Services" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
];

const inputClass =
  "w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-4 py-2.5 text-[14px] text-[#f5f5f7] placeholder-[#6b6b6b] outline-none focus:border-[#555555] transition-colors disabled:opacity-50";

const labelClass =
  "block text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-2";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider pt-2 pb-1 border-b border-[#1C1C1C] mb-4">
      {children}
    </div>
  );
}

export function ClientEditDrawer({ client }: ClientEditDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [primaryState, setPrimaryState] = useState(client.primary_state ?? "");
  const [numEmployees, setNumEmployees] = useState(client.num_employees?.toString() ?? "");
  const [numLocations, setNumLocations] = useState(client.num_locations?.toString() ?? "");
  const [annualRevenue, setAnnualRevenue] = useState(client.annual_revenue?.toString() ?? "");
  const [businessType, setBusinessType] = useState(client.business_type ?? "");
  const [industry, setIndustry] = useState(client.industry ?? "");
  const [ownsVehicles, setOwnsVehicles] = useState(client.owns_vehicles ?? false);
  const [notes, setNotes] = useState(client.notes ?? "");

  const router = useRouter();
  const { toast } = useToast();
  const updateStore = useHollisStore.setState;

  useEffect(() => setMounted(true), []);

  // Reset form when drawer opens
  useEffect(() => {
    if (isOpen) {
      setName(client.name);
      setEmail(client.email ?? "");
      setPhone(client.phone ?? "");
      setPrimaryState(client.primary_state ?? "");
      setNumEmployees(client.num_employees?.toString() ?? "");
      setNumLocations(client.num_locations?.toString() ?? "");
      setAnnualRevenue(client.annual_revenue?.toString() ?? "");
      setBusinessType(client.business_type ?? "");
      setIndustry(client.industry ?? "");
      setOwnsVehicles(client.owns_vehicles ?? false);
      setNotes(client.notes ?? "");
      setError(null);
    }
  }, [isOpen, client]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        primary_state: primaryState.trim() || null,
        business_type: businessType || null,
        industry: industry || null,
        owns_vehicles: ownsVehicles,
        notes: notes.trim() || null,
      };
      if (numEmployees !== "") body.num_employees = parseInt(numEmployees, 10);
      else body.num_employees = null;
      if (numLocations !== "") body.num_locations = parseInt(numLocations, 10);
      else body.num_locations = null;
      if (annualRevenue !== "") body.annual_revenue = parseFloat(annualRevenue);
      else body.annual_revenue = null;

      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Update failed");
      }

      const updated = await res.json();

      // Optimistically update the global store so lists feel instant
      updateStore((state) => ({
        clients: state.clients.map((c) =>
          c.id === client.id
            ? { ...c, name: updated.name, email: updated.email, phone: updated.phone,
                business_type: updated.business_type, industry: updated.industry,
                primary_state: updated.primary_state }
            : c
        ),
      }));

      toast("Client updated", "success");
      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#f5f5f7] hover:border-[#333333] transition-colors"
        title="Edit client"
      >
        <Pencil size={12} />
        Edit
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/50 backdrop-blur-[2px]"
            onClick={() => !saving && setIsOpen(false)}
          />

          {/* Panel */}
          <div className="w-[520px] shrink-0 bg-[#111118] border-l border-[#1e1e2a] flex flex-col h-full shadow-[-24px_0_60px_rgba(0,0,0,0.5)]">

            {/* Header */}
            <div className="h-14 shrink-0 border-b border-[#1e1e2a] flex items-center justify-between px-6">
              <span className="text-[14px] font-semibold text-[#f5f5f7]">Edit Client</span>
              <button
                onClick={() => setIsOpen(false)}
                disabled={saving}
                className="w-7 h-7 rounded-md flex items-center justify-center text-[#505057] hover:text-[#f5f5f7] hover:bg-white/[0.06] transition-colors disabled:opacity-50"
              >
                <X size={15} />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              <SectionLabel>Contact</SectionLabel>

              <div>
                <label className={labelClass}>Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  placeholder="Client name"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={saving}
                    placeholder="email@example.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={saving}
                    placeholder="02 1234 5678"
                    className={inputClass}
                  />
                </div>
              </div>

              <SectionLabel>Location &amp; Size</SectionLabel>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>State</label>
                  <input
                    value={primaryState}
                    onChange={(e) => setPrimaryState(e.target.value.toUpperCase().slice(0, 3))}
                    disabled={saving}
                    placeholder="NSW"
                    maxLength={3}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Employees</label>
                  <input
                    type="number"
                    min="0"
                    value={numEmployees}
                    onChange={(e) => setNumEmployees(e.target.value)}
                    disabled={saving}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Locations</label>
                  <input
                    type="number"
                    min="0"
                    value={numLocations}
                    onChange={(e) => setNumLocations(e.target.value)}
                    disabled={saving}
                    placeholder="1"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Annual Revenue ($)</label>
                <input
                  type="number"
                  min="0"
                  value={annualRevenue}
                  onChange={(e) => setAnnualRevenue(e.target.value)}
                  disabled={saving}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <SectionLabel>Business Profile</SectionLabel>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Business Type</label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    disabled={saving}
                    className={inputClass}
                  >
                    {BUSINESS_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Industry</label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={saving}
                    className={inputClass}
                  >
                    {INDUSTRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#0C0C0C] border border-[#1C1C1C]">
                <span className="text-[14px] text-[#f5f5f7]">Owns Vehicles</span>
                <button
                  type="button"
                  onClick={() => setOwnsVehicles(!ownsVehicles)}
                  disabled={saving}
                  className={`relative w-10 h-5 rounded-full transition-colors ${ownsVehicles ? "bg-[#FAFAFA]" : "bg-[#2a2a2a]"} disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[#0C0C0C] shadow transition-transform ${ownsVehicles ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <SectionLabel>Notes</SectionLabel>

              <div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={saving}
                  rows={4}
                  placeholder="Address, ABN, or any other details…"
                  className={`${inputClass} resize-none leading-relaxed`}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-[13px] text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-4 py-2.5">
                  <span>⚠</span> {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#1e1e2a] px-6 py-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="h-9 flex items-center gap-2 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                disabled={saving}
                className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
