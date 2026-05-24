"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ArrowUpRight,
  FileText,
  ExternalLink,
  Maximize2,
  Loader2,
  Paperclip,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { PILL, type ItemType, type DisplayRow } from "./inbox-types";
import { LEARNING_MODE_THRESHOLD } from "@/lib/agent/tier-constants";

// ── CSS animations (injected once) ───────────────────────────────────────────

export function FlashingDotStyle() {
  return (
    <style>{`
      @keyframes escalation-pulse {
        0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(220,38,38,0.55); }
        50% { opacity: 0.65; transform: scale(1.15); box-shadow: 0 0 0 6px rgba(220,38,38,0); }
      }
      @keyframes escalation-slide-in {
        from { opacity: 0; transform: translateY(-12px); max-height: 0; }
        to { opacity: 1; transform: translateY(0); max-height: 500px; }
      }
      .escalation-dot {
        animation: escalation-pulse 1.6s ease-in-out infinite;
      }
      .escalation-section {
        animation: escalation-slide-in 400ms ease-out forwards;
        overflow: hidden;
      }
    `}</style>
  );
}

// ── Type pill ─────────────────────────────────────────────────────────────────

export function TypePill({ type, unread = true }: { type: ItemType; unread?: boolean }) {
  const s = PILL[type];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 999,
        background: unread ? s.bg : s.bgMuted,
        color: unread ? s.fg : s.fgMuted,
        fontSize: 12, fontWeight: unread ? 600 : 400,
        whiteSpace: "nowrap",
        transition: "background 150ms, color 150ms",
      }}
    >
      {s.label}
    </span>
  );
}

// ── Flag pill ─────────────────────────────────────────────────────────────────

export function FlagPill({ text }: { text: string }) {
  const label = text.replace(/^Flagged:\s*/i, "");
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "3px 10px", borderRadius: 999,
        background: "rgba(245,158,11,0.10)",
        color: "oklch(0.50 0.13 75)",
        border: "1px solid rgba(245,158,11,0.22)",
        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

export function SectionDivider({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
      <span
        style={{
          fontSize: 10.5, fontWeight: 600,
          letterSpacing: "0.1em", textTransform: "uppercase",
          color: color ?? "var(--text-tertiary)", whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
    </div>
  );
}

// ── Filter tab ────────────────────────────────────────────────────────────────

export function FilterTab({
  active, label, count, onClick,
}: {
  active: boolean; label: string; count: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "9px 0",
        background: "transparent", border: "none",
        borderBottom: `1.5px solid ${active ? "var(--text-primary)" : "transparent"}`,
        marginBottom: -1,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        fontSize: 12.5, fontWeight: 500, cursor: "pointer",
        transition: "color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 600, lineHeight: 1,
          background: active ? "var(--text-primary)" : "rgba(0,0,0,0.08)",
          color: active ? "var(--bg-primary, #fff)" : "var(--text-tertiary)",
          padding: "2px 5px", borderRadius: 999,
          fontVariantNumeric: "tabular-nums",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Learning status badge ─────────────────────────────────────────────────────

export function LearningStatusBadge({ approved, threshold }: { approved: number; threshold: number }) {
  const pct = Math.min(approved / threshold, 1);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px", borderRadius: 999,
        background: "rgba(59,130,246,0.10)",
        color: "#3b82f6",
        border: "1px solid rgba(59,130,246,0.22)",
        fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ width: 28, height: 4, borderRadius: 999, background: "rgba(59,130,246,0.15)", overflow: "hidden", flexShrink: 0 }}>
        <span style={{ display: "block", height: "100%", width: `${pct * 100}%`, borderRadius: 999, background: "#3b82f6", transition: "width 300ms ease" }} />
      </span>
      {approved} of {threshold} approvals
    </span>
  );
}

// ── Attachment card ───────────────────────────────────────────────────────────

export interface AttachmentCardProps {
  filename: string | null;
  mimeType: string | null;
  signedUrl: string | null;
  loading: boolean;
  error: string | null;
  onOpenFullscreen: () => void;
  size?: "sm" | "md";
}

export function AttachmentCard({ filename, mimeType, signedUrl, loading, error, onOpenFullscreen, size = "md" }: AttachmentCardProps) {
  const isPdf   = mimeType?.startsWith("application/pdf") ?? false;
  const isImage = mimeType?.startsWith("image/") ?? false;
  const iconSize    = size === "sm" ? 11 : 12;
  const cardPadding = size === "sm" ? "6px 10px" : "8px 12px";
  const iconBoxSize = size === "sm" ? 18 : 22;
  const fontSize    = size === "sm" ? 11.5 : 12.5;

  return (
    <div
      onClick={signedUrl ? onOpenFullscreen : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: cardPadding,
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        fontSize,
        color: "var(--text-secondary)",
        cursor: signedUrl ? "pointer" : "default",
        transition: "border-color 120ms, box-shadow 120ms",
        marginTop: 4,
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        if (!signedUrl) return;
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      <span style={{
        width: iconBoxSize, height: iconBoxSize, borderRadius: 5,
        background: "var(--surface)",
        color: "var(--text-tertiary)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <FileText size={iconSize} />
      </span>
      <span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{filename ?? "Attachment"}</span>
        {mimeType && (
          <>
            <span style={{ color: "var(--text-tertiary)", margin: "0 5px" }}>·</span>
            <span style={{ color: "var(--text-tertiary)" }}>{isPdf ? "PDF" : isImage ? "Image" : "File"}</span>
          </>
        )}
      </span>
      {loading && <Loader2 size={iconSize - 1} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />}
      {error   && <span style={{ fontSize: 10.5, color: "#f87171" }}>{error}</span>}
      {signedUrl && (
        <>
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 2, color: "var(--accent)", fontSize: size === "sm" ? 10.5 : 11, textDecoration: "none" }}
          >
            <ExternalLink size={iconSize - 1} />
            Open
          </a>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 2, color: "var(--text-tertiary)", fontSize: size === "sm" ? 10.5 : 11 }}>
            <Maximize2 size={iconSize - 1} />
            View
          </span>
        </>
      )}
    </div>
  );
}

// ── Client bubble ─────────────────────────────────────────────────────────────

export function ClientBubble({ name, text, attachmentCard }: {
  name: string;
  text: string;
  attachmentCard?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, background: "var(--border)", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, border: "1px solid var(--border-subtle)" }}>
        {name[0].toUpperCase()}
      </div>
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, padding: "0 4px", flexDirection: "row-reverse" }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{name}</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, letterSpacing: "-0.003em", padding: "10px 14px", borderRadius: 12, borderTopRightRadius: 4, background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>
          {text}
        </div>
        {attachmentCard}
      </div>
    </div>
  );
}

