"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  Search,
  Minus,
  Trash2,
  ArrowUp,
  ArrowRight,
  Check,
  Paperclip,
  RotateCcw,
  X,
  Loader2,
  FileText,
  Shield,
  Users,
  ShieldCheck,
  FolderOpen,
  Inbox,
} from "lucide-react";
import type { AssistantMessage, AssistantAction, AssistantPage } from "@/types/assistant";
import type { SearchResult, SearchResponse } from "@/lib/search-types";
import {
  SEARCH_DISPLAY_ORDER,
  SUGGESTED_SEARCH_QUERIES,
} from "@/lib/search-types";
import { useUnifiedPanel } from "@/contexts/UnifiedPanelContext";
import { useHollisStore } from "@/stores/hollisStore";
import { SearchResultActions } from "@/components/search/SearchResultActions";

// ── Builds a page-aware, trimmed dataContext snapshot from the Zustand store ──
// Mirrors the shape that gatherContextData() returns server-side so the system
// prompt stays small regardless of how many rows are in the cache.

function fmtCtxDate(s: string | null | undefined): string {
  if (!s) return "unknown";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildClientDataContext(
  page: AssistantPage
): { data: Record<string, unknown>; lastFetched: number } | undefined {
  const {
    lastFetched,
    policies,
    clients,
    coiRequests,
    certificates,
    docChaseRequests,
    outboxDrafts,
  } = useHollisStore.getState();

  if (!lastFetched) return undefined;

  const today = new Date().toISOString().split("T")[0];
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  let data: Record<string, unknown>;

  switch (page) {
    case "renewals":
      data = {
        policies: policies.slice(0, 20).map((p) => ({
          id: p.id,
          client: p.client_name,
          policy: p.policy_name,
          carrier: p.carrier,
          expiresOn: fmtCtxDate(p.expiration_date),
          premium: p.premium ? `$${Number(p.premium).toLocaleString()}` : null,
          stage: p.campaign_stage,
        })),
      };
      break;

    case "certificates": {
      type CertLike = {
        id: string;
        insured_name?: string | null;
        holder_name?: string | null;
        status?: string | null;
        expiration_date?: string | null;
        has_gap?: boolean | null;
        certificate_number?: string | null;
      };
      data = {
        certificates: (certificates as CertLike[]).slice(0, 20).map((c) => ({
          id: c.id,
          insured: c.insured_name,
          holder: c.holder_name,
          status: c.status,
          expiresOn: fmtCtxDate(c.expiration_date),
          hasGap: c.has_gap,
          number: c.certificate_number,
        })),
      };
      break;
    }

    case "clients":
      data = {
        clients: clients.slice(0, 20).map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          businessType: c.business_type,
          industry: c.industry,
        })),
      };
      break;

    case "documents": {
      const reqs = docChaseRequests.slice(0, 20);
      const counts = reqs.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {});
      data = {
        documentRequests: reqs.map((r) => ({
          id: r.id,
          client: r.client_name,
          documentType: r.document_type,
          status: r.status,
          created: fmtCtxDate(r.created_at),
        })),
        summary: counts,
      };
      break;
    }

    case "outbox":
      data = {
        pendingDrafts: outboxDrafts.slice(0, 10).map((d) => ({
          subject: d.subject,
        })),
      };
      break;

    case "overview":
      data = {
        activePoliciesCount: policies.length,
        policiesExpiringIn30Days: policies.filter(
          (p) =>
            p.expiration_date &&
            p.expiration_date >= today &&
            p.expiration_date <= in30Days
        ).length,
        pendingCOIRequests: coiRequests.filter((r) => r.status === "pending")
          .length,
      };
      break;

    default:
      data = {};
  }

  return { data, lastFetched };
}

// ── Search config & helpers ────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  import("@/lib/search-types").SearchResultType,
  { label: string; icon: React.ElementType; color: string; href: (id: string) => string }
