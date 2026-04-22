"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Loader2, Mail, Phone, MessageSquare, FileText, Maximize2, X } from "lucide-react";
import Link from "next/link";
import type { ArtifactResponse, ArtifactTimelineItem, ClientAskResponse } from "@/types/assistant";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifact?: ArtifactResponse | null;
}

interface ClientAIPanelProps {
  clientId: string;
  clientName: string;
}

// ── Artifact Renderer ─────────────────────────────────────────────────────────

function ArtifactRenderer({ artifact }: { artifact: ArtifactResponse }) {
  if (artifact.type === "table" && artifact.columns && artifact.rows) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        {artifact.title && (
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#555" }}>
            {artifact.title}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid #1C1C1C" }}>
                {artifact.columns.map((col) => (
                  <th key={col} className="text-left pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#444" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artifact.rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #111" }} className="transition-colors hover:bg-white/[0.02]">
                  {artifact.columns!.map((col) => (
                    <td key={col} className="py-2.5 pr-4 align-top" style={{ color: "#AAAAAA" }}>
                      {row[col] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {artifact.rows.length === 0 && (
            <div className="py-8 text-center text-[13px]" style={{ color: "#333" }}>No records found</div>
          )}
        </div>
      </div>
    );
  }

  if (artifact.type === "card" && artifact.fields) {
    return (
      <div>
        {artifact.title && (
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#555" }}>
            {artifact.title}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {artifact.fields.map((field) => (
            <div key={field.label}>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#444" }}>{field.label}</div>
              <div className="text-[14px]" style={{ color: "#FAFAFA" }}>{field.value || "—"}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artifact.type === "timeline" && artifact.items) {
    return (
      <div className="flex flex-col gap-1 overflow-y-auto">
        {artifact.title && (
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#555" }}>
            {artifact.title}
          </div>
        )}
        {artifact.items.length === 0 ? (
          <div className="py-8 text-center text-[13px]" style={{ color: "#333" }}>No communications found</div>
        ) : (
          artifact.items.map((item: ArtifactTimelineItem) => {
            const Icon =
              item.channel === "email" ? Mail :
              item.channel === "sms"   ? Phone :
              item.channel === "coi"   ? FileText :
              MessageSquare;
            const inner = (
              <div className="flex items-start gap-3 px-3 py-2.5" style={{ borderBottom: "1px solid #111" }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}>
                  <Icon size={11} style={{ color: "#555" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate" style={{ color: "#AAAAAA" }}>{item.description}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#444" }}>{item.timestamp} · {item.status}</div>
                </div>
              </div>
            );
            return item.link ? (
              <Link key={item.id} href={item.link} className="hover:bg-white/[0.02] rounded-lg transition-colors">{inner}</Link>
            ) : <div key={item.id}>{inner}</div>;
          })
        )}
      </div>
    );
  }

  return (
    <div>
      {artifact.title && (
        <div className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "#555" }}>
          {artifact.title}
        </div>
      )}
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: "#AAAAAA" }}>
        {artifact.content ?? ""}
      </p>
    </div>
  );
}

// ── Chat panel (shared between inline and modal) ───────────────────────────────

function ChatPanel({
  messages,
  loading,
  input,
  onInputChange,
  onSend,
  onArtifactSelect,
  currentArtifact,
  inputRef,
  messagesEndRef,
  placeholder = "Ask a follow-up…",
}: {
  messages: ChatMessage[];
  loading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  onArtifactSelect: (a: ArtifactResponse) => void;
  currentArtifact: ArtifactResponse | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className="px-3 py-2 rounded-lg text-[13px] leading-relaxed max-w-[90%]"
              style={
                msg.role === "user"
                  ? { background: "#1A1A1A", color: "#FAFAFA", border: "1px solid #252525" }
                  : { color: "#AAAAAA" }
              }
            >
              {msg.content}
            </div>
            {msg.role === "assistant" && msg.artifact && msg.artifact !== currentArtifact && (
              <button
                className="text-[11px] transition-colors hover:text-[#AAAAAA]"
                style={{ color: "#333" }}
                onClick={() => onArtifactSelect(msg.artifact!)}
              >
                View result →
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-start">
            <Loader2 size={14} className="animate-spin mt-0.5" style={{ color: "#333" }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5" style={{ borderTop: "1px solid #1A1A1A" }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(input); }
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none"
          style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#AAAAAA" }}
          autoFocus
        />
        <button
          onClick={() => onSend(input)}
          disabled={!input.trim() || loading}
          className="shrink-0 transition-opacity"
          style={{ opacity: input.trim() && !loading ? 1 : 0.3, color: "#555" }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientAIPanel({ clientId, clientName }: ClientAIPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentArtifact, setCurrentArtifact] = useState<ArtifactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Close maximized on Escape
  useEffect(() => {
    if (!maximized) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [maximized]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const isFirstMessage = messages.length === 0;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    if (!expanded) setExpanded(true);
    if (isFirstMessage) setMaximized(true);

    try {
      const historyForApi = messages.slice(-4).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`/api/clients/${clientId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history: historyForApi }),
      });
      const data: ClientAskResponse = await res.json();

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        artifact: data.artifact,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.artifact) setCurrentArtifact(data.artifact);
      scrollToBottom();
    } catch {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(), role: "assistant", content: "Connection error — please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [clientId, messages, loading, expanded, scrollToBottom]);

  const showSplit = expanded && currentArtifact !== null;

  // ── Collapsed ─────────────────────────────────────────────────────────────

  if (!expanded) {
    return (
      <div className="rounded-xl" style={{ background: "#0E0E0E", border: "1px solid #1C1C1C" }}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
            }}
            placeholder={`Ask about ${clientName}…`}
            className="flex-1 bg-transparent outline-none"
            style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "#AAAAAA" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            className="shrink-0 transition-opacity"
            style={{ opacity: input.trim() ? 1 : 0.3, color: "#555" }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── Shared props for ChatPanel ─────────────────────────────────────────────

  const chatProps = {
    messages, loading, input, onInputChange: setInput, onSend: sendMessage,
    onArtifactSelect: setCurrentArtifact, currentArtifact, inputRef, messagesEndRef,
  };

  // ── Maximized modal ────────────────────────────────────────────────────────

  const modal = maximized ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) setMaximized(false); }}
    >
      <div
        className="flex flex-col w-full rounded-2xl overflow-hidden"
        style={{
          maxWidth: 1100,
          height: "80vh",
          background: "#0C0C0C",
          border: "1px solid #1C1C1C",
          animation: "panelExpand 0.2s ease-out",
        }}
      >
        {/* Modal header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #1A1A1A" }}>
          <span className="text-[12px] font-medium" style={{ color: "#555" }}>{clientName}</span>
          <button onClick={() => setMaximized(false)} className="transition-colors hover:text-[#FAFAFA]" style={{ color: "#444" }}>
            <X size={14} />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-col" style={{ width: showSplit ? "38%" : "100%", borderRight: showSplit ? "1px solid #1A1A1A" : "none" }}>
            <ChatPanel {...chatProps} />
          </div>
          {showSplit && (
            <div className="flex-1 min-w-0 overflow-y-auto p-6" style={{ background: "#0E0E0E" }}>
              <ArtifactRenderer artifact={currentArtifact!} />
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // ── Inline expanded ────────────────────────────────────────────────────────

  return (
    <>
      {modal}

      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid #1C1C1C",
          height: showSplit ? 440 : 320,
          display: "flex",
          flexDirection: "column",
          transition: "height 0.25s ease",
          animation: "panelExpand 0.25s ease-out",
        }}
      >
        {/* Toolbar */}
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2"
          style={{ borderBottom: "1px solid #1A1A1A", background: "#0C0C0C" }}
        >
          <span className="text-[11px]" style={{ color: "#333" }}>{clientName}</span>
          <button
            onClick={() => setMaximized(true)}
            title="Expand"
            className="transition-colors hover:text-[#AAAAAA]"
            style={{ color: "#333" }}
          >
            <Maximize2 size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Chat */}
          <div
            className="flex flex-col"
            style={{
              width: showSplit ? "40%" : "100%",
              borderRight: showSplit ? "1px solid #1A1A1A" : "none",
              background: "#0C0C0C",
              transition: "width 0.25s ease",
            }}
          >
            <ChatPanel {...chatProps} />
          </div>

          {/* Artifact panel — only when there's something to show */}
          {showSplit && (
            <div
              className="flex-1 min-w-0 overflow-y-auto p-5"
              style={{
                background: "#0E0E0E",
                animation: "artifactSlide 0.2s ease-out",
              }}
            >
              {loading ? (
                <div className="flex flex-col gap-3 animate-pulse">
                  <div className="h-3 rounded w-1/3" style={{ background: "#1A1A1A" }} />
                  <div className="h-3 rounded w-3/4" style={{ background: "#1A1A1A" }} />
                  <div className="h-3 rounded w-1/2" style={{ background: "#1A1A1A" }} />
                </div>
              ) : (
                <ArtifactRenderer artifact={currentArtifact!} />
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes panelExpand {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes artifactSlide {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