// ── Hollis sent bubble ────────────────────────────────────────────────────────

export function HollisSentBubble({ snapshot, recipient, sentAt }: {
  snapshot: string | null;
  recipient: string | null;
  sentAt: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const firstLine = snapshot?.split("\n")[0] ?? "";
  const subject = firstLine.startsWith("Subject:") ? firstLine.replace(/^Subject:\s*/, "") : null;
  const body = snapshot?.includes("\n\n") ? snapshot.slice(snapshot.indexOf("\n\n") + 2) : snapshot;

  const timeStr = new Date(sentAt).toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, background: "var(--accent)", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, border: "1px solid transparent" }}>
        ✦
      </div>
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, padding: "0 4px" }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Hollis</span>
          {recipient && <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>→ {recipient}</span>}
          <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{timeStr}</span>
        </div>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: 13.5, lineHeight: 1.65, padding: "10px 14px", borderRadius: 12, borderTopLeftRadius: 4, background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", cursor: "pointer", transition: "border-color 120ms" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
              {subject ?? "Email"}
            </div>
            <span style={{ color: "var(--text-tertiary)", flexShrink: 0, transition: "transform 220ms ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
              <ChevronDown size={12} />
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", transition: "grid-template-rows 260ms ease" }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap", paddingTop: 10, opacity: expanded ? 1 : 0, transition: "opacity 200ms ease 60ms" }}>
                {body}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail header ─────────────────────────────────────────────────────────────