> = {
  policy:       { label: "Policies",      icon: FileText,    color: "#00d4aa", href: (id) => `/renewals/${id}` },
  certificate:  { label: "Certificates",  icon: Shield,      color: "#7c6cf8", href: (id) => `/certificates/${id}` },
  client:       { label: "Clients",       icon: Users,       color: "#f59e0b", href: (id) => `/clients/${id}` },
  coi_request:  { label: "COI Requests",  icon: ShieldCheck, color: "#34d399", href: ()   => `/certificates?tab=requests` },
  doc_chase:    { label: "Doc Requests",  icon: FolderOpen,  color: "#60a5fa", href: ()   => `/documents` },
  outbox_draft: { label: "Drafts",        icon: Inbox,       color: "#a78bfa", href: ()   => `/outbox` },
};

const STAGE_LABELS: Record<string, string> = {
  pending: "Not started",
  email_90_sent: "90-day email sent",
  email_60_sent: "60-day email sent",
  sms_30_sent: "SMS sent",
  script_14_ready: "Script ready",
  complete: "Complete",
};

const COI_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
  ready_for_approval: "Ready to send",
  needs_review: "Needs review",
};

function fmtDate(s?: string | null): string {
  if (!s) return "";
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTimestamp(s?: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSearchTitle(r: SearchResult): string {
  switch (r._type) {
    case "policy":       return r.client_name || r.policy_name || "Untitled";
    case "certificate":  return r.insured_name || "Untitled";
    case "client":       return r.name || "Untitled";
    case "coi_request":  return r.insured_name || "Untitled";
    case "doc_chase":    return r.client_name || "Untitled";
    case "outbox_draft": return r.subject || "Untitled";
  }
}

function getSearchSubtitle(r: SearchResult): string {
  switch (r._type) {
    case "policy": {
      const parts: string[] = [];
      if (r.policy_name && r.policy_name !== r.client_name) parts.push(r.policy_name);
      if (r.carrier) parts.push(r.carrier);
      return parts.join("  ·  ");
    }
    case "certificate":
      return [r.certificate_number, r.holder_name].filter(Boolean).join("  ·  ");
    case "client":
      return [r.email, r.phone].filter(Boolean).join("  ·  ");
    case "coi_request":
      return [`Holder: ${r.holder_name}`, r.requester_name ? `Req by ${r.requester_name}` : ""].filter(Boolean).join("  ·  ");
    case "doc_chase":
      return [r.document_type, r.client_email].filter(Boolean).join("  ·  ");
    case "outbox_draft":
      return r.created_at ? `Created ${fmtTimestamp(r.created_at)}` : "";
  }
}

function getSearchMeta(r: SearchResult): string {
  switch (r._type) {
    case "policy": {
      const parts: string[] = [];
      const exp = r.expiration_date ? `Exp ${fmtDate(r.expiration_date)}` : "";
      if (exp) parts.push(exp);
      if (r.campaign_stage && STAGE_LABELS[r.campaign_stage])
        parts.push(STAGE_LABELS[r.campaign_stage]);
      if (r.status && r.status !== "active") parts.push(r.status);
      if (r.premium) parts.push(`$${Number(r.premium).toLocaleString()} premium`);
      return parts.join("  ·  ");
    }
    case "certificate": {
      const parts: string[] = [];
      if (r.expiration_date) parts.push(`Exp ${fmtDate(r.expiration_date)}`);
      if (r.holder_city || r.holder_state)
        parts.push([r.holder_city, r.holder_state].filter(Boolean).join(", "));
      if (r.status) parts.push(r.status.charAt(0).toUpperCase() + r.status.slice(1));
      return parts.join("  ·  ");
    }
    case "client": {
      const parts: string[] = [];
      if (r.business_type) parts.push(r.business_type.replace(/_/g, " "));
      if (r.primary_state) parts.push(r.primary_state);
      return parts.join("  ·  ");
    }
    case "coi_request":
      return r.status ? (COI_STATUS_LABELS[r.status] ?? r.status) : "";
    case "doc_chase":
      return r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : "";
    case "outbox_draft":
      return r.status
        ? r.status === "sent"
          ? `Sent ${fmtTimestamp(r.sent_at)}`
          : r.status.charAt(0).toUpperCase() + r.status.slice(1)
        : "";
  }
}

// ── Loading dots ──────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-500/60"
          style={{ animation: `hollis-pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

const PAGE_LABELS: Record<AssistantPage, string> = {
  overview: "Overview",
  renewals: "Renewals",
  certificates: "Certificates",
  clients: "Clients",
  documents: "Documents",
  policies: "Policy Audit",
  outbox: "Drafts",
  other: "Hollis",
};

interface AssistantPanelProps {
  page: AssistantPage;
  data?: Record<string, unknown>;
}

type ViewMode = "closed" | "center" | "sideChat";

const SIDE_CHAT_WIDTH = 280;
const SIDE_CHAT_HEIGHT = 340;

// ── Message bubble ─────────────────────────────────────────────────────────────

function FormattedResponse({ content, compact, prominent }: { content: string; compact?: boolean; prominent?: boolean }) {
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  const sizeClass = compact ? "text-[13px]" : prominent ? "text-[15px]" : "text-[15px]";
  const lineClass = compact ? "leading-relaxed" : "leading-[1.65]";
  const colorClass = prominent ? "text-white" : "text-zinc-300";
  return (
    <div className={`${sizeClass} ${lineClass} ${colorClass} space-y-3`}>
      {paragraphs.map((p, i) => (
        <p key={i} className="m-0">
          {p.split("\n").map((line, j) => (
            <span key={j}>
              {line}
              {j < p.split("\n").length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function MessageBubble({
  msg,
  onAction,
  onLinkClick,
  compact,
  chatLayout,
}: {
  msg: AssistantMessage;
  onAction: (a: AssistantAction) => void;
  onLinkClick: () => void;
  compact?: boolean;
  chatLayout?: boolean;
}) {
  const isUser = msg.role === "user";
  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (chatLayout) {
    return (
      <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
          <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            {isUser ? "You" : "Hollis"}
          </span>
          <span className="text-[11px] text-zinc-600">{formatTime(msg.timestamp)}</span>
        </div>
        {isUser ? (
          <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-[14px] text-white max-w-[85%] leading-relaxed">
            {msg.content}
          </div>
        ) : (
          <>
            <div className="max-w-[95%]">
              <FormattedResponse content={msg.content} compact={compact} prominent />
            </div>
            {msg.actions && msg.actions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {msg.actions.map((action, i) =>
                  action.href ? (
                    <Link
                      key={i}
                      href={action.href}
                      onClick={onLinkClick}
                      className="inline-flex items-center gap-2 bg-[#2a2a35] border border-[#3a3a45] hover:bg-[#353540] rounded-lg px-3 py-2 text-[13px] text-zinc-200 hover:text-white transition-colors"
                    >
                      <ArrowRight size={14} />
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      key={i}
                      onClick={() => onAction(action)}
                      className="inline-flex items-center gap-2 bg-[#2a2a35] border border-[#3a3a45] hover:bg-[#353540] rounded-lg px-3 py-2 text-[13px] text-zinc-200 hover:text-white transition-colors"
                    >
                      <Check size={14} />
                      {action.label}
                    </button>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      {isUser ? (
        <div className="bg-white/5 border border-white/10 rounded-lg px-3.5 py-2 text-[13px] text-zinc-100 max-w-[92%] leading-relaxed">
          {msg.content}
        </div>
      ) : (
        <div className={`max-w-[95%] ${compact ? "pr-1" : "pr-2"}`}>
          <FormattedResponse content={msg.content} compact={compact} />
        </div>
      )}
      {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {msg.actions.map((action, i) =>
            action.href ? (
              <Link
                key={i}
                href={action.href}
                onClick={onLinkClick}
                className="bg-[#2a2a35] border border-[#3a3a45] hover:bg-[#353540] hover:border-[#00d4aa]/40 rounded-md px-2.5 py-1.5 text-[12px] text-zinc-400 hover:text-[#00d4aa] transition-colors"
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={i}
                onClick={() => onAction(action)}
                className="bg-[#2a2a35] border border-[#3a3a45] hover:bg-[#353540] hover:border-[#00d4aa]/40 rounded-md px-2.5 py-1.5 text-[12px] text-zinc-400 hover:text-[#00d4aa] transition-colors"
              >
                {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssistantPanel({ page, data }: AssistantPanelProps) {
  const { registerOpenHandler } = useUnifiedPanel();

  const [viewMode, setViewMode] = useState<ViewMode>("closed");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Search state (unified with AI)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const unifiedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerOpenHandler(() => {
      setViewMode("center");
      setTimeout(() => unifiedInputRef.current?.focus(), 180);
    });
  }, [registerOpenHandler]);

  // Don't restore panel from localStorage on mount — always start closed so it
  // doesn't auto-appear when signing in or refreshing

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResponse(null);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        setSearchError("Something went wrong. Try again.");
        return;
      }
      setSearchResponse(await res.json());
    } catch {
      setSearchError("Something went wrong. Check your connection.");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const fetchReply = useCallback(
    async (
      userMessage: string,
      historySnapshot: AssistantMessage[]
    ): Promise<{ reply: string; actions: AssistantAction[] }> => {
      const dataContext = buildClientDataContext(page);
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: { page, data },
          history: historySnapshot,
          dataContext,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    [page, data]
  );

  // Minimize keeps conversation; exit (close) starts fresh next time
  const condenseToSide = () => setViewMode("sideChat");
  const closeAndClear = useCallback(() => {
    setMessages([]);
    setInput("");
    setSearchQuery("");
    setSearchResponse(null);
    setSearchError(null);
    setViewMode("closed");
  }, []);

  // ⌘K and ⌘J both open the unified panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (viewMode === "center") {
          setViewMode("sideChat");
        } else if (viewMode === "sideChat") {
          closeAndClear();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "k")) {
        e.preventDefault();
        if (viewMode === "closed") {
          setViewMode("center");
          setTimeout(() => unifiedInputRef.current?.focus(), 180);
        } else {
          closeAndClear();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewMode, closeAndClear]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      const historySnapshot = messages.slice(-3);
      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next.length > 20 ? next.slice(-20) : next;
      });
      setInput("");
      setSearchQuery("");
      setSearchResponse(null);
      if (inputRef.current) inputRef.current.style.height = "auto";
      setLoading(true);

      try {
        const { reply, actions } = await fetchReply(trimmed, historySnapshot);
        const assistantMsg: AssistantMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: new Date().toISOString(),
          actions,
        };
        setMessages((prev) => {
          const next = [...prev, assistantMsg];
          return next.length > 20 ? next.slice(-20) : next;
        });
      } catch {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I couldn't reach the server. Check your connection and try again.",
          timestamp: new Date().toISOString(),
        }]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, fetchReply]
  );

  const handleAction = (action: AssistantAction) => {
    if (action.onClick === "refresh") window.location.reload();
  };

  const clearAndClose = () => {
    setMessages([]);
    setInput("");
    setSearchQuery("");
    setSearchResponse(null);
    setSearchError(null);
    setViewMode("closed");
  };

  const handleUnifiedInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  const handleUnifiedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
  };

  const handleSuggestionClick = (s: string) => {
    setInput(s);
    setSearchQuery(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(s);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 64) + "px";
  };

  // Search results state
  const grouped = searchResponse?.results.reduce<
    Partial<Record<import("@/lib/search-types").SearchResultType, SearchResult[]>>
  >(
    (acc, r) => {
      (acc[r._type] ??= []).push(r);
      return acc;
    },
    {}
  );
  const hasSearchResults =
    grouped &&
    SEARCH_DISPLAY_ORDER.some((t) => (grouped[t]?.length ?? 0) > 0);
  const showNoSearchResults =
    searchResponse &&
    !searchLoading &&
    !hasSearchResults &&
    searchQuery.trim();
  const inChatMode = messages.length > 0 || loading;

  return (
    <>
      <style>{`
        @keyframes hollis-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
        @keyframes hollis-float-in {
          0% { opacity: 0; transform: scale(0.97) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* ── Center mode: unified search + AI (blur overlay) ────────────────────── */}
      {viewMode === "center" && (
        <div
          className="fixed inset-0 z-[9998] flex items-start justify-center pt-[16vh] cursor-default"
          onClick={closeAndClear}
        >
          {/* Subtle backdrop for focus */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-hidden />

          <div
            className="relative w-full max-w-[680px] mx-6 flex flex-col rounded-xl overflow-hidden cursor-default"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: "hollis-float-in 0.4s ease-out forwards",
              background: "rgba(26, 26, 30, 0.95)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(0,212,170,0.22)",
              boxShadow: `
                0 0 0 1px rgba(0,212,170,0.08),
                0 0 40px -8px rgba(0,212,170,0.25),
                0 0 80px -16px rgba(0,212,170,0.12),
                0 24px 48px -12px rgba(0,0,0,0.4),
                0 12px 24px -8px rgba(0,0,0,0.3)
              `,
            }}
          >
            {!inChatMode ? (
              <>
                {/* Unified input: search + ask */}
                <form onSubmit={handleUnifiedSubmit} className="flex items-center gap-3 px-5 py-4 pb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#00d4aa]/10 flex items-center justify-center shrink-0">
                    {searchLoading ? (
                      <Loader2 size={15} className="text-[#00d4aa]/80 animate-spin" />
                    ) : (
                      <Search size={15} className="text-[#00d4aa]/80" />
                    )}
                  </div>
                  <input
                    ref={unifiedInputRef}
                    type="text"
                    value={input}
                    onChange={handleUnifiedInputChange}
                    placeholder="Search clients, policies, certificates… or ask anything"
                    className="flex-1 bg-transparent border-none outline-none text-[15px] text-zinc-100 placeholder-zinc-500 min-w-0"
                  />
                  {input && (
                    <button
                      type="button"
                      onClick={() => {
                        setInput("");
                        setSearchQuery("");
                        setSearchResponse(null);
                        setSearchError(null);
                      }}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-opacity ${
                      !input.trim() ? "opacity-50 cursor-default" : "opacity-100 hover:opacity-90"
                    }`}
                    style={{ background: "#00d4aa" }}
                  >
                    <ArrowUp size={16} className="text-black" />
                  </button>
                </form>

                <div className="flex items-center justify-between px-5 pb-3 -mt-1">
                  <span className="text-[11px] text-zinc-500">
                    {PAGE_LABELS[page]}
                  </span>
                  <button
                    type="button"
                    onClick={condenseToSide}
                    title="Minimize (Esc)"
                    className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                </div>

                {/* Search results / suggestions / no-results body */}
                <div className="flex-1 overflow-y-auto max-h-[45vh] min-h-[120px] px-5 pb-5">
                  {searchError && (
                    <div className="flex items-center gap-2.5 py-2.5 text-[13px] text-red-400">
                      <span>⚠</span>
                      {searchError}
                    </div>
                  )}

                  {searchResponse?.summary && !searchError && (
                    <div className="py-2.5 text-[13px] text-zinc-400 leading-relaxed border-b border-white/5 mb-3">
                      {searchResponse.summary}
                    </div>
                  )}

                  {hasSearchResults && !searchError ? (
                    <div className="py-1.5 space-y-2">
                      {SEARCH_DISPLAY_ORDER.filter((t) => (grouped![t]?.length ?? 0) > 0).map((type) => {
                        const config = TYPE_CONFIG[type];
                        const Icon = config.icon;
                        return (
                          <div key={type}>
                            <div className="flex items-center gap-2 pt-2 pb-1">
                              <Icon size={11} style={{ color: config.color }} />
                              <span
                                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                                style={{ color: config.color }}
                              >
                                {config.label}
                              </span>
                            </div>
                            {grouped![type]!.map((result) => {
                              const subtitle = getSearchSubtitle(result);
                              const meta = getSearchMeta(result);
                              const rowHref = TYPE_CONFIG[result._type].href(result.id);
                              return (
                                <div
                                  key={result.id}
                                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                                >
                                  <Link
                                    href={rowHref}
                                    onClick={condenseToSide}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <div className="text-[14px] font-medium text-zinc-300 truncate group-hover:text-white transition-colors">
                                      {getSearchTitle(result)}
                                    </div>
                                    {subtitle && (
                                      <div className="text-[12px] text-zinc-500 truncate mt-0.5">
                                        {subtitle}
                                      </div>
                                    )}
                                    {meta && meta !== subtitle && (
                                      <div className="text-[11px] text-zinc-600 truncate mt-0.5">
                                        {meta}
                                      </div>
                                    )}
                                  </Link>
                                  <SearchResultActions
                                    result={result}
                                    onActionComplete={() => doSearch(searchQuery)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ) : showNoSearchResults ? (
                    <div className="pt-4">
                      <div className="text-[14px] text-zinc-400 mb-0.5">
                        No results for &ldquo;{searchQuery.trim()}&rdquo;
                      </div>
                      <div className="text-[12px] text-zinc-600 mb-4">
                        Try a broader term, or ask Hollis for help.
                      </div>
                    </div>
                  ) : !searchQuery ? (
                    <div className="py-2">
                      <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                        Try asking
                      </div>
                      <div className="space-y-0.5">
                        {SUGGESTED_SEARCH_QUERIES.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSuggestionClick(s)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors text-left"
                          >
                            <Search size={13} className="text-zinc-600 shrink-0" />
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {/* Chat mode header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#00d4aa]/10 flex items-center justify-center">
                      <Sparkles size={12} className="text-[#00d4aa]/80" />
                    </div>
                    <span className="text-[13px] font-medium text-white">Ask Hollis</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={clearAndClose}
                      title="Clear and close"
                      className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={closeAndClear}
                      title="Close (Esc)"
                      className="p-2 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 px-5 py-5 flex flex-col gap-6 max-h-[45vh] overflow-y-auto">
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      onAction={handleAction}
                      onLinkClick={condenseToSide}
                      chatLayout
                    />
                  ))}
                  {loading && <LoadingDots />}
                  <div ref={messagesEndRef} />
                </div>

                <div
                  className="px-5 py-4 border-t border-white/5"
                  style={{ background: "rgba(36, 36, 40, 0.6)" }}
                >
                  <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                    Search & Assistant
                  </div>
                  <div className="flex items-end gap-2 bg-[#0d0d12] border border-white/5 rounded-lg px-4 py-3 focus-within:border-white/10 transition-colors">
                    <Paperclip size={16} className="text-zinc-500 shrink-0 cursor-pointer hover:text-zinc-400" />
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onInput={handleInput}
                      placeholder="Message..."
                      rows={1}
                      className="flex-1 bg-transparent border-none outline-none text-[14px] text-zinc-200 placeholder-zinc-500 resize-none min-h-[24px] max-h-[80px] overflow-y-auto font-[inherit] leading-relaxed"
                    />
                    <button
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || loading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium bg-[#00d4aa] text-black hover:bg-[#00e6b8] transition-colors disabled:opacity-50 disabled:cursor-default disabled:hover:bg-[#00d4aa]"
                    >
                      <span>Send</span>
                      <ArrowUp size={12} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Side chat ───────────────────────────────────────────────────────────── */}
      {viewMode === "sideChat" && (
        <div
          className="fixed bottom-5 right-5 z-[9999] flex flex-col rounded-lg overflow-hidden"
          style={{
            width: SIDE_CHAT_WIDTH,
            height: SIDE_CHAT_HEIGHT,
            background: "rgba(26, 26, 30, 0.97)",
            border: "1px solid rgba(0,212,170,0.15)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 shrink-0">
            <span className="text-[12px] font-medium text-[#00d4aa]/80">Hollis</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={clearAndClose}
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                title="Clear and close"
              >
                <Trash2 size={12} />
              </button>
              <button
                onClick={closeAndClear}
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                title="Close (Esc)"
              >
                <Minus size={12} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onAction={handleAction}
                onLinkClick={closeAndClear}
                compact
              />
            ))}
            {loading && <LoadingDots />}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 p-2.5 border-t border-white/5">
            <div className="flex items-end gap-2 bg-white/[0.03] border border-white/5 focus-within:border-[#00d4aa]/20 rounded-lg px-3 py-2 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                placeholder="Ask..."
                rows={1}
                className="flex-1 bg-transparent border-none outline-none text-[13px] text-zinc-200 placeholder-zinc-500 resize-none min-h-[20px] max-h-[56px] overflow-y-auto font-[inherit]"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-opacity ${
                  !input.trim() || loading ? "opacity-50 cursor-default" : ""
                } bg-[#00d4aa]`}
              >
                <ArrowUp size={12} className="text-black" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
