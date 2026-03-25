"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowUp,
  Compass,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
import { useUnifiedPanel } from "@/contexts/UnifiedPanelContext";
import AssistantPanelWrapper from "./AssistantPanelWrapper";

// ── Suggestion data ───────────────────────────────────────────────────────────

type SuggestionKind = "nav" | "ask";

interface Suggestion {
  kind: SuggestionKind;
  label: string;
  href?: string;
  query?: string;
  keywords: string[];
}

const SUGGESTIONS: Suggestion[] = [
  // Nav
  { kind: "nav", label: "Go to Renewals",          href: "/renewals",                  keywords: ["renew", "go to", "show"] },
  { kind: "nav", label: "View Stalled Policies",    href: "/renewals?filter=stalled",   keywords: ["stall", "stuck", "blocked"] },
  { kind: "nav", label: "Go to Certificates",       href: "/certificates",              keywords: ["cert", "coi", "certificate"] },
  { kind: "nav", label: "Go to Clients",            href: "/clients",                   keywords: ["client", "contact", "crm"] },
  { kind: "nav", label: "Open Review Queue",        href: "/review",                    keywords: ["review", "approv", "queue"] },
  { kind: "nav", label: "View Activity",            href: "/activity",                  keywords: ["activ", "log", "history", "feed"] },
  { kind: "nav", label: "Go to Documents",          href: "/documents",                 keywords: ["doc", "file", "upload", "document"] },
  { kind: "nav", label: "View Outbox / Drafts",     href: "/outbox",                    keywords: ["outbox", "draft", "email", "sent"] },
  { kind: "nav", label: "Import Policies",          href: "/import",                    keywords: ["import", "csv", "bulk"] },
  { kind: "nav", label: "Settings",                 href: "/settings",                  keywords: ["setting", "config", "profile", "account"] },
  // Ask
  { kind: "ask", label: "What's expiring this month?",          query: "What's expiring this month?",          keywords: ["expir", "what", "month", "soon"] },
  { kind: "ask", label: "How many stalled policies do I have?", query: "How many stalled policies do I have?", keywords: ["stall", "how many", "how"] },
  { kind: "ask", label: "Show me my book value breakdown",      query: "Show me my book value breakdown",      keywords: ["book", "value", "premium", "breakdown"] },
  { kind: "ask", label: "Which clients haven't responded?",     query: "Which clients haven't responded?",     keywords: ["respond", "client", "who", "which"] },
  { kind: "ask", label: "What needs my attention today?",       query: "What needs my attention today?",       keywords: ["attention", "today", "urgent", "need"] },
  { kind: "ask", label: "Summarise my renewal pipeline",        query: "Summarise my renewal pipeline",        keywords: ["summar", "pipeline", "overview"] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchSuggestions(query: string): Suggestion[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return SUGGESTIONS
    .filter((s) =>
      s.keywords.some((kw) => q.includes(kw) || kw.startsWith(q.slice(0, 4)))
    )
    .slice(0, 5);
}

const NAV_VERBS  = ["go ", "show ", "view ", "open ", "navigate", "take me"];
const CHAT_VERBS = ["what", "how", "why", "which", "who", "when", "summar", "explain", "tell", "give"];

function detectIntent(query: string): "nav" | "ask" | "neutral" {
  const q = query.toLowerCase().trim();
  if (!q) return "neutral";
  if (NAV_VERBS.some((v)  => q.startsWith(v))) return "nav";
  if (CHAT_VERBS.some((v) => q.startsWith(v))) return "ask";
  return "neutral";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IntentIcon({ intent, hasText }: { intent: "nav" | "ask" | "neutral"; hasText: boolean }) {
  const dim = hasText ? "var(--text-tertiary)" : "var(--text-tertiary)";
  if (intent === "nav") return <Compass size={13} style={{ color: "var(--text-primary)", flexShrink: 0, transition: "color 0.15s" }} />;
  if (intent === "ask") return <MessageCircle size={13} style={{ color: "var(--text-primary)", flexShrink: 0, transition: "color 0.15s" }} />;
  return <Search size={13} style={{ color: dim, flexShrink: 0, transition: "color 0.15s" }} />;
}

function SuggestionRow({
  suggestion,
  active,
  onMouseEnter,
  onClick,
}: {
  suggestion: Suggestion;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        background: active ? "var(--hover-overlay)" : "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.1s",
      }}
    >
      {suggestion.kind === "nav"
        ? <ArrowRight size={12} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
        : <MessageCircle size={12} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
      }
      <span style={{ fontSize: 13, color: active ? "var(--text-primary)" : "var(--text-secondary)", flex: 1 }}>
        {suggestion.label}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
        {suggestion.kind === "nav" ? "go" : "ask"}
      </span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommandBar() {
  const { openPanel, openPanelWithQuery } = useUnifiedPanel();
  const router       = useRouter();
  const [value,       setValue]       = useState("");
  const [focused,     setFocused]     = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions  = matchSuggestions(value);
  const intent       = detectIntent(value);
  const showDropdown = focused && suggestions.length > 0;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) { openPanel(); return; }

    if (intent === "nav") {
      const navMatch = suggestions.find((s) => s.kind === "nav");
      if (navMatch?.href) {
        router.push(navMatch.href);
        setValue("");
        setFocused(false);
        return;
      }
    }

    openPanelWithQuery(trimmed);
    setValue("");
    setFocused(false);
  };

  const handleSuggestionSelect = (s: Suggestion) => {
    if (s.kind === "nav" && s.href) {
      router.push(s.href);
    } else if (s.kind === "ask" && s.query) {
      openPanelWithQuery(s.query);
    }
    setValue("");
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        handleSuggestionSelect(suggestions[activeIndex]);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      setValue("");
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset active index when suggestions change
  useEffect(() => { setActiveIndex(-1); }, [value]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          width: 480,
        }}
      >
        {/* Input bar */}
        <div
          style={{
            background: "var(--surface)",
            border: `1px solid var(--border)`,
            borderRadius: 8,
            height: 40,
            display: "flex",
            alignItems: "center",
            paddingInline: 14,
            gap: 10,
            transition: "border-color 0.15s",
          }}
        >
          <IntentIcon intent={intent} hasText={!!value} />

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="search or ask hollis"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 13,
              fontWeight: 500,
              color: value ? "var(--text-primary)" : "var(--text-tertiary)",
              caretColor: "var(--text-primary)",
            }}
          />

          {value ? (
            <button
              onClick={handleSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 5,
                background: "var(--accent)",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <ArrowUp size={12} style={{ color: "var(--text-inverse)" }} />
            </button>
          ) : (
            <kbd
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
                opacity: 0.6,
                letterSpacing: "0.05em",
              }}
            >
              ⌘K
            </kbd>
          )}
        </div>

        {/* Floating suggestion dropdown */}
        {showDropdown && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
            }}
          >
            {suggestions.map((s, i) => (
              <SuggestionRow
                key={i}
                suggestion={s}
                active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => handleSuggestionSelect(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* AssistantPanel logic layer */}
      <AssistantPanelWrapper />
    </>
  );
}
