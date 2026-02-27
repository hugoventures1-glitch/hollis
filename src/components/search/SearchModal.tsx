"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Loader2,
  FileText,
  Shield,
  Users,
  ArrowRight,
} from "lucide-react";

type ResultType = "policy" | "certificate" | "client";

interface SearchResult {
  id: string;
  _type: ResultType;
  // policy
  policy_name?: string;
  client_name?: string;
  carrier?: string;
  expiration_date?: string;
  premium?: number;
  campaign_stage?: string;
  status?: string;
  // certificate
  certificate_number?: string;
  insured_name?: string;
  holder_name?: string;
  // client
  name?: string;
  email?: string;
  phone?: string;
}

interface SearchResponse {
  results: SearchResult[];
  summary: string;
}

const SUGGESTED_QUERIES = [
  "GL policies expiring next 60 days",
  "pending COI requests",
  "workers comp over $5,000 premium",
  "pending renewals",
  "all COIs for Martinez",
  "which clients haven't been contacted",
];

const TYPE_CONFIG: Record<
  ResultType,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    href: (id: string) => string;
  }
> = {
  policy:      { label: "Policies",     icon: FileText, color: "#00d4aa", href: (id) => `/renewals/${id}` },
  certificate: { label: "Certificates", icon: Shield,   color: "#7c6cf8", href: (id) => `/certificates/${id}` },
  client:      { label: "Clients",      icon: Users,    color: "#f59e0b", href: (id) => `/clients/${id}` },
};

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Focus + reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResponse(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResponse(null); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data: SearchResponse = await res.json();
      setResponse(data);
    } catch {
      // silently ignore network errors
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  const handleSuggestion = (s: string) => {
    setQuery(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(s);
  };

  const handleNavigate = (result: SearchResult) => {
    router.push(TYPE_CONFIG[result._type].href(result.id));
    onClose();
  };

  const getTitle = (r: SearchResult) => {
    if (r._type === "policy")      return r.client_name || r.policy_name || "Untitled";
    if (r._type === "certificate") return r.insured_name || "Untitled";
    if (r._type === "client")      return r.name || "Untitled";
    return "Untitled";
  };

  const getMeta = (r: SearchResult) => {
    if (r._type === "policy") {
      const parts = [r.carrier, r.expiration_date ? `Exp ${r.expiration_date}` : null].filter(Boolean);
      return parts.join("  ·  ");
    }
    if (r._type === "certificate") {
      return [r.certificate_number, r.holder_name].filter(Boolean).join("  ·  ");
    }
    if (r._type === "client") {
      return [r.email, r.phone].filter(Boolean).join("  ·  ");
    }
    return "";
  };

  // Group results by type in display order
  const DISPLAY_ORDER: ResultType[] = ["policy", "certificate", "client"];
  const grouped = response?.results.reduce<Partial<Record<ResultType, SearchResult[]>>>(
    (acc, r) => {
      (acc[r._type] ??= []).push(r);
      return acc;
    },
    {}
  );
  const hasResults = grouped && DISPLAY_ORDER.some((t) => (grouped[t]?.length ?? 0) > 0);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ paddingTop: "14vh" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-[640px] mx-4 rounded-2xl bg-[#111118] border border-[#1e1e2a] shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col">

        {/* Input */}
        <div className="flex items-center gap-3 px-5 h-[60px] border-b border-[#1e1e2a] shrink-0">
          {loading
            ? <Loader2 size={17} className="text-[#505057] animate-spin shrink-0" />
            : <Search size={17} className="text-[#505057] shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Search policies, certificates, clients…"
            className="flex-1 bg-transparent text-[15px] text-[#f5f5f7] placeholder-[#3a3a42] outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResponse(null); }}
              className="text-[#3a3a42] hover:text-[#8a8b91] transition-colors p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[460px]">

          {/* AI summary */}
          {response?.summary && (
            <div className="px-5 py-2.5 border-b border-[#1e1e2a] text-[12px] text-[#8a8b91]">
              {response.summary}
            </div>
          )}

          {/* Results */}
          {hasResults ? (
            <div className="py-1.5">
              {DISPLAY_ORDER.filter((t) => (grouped![t]?.length ?? 0) > 0).map((type) => {
                const config = TYPE_CONFIG[type];
                const Icon = config.icon;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 px-5 pt-3 pb-1.5">
                      <Icon size={11} style={{ color: config.color }} />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                        style={{ color: config.color }}
                      >
                        {config.label}
                      </span>
                    </div>
                    {grouped![type]!.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleNavigate(result)}
                        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/[0.04] transition-colors group text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium text-[#f5f5f7] truncate">
                            {getTitle(result)}
                          </div>
                          {getMeta(result) && (
                            <div className="text-[12px] text-[#505057] mt-0.5 truncate">
                              {getMeta(result)}
                            </div>
                          )}
                        </div>
                        <ArrowRight
                          size={13}
                          className="text-[#3a3a42] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3"
                        />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>

          ) : response && !loading ? (
            // No results
            <div className="px-5 py-12 text-center">
              <div className="text-[14px] text-[#505057]">No results for &ldquo;{query}&rdquo;</div>
              <div className="text-[12px] text-[#3a3a42] mt-1">Try a different query</div>
            </div>

          ) : !query ? (
            // Empty state — suggestions
            <div className="py-3 px-3">
              <div className="px-2 pt-2 pb-2 text-[10px] font-semibold text-[#3a3a42] uppercase tracking-[0.1em]">
                Try asking
              </div>
              {SUGGESTED_QUERIES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-[#8a8b91] hover:bg-white/[0.04] hover:text-[#c5c5cb] transition-colors text-left"
                >
                  <Search size={13} className="text-[#3a3a42] shrink-0" />
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-[#1e1e2a] bg-[#0d0d12] shrink-0">
          <span className="text-[11px] text-[#3a3a42]">
            <kbd className="font-mono">esc</kbd> close
          </span>
          <span className="ml-auto text-[11px] text-[#3a3a42]">
            Powered by Claude
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
