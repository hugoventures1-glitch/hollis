"use client";

/**
 * /documents — Document Chasing dashboard
 *
 * Full client-side page (requires auth-gated API calls + interactive drawer).
 * Initialises from the global Hollis store (instant on back-navigation).
 * Falls back to GET /api/doc-chase when the store has no data yet.
 * Create drawer: POST /api/doc-chase.
 * Mark Received / Cancel: PATCH /api/doc-chase/[id].
 * Calls refetch() after mutations to keep the store in sync.
 */

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import {
  FileText,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Mail,
  Upload,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { PhoneScriptModal } from "@/components/doc-chase/PhoneScriptModal";
import { ChaseRow } from "@/components/doc-chase/ChaseRow";
import { DOCUMENT_TYPES } from "@/types/doc-chase";
import type { DocChaseRequestSummary, DocChaseRequestStatus } from "@/types/doc-chase";
import { useHollisData } from "@/hooks/useHollisData";
import { useHollisStore } from "@/stores/hollisStore";
import { Breadcrumb } from "@/components/nav/Breadcrumb";
import { decodeCrumbs } from "@/lib/trail";

// ── Trail breadcrumb (reads searchParams — wrapped in Suspense at usage site) ──

function DocsBreadcrumb() {
  const sp = useSearchParams();
  const crumbs = decodeCrumbs(sp.get("trail"));
  return <Breadcrumb crumbs={crumbs} current="Documents" />;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<DocChaseRequestStatus, string> = {
  pending:   "text-text-secondary bg-border border-border",
  active:    "text-text-primary bg-hover-overlay border-border",
  received:  "text-text-primary bg-hover-overlay border-border",
  cancelled: "text-text-tertiary bg-surface border-border",
};

const STATUS_LABELS: Record<DocChaseRequestStatus, string> = {
  pending:   "Pending",
  active:    "Active",
  received:  "Received",
  cancelled: "Cancelled",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-[13px] font-medium pointer-events-auto transition-all ${
            t.type === "success"
              ? "bg-background border-border text-text-primary"
              : "bg-background border-red-800/40 text-red-400"
          }`}
        >
          {t.type === "success" ? (
            <CheckCircle2 size={15} className="text-text-primary shrink-0" />
          ) : (
            <AlertCircle size={15} className="text-red-400 shrink-0" />
          )}
          {t.message}
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Chase Detail Drawer ───────────────────────────────────────────────────────

function ChaseDetailDrawer({
  request,
  onClose,
  onStatusChange,
  onForceSent,
}: {
  request: DocChaseRequestSummary | undefined;
  onClose: () => void;
  onStatusChange?: (id: string, status: "received" | "cancelled") => void;
  onForceSent?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!request) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed inset-y-0 right-0 z-40 w-[520px] bg-background border-l border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="shrink-0 flex items-start justify-between px-6 py-4 border-b border-border"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-text-primary leading-tight">
              {request.client_name}
            </div>
            <div className="text-[12px] mt-1 flex items-center gap-2 flex-wrap">
              <span style={{ color: "var(--text-secondary)" }}>{request.document_type}</span>
              <span
                className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {request.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors ml-4 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <ChaseRow
            chase={request}
            onForceSent={onForceSent}
            onStatusChange={onStatusChange}
            showHistory={true}
          />
        </div>
      </div>
    </>
  );
}

// ── Create Drawer ─────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  extra?: { doc_chase_cadence?: [number, number, number, number] } | null;
}

interface Policy {
  id: string;
  policy_name: string;
  client_name: string;
}

interface CreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onCreated: () => void;
  policies?: Policy[];
}

function CreateDrawer({ open, onClose, onSuccess, onError, onCreated, policies: policiesProp = [] }: CreateDrawerProps) {
  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    document_type: DOCUMENT_TYPES[0] as string,
    document_type_other: "",
    policy_id: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ client_name?: string; client_email?: string }>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdown, setClientDropdown] = useState(false);
  const [clientLocked, setClientLocked] = useState(false); // true once auto-populated from a known client
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [savedCadence, setSavedCadence] = useState<[number, number, number, number] | null>(null);
  const [touchDelays, setTouchDelays] = useState<[number, number, number, number]>([0, 5, 10, 20]);
  const policies = policiesProp;
  const [policySearch, setPolicySearch] = useState("");
  const [policyDropdown, setPolicyDropdown] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Fetch clients when drawer opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setClients(d); })
      .catch(() => {});
  }, [open]);

  // Focus first input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => firstInputRef.current?.focus(), 80);
    } else {
      setForm({
        client_name: "",
        client_email: "",
        client_phone: "",
        document_type: DOCUMENT_TYPES[0],
        document_type_other: "",
        policy_id: "",
        notes: "",
      });
      setClientSearch("");
      setClientLocked(false);
      setSelectedClientId(null);
      setSavedCadence(null);
      setTouchDelays([0, 5, 10, 20]);
      setPolicySearch("");
    }
  }, [open]);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredPolicies = policies.filter(
    (p) =>
      p.policy_name.toLowerCase().includes(policySearch.toLowerCase()) ||
      p.client_name.toLowerCase().includes(policySearch.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: { client_name?: string; client_email?: string } = {};
    if (!form.client_name.trim()) errors.client_name = "Client Name is required.";
    if (!form.client_email.trim()) errors.client_email = "Client Email is required.";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSubmitting(true);
    const resolvedDocType =
      form.document_type === "Other (specify)"
        ? form.document_type_other.trim() || "Other"
        : form.document_type;

    try {
      const res = await fetch("/api/doc-chase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: form.client_name.trim(),
          client_email: form.client_email.trim(),
          client_phone: form.client_phone.trim() || undefined,
          document_type: resolvedDocType,
          policy_id: form.policy_id || undefined,
          notes: form.notes.trim() || undefined,
          touch_delays: touchDelays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Failed to create request");
      } else {
        // Save the cadence as this client's preference (fire-and-forget)
        if (selectedClientId) {
          fetch(`/api/clients/${selectedClientId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doc_chase_cadence: touchDelays }),
          }).catch(() => {});
        }
        onSuccess("Sequence started — 4 touches scheduled");
        onCreated();
        onClose();
      }
    } catch {
      onError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-40 w-[480px] bg-background border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-[56px] border-b border-border shrink-0">
          <span className="text-[15px] font-semibold text-text-primary">
            Request Document
          </span>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Client Name — typeahead from client list */}
          <div className="relative">
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Client Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <input
                ref={firstInputRef}
                type="text"
                value={clientSearch || form.client_name}
                onChange={(e) => {
                  const v = e.target.value;
                  setClientSearch(v);
                  setForm((f) => ({ ...f, client_name: v }));
                  setClientLocked(false);
                  setClientDropdown(true);
                  if (v.trim()) setFormErrors((prev) => ({ ...prev, client_name: undefined }));
                }}
                onFocus={() => setClientDropdown(true)}
                onBlur={() => setTimeout(() => setClientDropdown(false), 150)}
                placeholder="Search clients…"
                className={`w-full h-9 pl-8 pr-3 rounded-md bg-surface border text-[13px] text-text-primary placeholder-zinc-600 outline-none focus:border-text-secondary transition-colors ${
                  formErrors.client_name ? "border-red-500/60" : "border-border"
                }`}
              />
              {clientLocked && (
                <button
                  type="button"
                  onMouseDown={() => {
                    setClientSearch("");
                    setClientLocked(false);
                    setSelectedClientId(null);
                    setSavedCadence(null);
                    setTouchDelays([0, 5, 10, 20]);
                    setForm((f) => ({ ...f, client_name: "", client_email: "", client_phone: "" }));
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  title="Clear client"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {clientDropdown && filteredClients.length > 0 && !clientLocked && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-md bg-surface border border-border shadow-xl max-h-48 overflow-y-auto">
                {filteredClients.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => {
                      setForm((f) => ({
                        ...f,
                        client_name: c.name,
                        client_email: c.email ?? f.client_email,
                        client_phone: c.phone ?? f.client_phone,
                      }));
                      setClientSearch(c.name);
                      setClientLocked(true);
                      setClientDropdown(false);
                      setSelectedClientId(c.id);
                      setFormErrors((prev) => ({ ...prev, client_name: undefined }));
                      const cad = c.extra?.doc_chase_cadence ?? null;
                      setSavedCadence(cad);
                      setTouchDelays(cad ?? [0, 5, 10, 20]);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-hover-overlay transition-colors"
                  >
                    <div className="text-[13px] font-medium text-text-primary">{c.name}</div>
                    {(c.email || c.phone) && (
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {c.email}{c.email && c.phone ? " · " : ""}{c.phone}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {formErrors.client_name && (
              <p className="text-[11px] text-red-400 mt-1">{formErrors.client_name}</p>
            )}
          </div>

          {/* Client Email — auto-populated when client is selected */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Client Email <span className="text-red-500">*</span>
              {clientLocked && form.client_email && (
                <span className="ml-2 text-text-tertiary font-normal normal-case">auto-filled</span>
              )}
            </label>
            <input
              type="email"
              value={form.client_email}
              onChange={(e) => {
                setForm((f) => ({ ...f, client_email: e.target.value }));
                if (e.target.value.trim()) setFormErrors((prev) => ({ ...prev, client_email: undefined }));
              }}
              placeholder="client@example.com"
              className={`w-full h-9 px-3 rounded-md bg-surface border text-[13px] text-text-primary placeholder-zinc-600 outline-none focus:border-text-secondary transition-colors ${
                formErrors.client_email ? "border-red-500/60" : "border-border"
              }`}
            />
            {formErrors.client_email && (
              <p className="text-[11px] text-red-400 mt-1">{formErrors.client_email}</p>
            )}
          </div>

          {/* Client Phone — auto-populated when client is selected */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Client Phone <span className="text-text-tertiary">(optional)</span>
              {clientLocked && form.client_phone && (
                <span className="ml-2 text-text-tertiary font-normal">auto-filled</span>
              )}
            </label>
            <input
              type="tel"
              value={form.client_phone}
              onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))}
              placeholder="+61 412 345 678"
              className="w-full h-9 px-3 rounded-md bg-surface border border-border text-[13px] text-text-primary placeholder-zinc-600 outline-none focus:border-text-secondary transition-colors"
            />
          </div>

          {/* Document Type */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Document Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.document_type}
              onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}
              className="w-full h-9 px-3 rounded-md bg-surface border border-border text-[13px] text-text-primary outline-none focus:border-text-secondary transition-colors"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>

          {/* Other document type text field */}
          {form.document_type === "Other (specify)" && (
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                Specify Document <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.document_type_other}
                onChange={(e) =>
                  setForm((f) => ({ ...f, document_type_other: e.target.value }))
                }
                placeholder="e.g. Subcontractor Agreement"
                className="w-full h-9 px-3 rounded-md bg-surface border border-border text-[13px] text-text-primary placeholder-zinc-600 outline-none focus:border-text-secondary transition-colors"
              />
            </div>
          )}

          {/* Policy (typeahead) */}
          <div className="relative">
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Linked Policy <span className="text-text-tertiary">(optional)</span>
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={policySearch}
                onChange={(e) => {
                  setPolicySearch(e.target.value);
                  setPolicyDropdown(true);
                  if (!e.target.value) setForm((f) => ({ ...f, policy_id: "" }));
                }}
                onFocus={() => setPolicyDropdown(true)}
                onBlur={() => setTimeout(() => setPolicyDropdown(false), 150)}
                placeholder="Search policies…"
                className="w-full h-9 pl-8 pr-3 rounded-md bg-surface border border-border text-[13px] text-text-primary placeholder-zinc-600 outline-none focus:border-text-secondary transition-colors"
              />
            </div>
            {policyDropdown && filteredPolicies.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-md bg-surface border border-border shadow-xl max-h-40 overflow-y-auto">
                {filteredPolicies.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => {
                      setForm((f) => ({ ...f, policy_id: p.id }));
                      setPolicySearch(`${p.policy_name} — ${p.client_name}`);
                      setPolicyDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-text-primary hover:bg-hover-overlay transition-colors"
                  >
                    <span className="text-text-primary font-medium">{p.policy_name}</span>
                    <span className="text-text-secondary ml-2">{p.client_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Context for Hollis <span className="text-text-tertiary">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. 'Long-term client, tends to delay until the last minute' or 'Shopping around this year — keep it warm.' The more context, the better the emails."
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-surface border border-border text-[13px] text-text-primary placeholder-zinc-600 outline-none focus:border-text-secondary resize-none transition-colors"
            />
          </div>

          {/* Send schedule */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-medium text-text-secondary">
                Send schedule <span className="text-text-tertiary font-normal">(days from today)</span>
              </label>
              {savedCadence && (
                <span className="text-[11px] text-text-tertiary">saved preference</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["Touch 1", "Touch 2", "Touch 3", "Touch 4"] as const).map((label, i) => (
                <div key={i}>
                  <div className="text-[11px] text-text-secondary mb-1 text-center">{label}</div>
                  <input
                    type="number"
                    min={i === 0 ? 0 : touchDelays[i - 1]}
                    value={touchDelays[i]}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setTouchDelays((prev) => {
                        const next: [number, number, number, number] = [...prev] as [number, number, number, number];
                        next[i] = val;
                        // Enforce non-decreasing
                        for (let j = i + 1; j < 4; j++) {
                          if (next[j] < next[j - 1]) next[j] = next[j - 1];
                        }
                        return next;
                      });
                    }}
                    className="w-full h-9 px-2 rounded-md bg-surface border border-border text-[13px] text-text-primary text-center outline-none focus:border-text-secondary transition-colors tabular-nums"
                  />
                </div>
              ))}
            </div>
            {/* Send date preview */}
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
              {touchDelays.map((d, i) => {
                const date = new Date();
                date.setDate(date.getDate() + d);
                const label = date.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
                return (
                  <span key={i} className="text-[11px] text-text-tertiary whitespace-nowrap flex items-center gap-1.5">
                    {i > 0 && <span style={{ color: "var(--border)" }}>→</span>}
                    {label}
                  </span>
                );
              })}
            </div>
            <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
              Touch 3 upgrades to SMS if a phone number is provided. Touch 4 is a call script — no auto-send.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md border border-border text-[13px] text-text-secondary hover:text-text-primary hover:border-border transition-colors"
          >
            Cancel
          </button>
          <button
            form="__unused"
            type="submit"
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault();
              // Trigger form submit via synthetic submit on the form element
              const form_el = (e.target as HTMLElement)
                .closest(".fixed")
                ?.querySelector("form");
              form_el?.dispatchEvent(
                new Event("submit", { cancelable: true, bubbles: true })
              );
            }}
            className="h-9 px-5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Drafting sequence…
              </>
            ) : (
              "Start Sequence"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  // ── Store integration ──────────────────────────────────────────────────────
  // useHollisData subscribes this component to the global store and triggers
  // a fetch if data is missing or stale.
  const { docChaseRequests, policies: storePolicies, loading: storeLoading, lastFetched: storeFetched, refetch, backgroundRefreshing } = useHollisData();

  // Lazy-initialise from store (gives instant data on back-navigation).
  const [requests, setRequests] = useState<DocChaseRequestSummary[]>(
    () => useHollisStore.getState().docChaseRequests
  );
  const [loading, setLoading] = useState(
    () => useHollisStore.getState().docChaseRequests.length === 0 && !useHollisStore.getState().lastFetched
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Tab + search state
  const [view, setView] = useState<"active" | "received" | "cancelled">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Phone script modal
  const [phoneScriptRequestId, setPhoneScriptRequestId] = useState<string | null>(null);

  // Detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);

  // Confirm state: { id, action }
  const [confirm, setConfirm] = useState<{
    id: string;
    action: "received" | "cancelled";
    client_name: string;
    document_type: string;
  } | null>(null);

  // Optimistic status updates (id → status)
  const [optimisticStatus, setOptimisticStatus] = useState<
    Record<string, DocChaseRequestStatus>
  >({});

  const pushToast = useCallback(
    (message: string, type: Toast["type"] = "success") => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync local requests state whenever the store updates (initial load or
  // background refresh). This replaces the old mount-time API fetch.
  useEffect(() => {
    setRequests(docChaseRequests);
    if (storeFetched) setLoading(false);
  }, [docChaseRequests, storeFetched]);

  // Fallback: if the store hasn't loaded yet on first mount, fetch directly.
  // (Handles the rare case where this page is the very first page visited.)
  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/doc-chase");
      const data = await res.json();
      if (res.ok && Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!useHollisStore.getState().lastFetched && !storeLoading) {
      fetchRequests();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(
    id: string,
    status: DocChaseRequestStatus
  ) {
    // Optimistic update
    setOptimisticStatus((prev) => ({ ...prev, [id]: status }));
    setConfirm(null);

    try {
      const res = await fetch(`/api/doc-chase/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Revert optimistic update
        setOptimisticStatus((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        pushToast(data.error ?? "Update failed", "error");
      } else {
        pushToast(
          status === "received"
            ? "Document marked as received — follow-ups cancelled"
            : "Request cancelled"
        );
        // Refresh list and keep the global store in sync
        fetchRequests();
        refetch();
      }
    } catch {
      setOptimisticStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      pushToast("Network error — please try again", "error");
    }
  }

  // ── Derived stats ────────────────────────────────────────────

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const activeCount = requests.filter((r) => {
    const eff = optimisticStatus[r.id] ?? r.status;
    return eff === "pending" || eff === "active";
  }).length;

  const receivedThisMonth = requests.filter((r) => {
    const eff = optimisticStatus[r.id] ?? r.status;
    return (
      eff === "received" &&
      r.received_at &&
      new Date(r.received_at) >= startOfMonth
    );
  }).length;

  const overdueCount = requests.filter((r) => {
    const eff = optimisticStatus[r.id] ?? r.status;
    return eff === "active" && r.touches_sent >= r.touches_total;
  }).length;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background text-text-primary">

      {/* Header */}
      <div className="h-[56px] shrink-0 flex items-center justify-end px-16">
        <div className="flex items-center gap-3">
          {backgroundRefreshing && (
            <span className="w-1.5 h-1.5 rounded-full bg-text-primary/40 animate-pulse shrink-0" title="Syncing…" />
          )}
          <button
            onClick={() => setDrawerOpen(true)}
            className="h-10 px-5 flex items-center gap-1.5 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity shadow-[0_0_20px_rgba(0,212,170,0.25),0_0_6px_rgba(0,212,170,0.15)]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Request Document
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div
        className="flex items-stretch justify-around shrink-0"
        style={{ borderBottom: "1px solid var(--surface-raised)", paddingTop: 8, paddingBottom: 8, marginTop: -21 }}
      >
        <div className="flex flex-col gap-1 items-center justify-center">
          <div style={{ fontFamily: "var(--font-display)", fontSize: 35, fontWeight: 700, lineHeight: 1, color: "var(--text-primary)" }}>
            {loading ? "—" : activeCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Active
          </div>
        </div>
        <div className="flex flex-col gap-1 items-center justify-center">
          <div style={{ fontFamily: "var(--font-display)", fontSize: 35, fontWeight: 700, lineHeight: 1, color: "var(--text-primary)" }}>
            {loading ? "—" : receivedThisMonth}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Received This Month
          </div>
        </div>
        <div className="flex flex-col gap-1 items-center justify-center">
          <div style={{ fontFamily: "var(--font-display)", fontSize: 35, fontWeight: 700, lineHeight: 1, color: overdueCount > 0 ? "var(--danger)" : "var(--text-secondary)" }}>
            {loading ? "—" : overdueCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Overdue
          </div>
        </div>
      </div>

      {/* Search + Tabs bar */}
      {(() => {
        const tabs: { id: "active" | "received" | "cancelled"; label: string; count: number }[] = [
          { id: "active",    label: "Active",    count: requests.filter(r => ["pending","active"].includes(optimisticStatus[r.id] ?? r.status)).length },
          { id: "received",  label: "Received",  count: requests.filter(r => (optimisticStatus[r.id] ?? r.status) === "received").length },
          { id: "cancelled", label: "Cancelled", count: requests.filter(r => (optimisticStatus[r.id] ?? r.status) === "cancelled").length },
        ];
        return (
          <div
            className="shrink-0 px-14 py-3 flex items-center gap-6"
            style={{ height: 60, borderBottom: "none", marginTop: 21 }}
          >
            <div
              className="flex items-center gap-3 px-4 rounded-xl transition-all duration-200 flex-shrink-0"
              style={{ width: 280, height: 44, background: "var(--background)", border: "1px solid var(--border)" }}
              onClick={() => searchRef.current?.focus()}
            >
              <Search size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setSearchQuery(""); }}
                placeholder="Search or filter"
                className="flex-1 bg-transparent outline-none placeholder-text-secondary"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-secondary)" }}
              />
              {searchQuery && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSearchQuery(""); }}
                  style={{ color: "var(--text-secondary)", lineHeight: 1 }}
                  className="text-[11px] shrink-0 hover:text-text-secondary transition-colors"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex-1" />
            <div
              className="flex items-center gap-2 px-2 rounded-lg flex-shrink-0"
              style={{ background: "var(--surface-raised)", height: 40 }}
            >
              {tabs.map((tab) => {
                const isActive = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-all rounded-md"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      background: isActive ? "var(--background)" : "transparent",
                      border: isActive ? "1px solid var(--border)" : "none",
                    }}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span
                        className="tabular-nums"
                        style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isActive ? "var(--text-secondary)" : "var(--text-tertiary)" }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Table */}
      {(() => {
        const rows = requests
          .filter((r) => {
            const eff = optimisticStatus[r.id] ?? r.status;
            if (view === "active") return eff === "pending" || eff === "active";
            if (view === "received") return eff === "received";
            return eff === "cancelled";
          })
          .filter((r) => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return r.client_name.toLowerCase().includes(q) || r.document_type.toLowerCase().includes(q);
          });

        return (
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-text-tertiary" />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState onRequest={() => setDrawerOpen(true)} />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-5" style={{ background: "var(--surface)" }}>
              <Plus size={20} style={{ color: "var(--border)" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              Nothing here
            </div>
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 6, maxWidth: 300, lineHeight: 1.6 }}>
              {searchQuery ? "No requests match your search." : `No ${view} requests.`}
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border">
                <th className="px-10 py-3 text-left text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Document
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Touches
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Last Contact
                </th>
                <th className="px-10 py-3 text-left text-[11px] font-medium text-text-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((req) => {
                const effectiveStatus: DocChaseRequestStatus =
                  optimisticStatus[req.id] ?? req.status;
                const isConfirming = confirm?.id === req.id;
                const isActive = effectiveStatus === "active";
                const isOverdue =
                  isActive && req.touches_sent >= 4;

                return (
                  <tr
                    key={req.id}
                    onClick={() => setDetailId(req.id)}
                    className={`border-b border-border/60 hover:bg-white/[0.015] transition-colors cursor-pointer ${
                      isOverdue ? "bg-red-950/[0.06]" : ""
                    }`}
                  >
                    {/* Client */}
                    <td className="px-10 py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-medium text-text-primary leading-snug">
                          {req.client_name}
                        </span>
                        {(req as { escalation_level?: string }).escalation_level === "phone_script" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-border text-text-secondary border border-border">
                            📞 Call ready
                          </span>
                        )}
                        {req.last_client_reply && (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-950/40 text-amber-400 border border-amber-800/30 cursor-default"
                            title={req.last_client_reply}
                          >
                            <MessageSquare size={10} />
                            Client replied
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-text-secondary mt-0.5">
                        {req.client_email}
                      </div>
                      {req.last_client_reply && (
                        <div className="text-[11px] text-text-secondary mt-1 max-w-[220px] truncate" title={req.last_client_reply}>
                          {req.last_client_reply}
                        </div>
                      )}
                    </td>

                    {/* Document type */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-text-tertiary shrink-0" />
                        <span className="text-[13px] text-text-primary">
                          {req.document_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-0.5">
                        {formatDate(req.created_at)}
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[effectiveStatus]}`}
                      >
                        {STATUS_LABELS[effectiveStatus]}
                      </span>
                      {effectiveStatus === "received" && req.received_at && (
                        <div className="text-[11px] text-text-tertiary mt-0.5">
                          {formatDate(req.received_at)}
                        </div>
                      )}
                    </td>

                    {/* Touches sent */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                i < req.touches_sent
                                  ? "bg-text-primary"
                                  : "bg-border"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[12px] text-text-secondary tabular-nums">
                          {req.touches_sent} / {req.touches_total}
                        </span>
                      </div>
                    </td>

                    {/* Last contact */}
                    <td className="px-4 py-3.5">
                      <span className="text-[12px] text-text-secondary">
                        {req.last_contact ? timeAgo(req.last_contact) : "—"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-10 py-3.5">
                      {isConfirming ? (
                        // Inline confirmation
                        <div className="flex flex-col gap-2">
                          <p className="text-[12px] text-text-secondary leading-snug max-w-[220px]">
                            Mark{" "}
                            <span className="text-text-primary font-medium">
                              {confirm.document_type}
                            </span>{" "}
                            from{" "}
                            <span className="text-text-primary font-medium">
                              {confirm.client_name}
                            </span>{" "}
                            as{" "}
                            {confirm.action === "received" ? "received" : "cancelled"}?
                            {confirm.action === "received" && (
                              <span className="text-text-secondary">
                                {" "}This will cancel all pending follow-ups.
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleStatusChange(req.id, confirm.action)
                              }
                              className={`h-7 px-3 text-[12px] font-semibold rounded-md transition-colors ${
                                confirm.action === "received"
                                  ? "bg-hover-overlay text-text-primary hover:bg-hover-overlay border border-border"
                                  : "bg-border text-text-secondary hover:bg-border border border-border"
                              }`}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirm(null)}
                              className="h-7 px-3 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {(req as { escalation_level?: string }).escalation_level === "phone_script" && (
                            <button
                              onClick={() => setPhoneScriptRequestId(req.id)}
                              className="h-7 px-2.5 flex items-center gap-1.5 text-[12px] font-medium rounded-md bg-border text-text-secondary border border-border hover:bg-border transition-colors"
                            >
                              <Phone size={12} />
                              View Script
                            </button>
                          )}
                          {isActive && (
                            <>
                              <button
                                onClick={() =>
                                  setConfirm({
                                    id: req.id,
                                    action: "received",
                                    client_name: req.client_name,
                                    document_type: req.document_type,
                                  })
                                }
                                className="h-7 px-2.5 text-[12px] font-medium rounded-md bg-hover-overlay text-text-primary border border-border hover:bg-hover-overlay transition-colors"
                              >
                                Mark Received
                              </button>
                              <button
                                onClick={() =>
                                  setConfirm({
                                    id: req.id,
                                    action: "cancelled",
                                    client_name: req.client_name,
                                    document_type: req.document_type,
                                  })
                                }
                                className="h-7 px-2.5 text-[12px] rounded-md text-text-tertiary border border-border hover:text-text-secondary hover:border-text-tertiary transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {!isActive && (
                            <span className="text-[12px] text-text-tertiary">—</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      );
      })()}

      {/* Create Drawer */}
      <CreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={(msg) => pushToast(msg, "success")}
        onError={(msg) => pushToast(msg, "error")}
        onCreated={() => { fetchRequests(); refetch(); }}
        policies={storePolicies}
      />

      {/* Chase Detail Drawer */}
      <ChaseDetailDrawer
        request={requests.find((r) => r.id === detailId)}
        onClose={() => setDetailId(null)}
        onStatusChange={handleStatusChange}
        onForceSent={() => {
          fetchRequests();
          refetch();
          setDetailId(null);
        }}
      />

      {/* Phone script modal */}
      <PhoneScriptModal
        requestId={phoneScriptRequestId ?? ""}
        open={!!phoneScriptRequestId}
        onClose={() => setPhoneScriptRequestId(null)}
        onMarkedCalled={() => {
          fetchRequests();
          refetch();
          pushToast("Document marked as received", "success");
        }}
      />

      {/* Toast stack */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onRequest }: { onRequest: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center mb-4">
        <FileText size={22} className="text-text-tertiary" />
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary mb-1">
        No document requests yet
      </h2>
      <p className="text-[13px] text-text-tertiary max-w-xs mb-6">
        When you need a signed application, loss runs, or any other document
        from a client, Hollis will send a 4-touch follow-up sequence automatically.
      </p>
      <button
        onClick={onRequest}
        className="h-9 px-5 flex items-center gap-2 rounded-md bg-text-primary text-text-inverse text-[13px] font-semibold hover:opacity-80 transition-opacity"
      >
        <Plus size={14} />
        Request your first document
      </button>
    </div>
  );
}
