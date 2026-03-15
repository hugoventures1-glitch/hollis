"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Check } from "lucide-react";

interface HolderResult {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email?: string | null;
  usage_count: number;
  common_coverage_types: string[];
  common_insured_names: string[];
}

export interface HolderAutofillInputProps {
  value: string;
  onChange: (name: string) => void;
  onHolderSelect: (holder: {
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    commonCoverageTypes: string[];
    commonInsuredNames: string[];
  }) => void;
  agentId?: string;
  placeholder?: string;
  /** Extra className applied to the outer wrapper */
  className?: string;
}

export function HolderAutofillInput({
  value,
  onChange,
  onHolderSelect,
  agentId,
  placeholder = "ABC Contractors LLC",
  className,
}: HolderAutofillInputProps) {
  const [results, setResults] = useState<HolderResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(
    (q: string) => {
      if (q.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams({ q });
          if (agentId) params.set("agentId", agentId);
          const res = await fetch(`/api/coi/holders/search?${params}`);
          if (!res.ok) return;
          const data = await res.json();
          setResults(data.holders ?? []);
          setOpen(true);
        } catch {
          // silently ignore — search is best-effort
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [agentId]
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setSelectedId(null); // clear selection when user types again
    search(v);
  }

  function handleSelect(holder: HolderResult) {
    setSelectedId(holder.id);
    onChange(holder.name);
    setOpen(false);
    setResults([]);
    onHolderSelect({
      id: holder.id,
      name: holder.name,
      address: holder.address ?? undefined,
      city: holder.city ?? undefined,
      state: holder.state ?? undefined,
      zip: holder.zip ?? undefined,
      commonCoverageTypes: holder.common_coverage_types,
      commonInsuredNames: holder.common_insured_names,
    });
  }

  function handleInputFocus() {
    if (results.length > 0) setOpen(true);
  }

  function formatShortAddress(holder: HolderResult): string {
    const parts: string[] = [];
    if (holder.city) parts.push(holder.city);
    if (holder.state) parts.push(holder.state);
    return parts.join(", ");
  }

  return (
    <div ref={wrapperRef} className={`relative${className ? ` ${className}` : ""}`}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 pr-8 text-[13px] text-[#f5f5f7] outline-none focus:border-[#555555] placeholder-[#6b6b6b]"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {loading ? (
            <div className="w-3.5 h-3.5 border border-[#333333] border-t-[#FAFAFA] rounded-full animate-spin" />
          ) : selectedId ? (
            <Check size={13} className="text-[#FAFAFA]" />
          ) : (
            <Search size={13} className="text-[#6b6b6b]" />
          )}
        </div>
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#111118] border border-[#1C1C1C] rounded-lg overflow-hidden shadow-xl">
          {results.map((holder) => (
            <button
              key={holder.id}
              type="button"
              onClick={() => handleSelect(holder)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[#111111] transition-colors border-b border-[#1e1e2a] last:border-0"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#f5f5f7] truncate">
                  {holder.name}
                </div>
                {(holder.city || holder.state) && (
                  <div className="text-[11px] text-[#6b6b6b] mt-0.5 truncate">
                    {formatShortAddress(holder)}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[10px] font-medium text-[#6b6b6b] bg-[#1e1e2a] border border-[#1C1C1C] px-2 py-0.5 rounded">
                {holder.usage_count}×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
