"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Sparkles, X, Trash2, ArrowUp } from "lucide-react";
import type { AssistantMessage, AssistantAction, AssistantPage } from "@/types/assistant";

// ── Loading dots ──────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-600"
          style={{
            animation: `hollis-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Page label map ────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<AssistantPage, string> = {
  overview: "Overview",
  renewals: "Renewals",
  certificates: "Certificates",
  clients: "Clients",
  documents: "Documents",
  policies: "Policy Audit",
  outbox: "Outbox",
  other: "Hollis",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface AssistantPanelProps {
  page: AssistantPage;
  data?: Record<string, unknown>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssistantPanel({ page, data }: AssistantPanelProps) {
  // Open state — persisted to localStorage
  const [open, setOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevPageRef = useRef<AssistantPage>(page);
  const lastGreetedPageRef = useRef<AssistantPage | null>(null);

  // Hydrate open state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("hollis-assistant-open");
    if (stored === "true") setOpen(true);
  }, []);

  // Persist open state
  useEffect(() => {
    localStorage.setItem("hollis-assistant-open", open ? "true" : "false");
  }, [open]);

  // ── API call ────────────────────────────────────────────────────────────────

  const fetchReply = useCallback(
    async (
      userMessage: string,
      historySnapshot: AssistantMessage[]
    ): Promise<{ reply: string; actions: AssistantAction[] }> => {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: { page, data },
          history: historySnapshot,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    },
    [page, data]
  );

  // ── Greeting ────────────────────────────────────────────────────────────────

  const fetchGreeting = useCallback(async () => {
    setLoading(true);
    try {
      const { reply, actions } = await fetchReply("hello", []);
      const msg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
        actions,
      };
      setMessages([msg]);
    } catch {
      // silently fail — panel still usable without greeting
    } finally {
      setLoading(false);
    }
  }, [fetchReply]);

  // Greet whenever panel is open and the page has changed (or first open)
  const doGreetIfNeeded = useCallback(() => {
    if (lastGreetedPageRef.current !== page) {
      lastGreetedPageRef.current = page;
      setMessages([]);
      fetchGreeting();
    }
  }, [page, fetchGreeting]);

  useEffect(() => {
    if (open) doGreetIfNeeded();
  }, [open, doGreetIfNeeded]);

  // When page changes while panel is open, clear history; doGreetIfNeeded will fire
  useEffect(() => {
    if (page !== prevPageRef.current) {
      prevPageRef.current = page;
      // doGreetIfNeeded will handle clear + re-greet via the open/doGreetIfNeeded effect
    }
  }, [page]);

  // ── Keyboard shortcut ⌘J / Ctrl+J ──────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) setTimeout(() => inputRef.current?.focus(), 220);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Send message ────────────────────────────────────────────────────────────

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

      // Keep last 3 messages for history before adding the new one
      const historySnapshot = messages.slice(-3);

      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next.length > 20 ? next.slice(-20) : next;
      });
      setInput("");
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
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
        const errMsg: AssistantMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I couldn't reach the server. Check your connection and try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, fetchReply]
  );

  // ── Action handler ──────────────────────────────────────────────────────────

  const handleAction = (action: AssistantAction) => {
    if (action.onClick === "refresh") {
      window.location.reload();
    }
  };

  // ── Clear conversation ──────────────────────────────────────────────────────

  const clearConversation = () => {
    lastGreetedPageRef.current = null;
    setMessages([]);
    // Will trigger re-greet via the open/doGreetIfNeeded effect
    if (open) {
      lastGreetedPageRef.current = null;
      doGreetIfNeeded();
    }
  };

  // ── Toggle panel ────────────────────────────────────────────────────────────

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) setTimeout(() => inputRef.current?.focus(), 220);
      return next;
    });
  };

  // ── Input handlers ──────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 72) + "px";
  };

  // ── Timestamp formatter ─────────────────────────────────────────────────────

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes hollis-pulse {
          0%, 100% { opacity: 0.25; }
          50%       { opacity: 1; }
        }
      `}</style>

      {/* Backdrop — visible only when open, click to close */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30,
          background: "rgba(0,0,0,0.28)",
          backdropFilter: open ? "blur(1.5px)" : "none",
          WebkitBackdropFilter: open ? "blur(1.5px)" : "none",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 200ms ease-out",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100%",
          width: 320,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          background: "#111118",
          borderLeft: "1px solid #1e1e2a",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid #1e1e2a",
            flexShrink: 0,
          }}
        >
          {/* Hollis label + live dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#a1a1aa",
                letterSpacing: "-0.01em",
              }}
            >
              Hollis
            </span>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#00d4aa",
                boxShadow: "0 0 6px rgba(0,212,170,0.8)",
              }}
            />
          </div>

          {/* Page context pill */}
          <span
            style={{
              fontSize: 12,
              color: "#52525b",
              background: "#1a1a24",
              border: "1px solid #2a2a35",
              borderRadius: 999,
              padding: "2px 8px",
              lineHeight: "1.4",
            }}
          >
            {PAGE_LABELS[page]}
          </span>

          {/* Clear button */}
          <button
            onClick={clearConversation}
            title="Clear conversation"
            style={{
              marginLeft: "auto",
              color: "#52525b",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              borderRadius: 4,
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Message thread */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {/* Bubble */}
              {msg.role === "user" ? (
                <div
                  style={{
                    background: "#1a1a24",
                    border: "1px solid #2a2a35",
                    borderRadius: 12,
                    padding: "10px 14px",
                    fontSize: 14,
                    color: "#ffffff",
                    maxWidth: "90%",
                    lineHeight: "1.5",
                  }}
                >
                  {msg.content}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 14,
                    color: "#d4d4d8",
                    lineHeight: "1.65",
                    maxWidth: "90%",
                  }}
                >
                  {msg.content}
                </div>
              )}

              {/* Action buttons (assistant only) */}
              {msg.role === "assistant" &&
                msg.actions &&
                msg.actions.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    {msg.actions.map((action, i) =>
                      action.href ? (
                        <Link
                          key={i}
                          href={action.href}
                          onClick={() => setOpen(false)}
                          style={{
                            background: "#1a1a24",
                            border: "1px solid #2a2a35",
                            borderRadius: 999,
                            padding: "6px 12px",
                            fontSize: 13,
                            color: "#a1a1aa",
                            textDecoration: "none",
                            transition: "border-color 150ms, color 150ms",
                            display: "inline-block",
                            lineHeight: "1.4",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor =
                              "rgba(0,212,170,0.4)";
                            e.currentTarget.style.color = "#00d4aa";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "#2a2a35";
                            e.currentTarget.style.color = "#a1a1aa";
                          }}
                        >
                          {action.label}
                        </Link>
                      ) : (
                        <button
                          key={i}
                          onClick={() => handleAction(action)}
                          style={{
                            background: "#1a1a24",
                            border: "1px solid #2a2a35",
                            borderRadius: 999,
                            padding: "6px 12px",
                            fontSize: 13,
                            color: "#a1a1aa",
                            cursor: "pointer",
                            transition: "border-color 150ms, color 150ms",
                            lineHeight: "1.4",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor =
                              "rgba(0,212,170,0.4)";
                            e.currentTarget.style.color = "#00d4aa";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "#2a2a35";
                            e.currentTarget.style.color = "#a1a1aa";
                          }}
                        >
                          {action.label}
                        </button>
                      )
                    )}
                  </div>
                )}

              {/* Timestamp */}
              <span
                style={{
                  fontSize: 11,
                  color: "#3f3f46",
                  marginTop: 4,
                }}
              >
                {formatTime(msg.timestamp)}
              </span>
            </div>
          ))}

          {/* Loading dots */}
          {loading && <LoadingDots />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            flexShrink: 0,
            padding: "0 16px 16px",
            borderTop: "1px solid #1e1e2a",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              background: "#0d0d12",
              border: "1px solid #1e1e2a",
              borderRadius: 8,
              padding: "12px 14px",
              transition: "border-color 150ms",
            }}
            onFocusCapture={(e) =>
              (e.currentTarget.style.borderColor = "rgba(0,212,170,0.4)")
            }
            onBlurCapture={(e) =>
              (e.currentTarget.style.borderColor = "#1e1e2a")
            }
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Ask anything about your book..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 14,
                color: "#ffffff",
                resize: "none",
                lineHeight: "1.5",
                minHeight: 21,
                maxHeight: 72,
                overflowY: "auto",
                fontFamily: "inherit",
              }}
              className="placeholder-zinc-700"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "#00d4aa",
                color: "#000000",
                border: "none",
                cursor: !input.trim() || loading ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: !input.trim() || loading ? 0.4 : 1,
                transition: "opacity 150ms",
              }}
            >
              <ArrowUp size={14} />
            </button>
          </div>

          {loading && (
            <p
              style={{
                fontSize: 12,
                color: "#52525b",
                fontStyle: "italic",
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              Hollis is thinking…
            </p>
          )}
        </div>
      </div>

      {/* Toggle button — slides with the panel */}
      <button
        onClick={toggleOpen}
        style={{
          position: "fixed",
          top: "50%",
          right: 0,
          zIndex: 41,
          transform: open
            ? "translateY(-50%) translateX(-320px)"
            : "translateY(-50%) translateX(0)",
          transition: "transform 200ms ease-out",
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "#1a1a24",
          border: "1px solid #2a2a35",
          borderRight: "none",
          borderTopLeftRadius: 999,
          borderBottomLeftRadius: 999,
          padding: "10px 14px",
          cursor: "pointer",
          color: "#a1a1aa",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#e4e4e7";
          e.currentTarget.style.borderColor = "#3a3a45";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#a1a1aa";
          e.currentTarget.style.borderColor = "#2a2a35";
        }}
        title={open ? "Close Hollis" : "Open Hollis (⌘J)"}
      >
        {open ? (
          <X size={15} />
        ) : (
          <>
            <Sparkles
              size={14}
              style={{
                color: "#00d4aa",
                filter: "drop-shadow(0 0 5px rgba(0,212,170,0.7))",
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
              }}
            >
              Ask Hollis
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#52525b",
                marginLeft: 2,
              }}
            >
              ⌘J
            </span>
          </>
        )}
      </button>
    </>
  );
}
