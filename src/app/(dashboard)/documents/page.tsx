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

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Search,
} from "lucide-react";
import { DOCUMENT_TYPES } from "@/types/doc-chase";
import type { DocChaseRequestSummary, DocChaseRequestStatus } from "@/types/doc-chase";
import { useHollisData } from "@/hooks/useHollisData";
import { useHollisStore } from "@/stores/hollisStore";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<DocChaseRequestStatus, string> = {
  pending:   "text-zinc-400 bg-zinc-800/60 border-zinc-700/50",
  active:    "text-[#00d4aa] bg-[#00d4aa]/10 border-[#00d4aa]/25",
  received:  "text-emerald-400 bg-emerald-900/20 border-emerald-700/30",
  cancelled: "text-zinc-600 bg-zinc-900/40 border-zinc-800/40",
};

const STATUS_LABELS: Record<DocChaseRequestStatus, string> = {
  pending:   "Pending",
  active:    "Active",
  received:  "Received",
  cancelled: "Cancelled",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
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
              ? "bg-[#0d0d12] border-[#00d4aa]/30 text-[#f5f5f7]"
              : "bg-[#0d0d12] border-red-800/40 text-red-400"
          }`}
        >
          {t.type === "success" ? (
            <CheckCircle2 size={15} className="text-[#00d4aa] shrink-0" />
          ) : (
            <AlertCircle size={15} className="text-red-400 shrink-0" />
          )}
          {t.message}
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Create Drawer ─────────────────────────────────────────────────────────────

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
}

function CreateDrawer({ open, onClose, onSuccess, onError, onCreated }: CreateDrawerProps) {
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
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const [policyDropdown, setPolicyDropdown] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Fetch policies for the typeahead
  useEffect(() => {
    if (!open) return;
    fetch("/api/policies?limit=200")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.policies)) setPolicies(d.policies);
        else if (Array.isArray(d)) setPolicies(d);
      })
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
      setPolicySearch("");
    }
  }, [open]);

  const filteredPolicies = policies.filter(
    (p) =>
      p.policy_name.toLowerCase().includes(policySearch.toLowerCase()) ||
      p.client_name.toLowerCase().includes(policySearch.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim() || !form.client_email.trim()) return;

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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Failed to create request");
      } else {
        onSuccess("Sequence started — 4 emails scheduled");
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
      <div className="fixed inset-y-0 right-0 z-40 w-[480px] bg-[#0d0d12] border-l border-[#1e1e2a] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-[56px] border-b border-[#1e1e2a] shrink-0">
          <span className="text-[15px] font-semibold text-[#f5f5f7]">
            Request Document
          </span>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Client Name */}
          <div>
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
              Client Name <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              required
              value={form.client_name}
              onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
              placeholder="Acme Corp"
              className="w-full h-9 px-3 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] placeholder-zinc-600 outline-none focus:border-[#00d4aa]/50 transition-colors"
            />
          </div>

          {/* Client Email */}
          <div>
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
              Client Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={form.client_email}
              onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
              placeholder="client@example.com"
              className="w-full h-9 px-3 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] placeholder-zinc-600 outline-none focus:border-[#00d4aa]/50 transition-colors"
            />
          </div>

          {/* Client Phone */}
          <div>
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
              Client Phone <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              type="tel"
              value={form.client_phone}
              onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))}
              placeholder="+61 412 345 678"
              className="w-full h-9 px-3 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] placeholder-zinc-600 outline-none focus:border-[#00d4aa]/50 transition-colors"
            />
          </div>

          {/* Document Type */}
          <div>
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
              Document Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.document_type}
              onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}
              className="w-full h-9 px-3 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 transition-colors"
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>

          {/* Other document type text field */}
          {form.document_type === "Other (specify)" && (
            <div>
              <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
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
                className="w-full h-9 px-3 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] placeholder-zinc-600 outline-none focus:border-[#00d4aa]/50 transition-colors"
              />
            </div>
          )}

          {/* Policy (typeahead) */}
          <div className="relative">
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
              Linked Policy <span className="text-zinc-600">(optional)</span>
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
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
                className="w-full h-9 pl-8 pr-3 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] placeholder-zinc-600 outline-none focus:border-[#00d4aa]/50 transition-colors"
              />
            </div>
            {policyDropdown && filteredPolicies.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-md bg-[#111118] border border-[#1e1e2a] shadow-xl max-h-40 overflow-y-auto">
                {filteredPolicies.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => {
                      setForm((f) => ({ ...f, policy_id: p.id }));
                      setPolicySearch(`${p.policy_name} — ${p.client_name}`);
                      setPolicyDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] text-[#c5c5cb] hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-[#f5f5f7] font-medium">{p.policy_name}</span>
                    <span className="text-zinc-500 ml-2">{p.client_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">
              Notes <span className="text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any context for the email sequence…"
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-[#111118] border border-[#1e1e2a] text-[13px] text-[#f5f5f7] placeholder-zinc-600 outline-none focus:border-[#00d4aa]/50 resize-none transition-colors"
            />
          </div>

          {/* Info banner */}
          <div className="rounded-lg bg-[#00d4aa]/[0.05] border border-[#00d4aa]/15 px-4 py-3">
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              Hollis will use AI to draft a 4-email follow-up sequence and schedule
              them at days 0, 5, 10, and 20. You&apos;ll be notified when the document
              is marked as received.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1e1e2a] shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md border border-[#1e1e2a] text-[13px] text-zinc-400 hover:text-[#f5f5f7] hover:border-[#2e2e3a] transition-colors"
          >
            Cancel
          </button>
          <button
            form="__unused"
            type="submit"
            disabled={submitting || !form.client_name.trim() || !form.client_email.trim()}
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
            className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
  const { docChaseRequests, loading: storeLoading, lastFetched: storeFetched, refetch, backgroundRefreshing } = useHollisData();

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
    return eff === "active";
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
    return eff === "active" && r.touches_sent >= 4;
  }).length;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0d0d12] text-[#f5f5f7]">

      {/* Header */}
      <header className="h-[56px] shrink-0 border-b border-[#1e1e2a] flex items-center justify-between px-10">
        <div className="flex items-center gap-2 text-[13px] text-[#8a8b91]">
          <span>Hollis</span>
          <ChevronRight size={12} />
          <span className="text-[#f5f5f7]">Documents</span>
        </div>
        <div className="flex items-center gap-3">
          {backgroundRefreshing && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d4aa]/40 animate-pulse shrink-0" title="Syncing…" />
          )}
          <button
            onClick={() => setDrawerOpen(true)}
            className="h-8 px-4 flex items-center gap-1.5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors shadow-[0_0_20px_rgba(0,212,170,0.25),0_0_6px_rgba(0,212,170,0.15)]"
          >
            <Plus size={13} strokeWidth={2.5} />
            Request Document
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <div className="flex items-center gap-0 px-10 py-8 border-b border-[#252530] shrink-0">
        <div className="pr-10">
          <div className="text-[32px] font-bold text-[#00d4aa] leading-none">
            {loading ? "—" : activeCount}
          </div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Active Requests</div>
        </div>
        <div className="px-10 border-l border-[#1e1e2a]">
          <div className="text-[32px] font-bold text-emerald-400 leading-none">
            {loading ? "—" : receivedThisMonth}
          </div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Received This Month</div>
        </div>
        <div className="px-10 border-l border-[#1e1e2a]">
          <div
            className={`text-[32px] font-bold leading-none ${
              overdueCount > 0 ? "text-red-400" : "text-zinc-600"
            }`}
          >
            {loading ? "—" : overdueCount}
          </div>
          <div className="text-[12px] text-[#8a8b91] mt-1.5">Overdue</div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-zinc-600" />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState onRequest={() => setDrawerOpen(true)} />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-[#0d0d12] z-10">
              <tr className="border-b border-[#1e1e2a]">
                <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
                  Document
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
                  Touches
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
                  Last Contact
                </th>
                <th className="px-10 py-3 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const effectiveStatus: DocChaseRequestStatus =
                  optimisticStatus[req.id] ?? req.status;
                const isConfirming = confirm?.id === req.id;
                const isActive = effectiveStatus === "active";
                const isOverdue =
                  isActive && req.touches_sent >= 4;

                return (
                  <tr
                    key={req.id}
                    className={`border-b border-[#1e1e2a]/60 hover:bg-white/[0.015] transition-colors ${
                      isOverdue ? "bg-red-950/[0.06]" : ""
                    }`}
                  >
                    {/* Client */}
                    <td className="px-10 py-3.5">
                      <div className="text-[14px] font-medium text-[#f5f5f7] leading-snug">
                        {req.client_name}
                      </div>
                      <div className="text-[12px] text-zinc-500 mt-0.5">
                        {req.client_email}
                      </div>
                    </td>

                    {/* Document type */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-zinc-600 shrink-0" />
                        <span className="text-[13px] text-[#c5c5cb]">
                          {req.document_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-700 mt-0.5">
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
                        <div className="text-[11px] text-zinc-700 mt-0.5">
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
                                  ? "bg-[#00d4aa]"
                                  : "bg-zinc-800"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[12px] text-zinc-500 tabular-nums">
                          {req.touches_sent} / {req.touches_total}
                        </span>
                      </div>
                    </td>

                    {/* Last contact */}
                    <td className="px-4 py-3.5">
                      <span className="text-[12px] text-zinc-500">
                        {req.last_contact ? timeAgo(req.last_contact) : "—"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-10 py-3.5">
                      {isConfirming ? (
                        // Inline confirmation
                        <div className="flex flex-col gap-2">
                          <p className="text-[12px] text-zinc-400 leading-snug max-w-[220px]">
                            Mark{" "}
                            <span className="text-[#f5f5f7] font-medium">
                              {confirm.document_type}
                            </span>{" "}
                            from{" "}
                            <span className="text-[#f5f5f7] font-medium">
                              {confirm.client_name}
                            </span>{" "}
                            as{" "}
                            {confirm.action === "received" ? "received" : "cancelled"}?
                            {confirm.action === "received" && (
                              <span className="text-zinc-500">
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
                                  ? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-700/40"
                                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 border border-zinc-700/50"
                              }`}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirm(null)}
                              className="h-7 px-3 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
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
                                className="h-7 px-2.5 text-[12px] font-medium rounded-md bg-emerald-900/20 text-emerald-400 border border-emerald-800/30 hover:bg-emerald-900/40 transition-colors"
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
                                className="h-7 px-2.5 text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {!isActive && (
                            <span className="text-[12px] text-zinc-700">—</span>
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

      {/* Create Drawer */}
      <CreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={(msg) => pushToast(msg, "success")}
        onError={(msg) => pushToast(msg, "error")}
        onCreated={() => { fetchRequests(); refetch(); }}
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
      <div className="w-14 h-14 rounded-full bg-[#111118] border border-[#1e1e2a] flex items-center justify-center mb-4">
        <FileText size={22} className="text-[#3a3a42]" />
      </div>
      <h2 className="text-[16px] font-semibold text-[#f5f5f7] mb-1">
        No document requests yet
      </h2>
      <p className="text-[13px] text-[#505057] max-w-xs mb-6">
        When you need a signed application, loss runs, or any other document
        from a client, Hollis will send a 4-touch follow-up sequence automatically.
      </p>
      <button
        onClick={onRequest}
        className="h-9 px-5 flex items-center gap-2 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
      >
        <Plus size={14} />
        Request your first document
      </button>
    </div>
  );
}