export function DetailHeader({ row, onBack, learningApproved, learningThreshold }: {
  row: DisplayRow;
  onBack: () => void;
  learningApproved?: number;
  learningThreshold?: number;
}) {
  const isUrgent = row.expiryDays !== null && row.expiryDays <= 7;
  const policyRef = row.inboxItem?.policies?.policy_name?.match(/\bPOL-\d{4}-\d{4}\b/i)?.[0] ?? null;
  const liveIsLearning = (learningApproved ?? 0) < (learningThreshold ?? LEARNING_MODE_THRESHOLD);

  return (
    <header style={{ padding: "14px 28px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 14, flexShrink: 0, height: 56 }}>
      <button
        onClick={onBack}
        style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px 6px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}
      >
        <ChevronLeft size={14} />
        Inbox
      </button>

      <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
      <TypePill type={row.type} />

      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {row.client}
      </span>

      {policyRef && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {policyRef}
        </span>
      )}

      {row.type === "decision" && liveIsLearning && learningApproved !== undefined && (
        <LearningStatusBadge approved={learningApproved} threshold={learningThreshold ?? LEARNING_MODE_THRESHOLD} />
      )}

      <span style={{ flex: 1 }} />

      {row.expiryDays !== null && (
        <span style={{ fontSize: 12, fontWeight: 500, color: isUrgent ? "var(--danger)" : "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {row.expiryDays}d to expiry
        </span>
      )}

      {row.inboxItem?.policies && (
        <Link
          href={`/renewals/${row.inboxItem.policies.id}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 7, padding: "5px 10px", fontSize: 12.5, textDecoration: "none" }}
        >
          Open policy <ArrowUpRight size={11} />
        </Link>
      )}
    </header>
  );
}

// ── Detail shell ──────────────────────────────────────────────────────────────

export function DetailShell({
  row, onBack, children, actionBar,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; onBack: () => void; children: React.ReactNode; actionBar?: React.ReactNode;
  learningApproved?: number; learningThreshold?: number;
}) {
  const policy = row.inboxItem?.policies;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <DetailHeader row={row} onBack={onBack} learningApproved={learningApproved} learningThreshold={learningThreshold} />

      <div style={{ padding: "32px 28px 8px", flexShrink: 0, maxWidth: 820, margin: "0 auto", width: "100%" }}>
        {policy && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
              {policy.policy_name}
            </span>
            {policy.carrier && (
              <>
                <span style={{ color: "var(--text-tertiary)" }}>·</span>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{policy.carrier}</span>
              </>
            )}
          </div>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.022em", lineHeight: 1.3 }}>
          {row.headline}
        </h1>
        {row.flagPills.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {row.flagPills.map((pill, i) => <FlagPill key={i} text={pill} />)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 24 }}>
          {children}
        </div>
      </div>

      {actionBar && (
        <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 28px", flexShrink: 0 }}>
          <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            {actionBar}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attachment viewer hook (shared across detail views) ───────────────────────

export function useAttachmentViewer(itemId: string, payload: Record<string, unknown> | undefined) {
  const attachmentPath     = typeof payload?.attachment_path         === "string" ? payload.attachment_path         : null;
  const attachmentFilename = typeof payload?.attachment_filename     === "string" ? payload.attachment_filename     : null;
  const attachmentMime     = typeof payload?.attachment_content_type === "string" ? payload.attachment_content_type : null;
  const hasAttachment = Boolean(attachmentPath);

  const [attachSignedUrl,  setAttachSignedUrl]  = useState<string | null>(null);
  const [attachLoading,    setAttachLoading]    = useState(false);
  const [attachError,      setAttachError]      = useState<string | null>(null);
  const [attachFullscreen, setAttachFullscreen] = useState(false);

  useEffect(() => {
    if (!hasAttachment) return;
    setAttachLoading(true); setAttachError(null);
    fetch(`/api/agent/review/${itemId}/attachment`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load document");
        const d = await r.json();
        setAttachSignedUrl(d.signedUrl);
      })
      .catch(() => setAttachError("Failed to load document"))
      .finally(() => setAttachLoading(false));
  }, [itemId, hasAttachment]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setAttachFullscreen(false); }
    if (attachFullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachFullscreen]);

  return {
    attachmentFilename,
    attachmentMime,
    hasAttachment,
    isPdf:   attachmentMime?.startsWith("application/pdf") ?? false,
    isImage: attachmentMime?.startsWith("image/") ?? false,
    attachSignedUrl,
    attachLoading,
    attachError,
    attachFullscreen,
    setAttachFullscreen,
  };
}
