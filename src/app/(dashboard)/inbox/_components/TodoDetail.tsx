"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, Loader2,
  ExternalLink, Download, Maximize2,
} from "lucide-react";
import type { InboxItem } from "../page";
import { PILL, type DisplayRow } from "./inbox-types";
import {
  DetailShell, SectionDivider,
  AttachmentCard, ClientBubble,
} from "./InboxShared";

export function TodoDetailView({
  row, item, onBack, busy, done, checked, onToggle, onComplete,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; item: InboxItem; onBack: () => void;
  busy: boolean; done: boolean; checked: Set<number>;
  onToggle: (idx: number) => void; onComplete: () => void;
  learningApproved?: number; learningThreshold?: number;
}) {
  const changes    = (item.proposed_action?.payload?.changes as string[] | undefined) ?? [];
  const allChecked = changes.length === 0 || checked.size === changes.length;
  const senderEmail = item.sender_email;

  const payload = item.proposed_action?.payload as Record<string, unknown> | undefined;
  const attachmentPath     = typeof payload?.attachment_path         === "string" ? payload.attachment_path         : null;
  const attachmentFilename = typeof payload?.attachment_filename     === "string" ? payload.attachment_filename     : null;
  const attachmentMime     = typeof payload?.attachment_content_type === "string" ? payload.attachment_content_type : null;
  const hasAttachment = Boolean(attachmentPath);
  const isPdf   = attachmentMime?.startsWith("application/pdf") ?? false;
  const isImage = attachmentMime?.startsWith("image/") ?? false;

  const [attachSignedUrl,  setAttachSignedUrl]  = useState<string | null>(null);
  const [attachLoading,    setAttachLoading]    = useState(false);
  const [attachError,      setAttachError]      = useState<string | null>(null);
  const [attachFullscreen, setAttachFullscreen] = useState(false);

  useEffect(() => {
    if (!hasAttachment) return;
    setAttachLoading(true); setAttachError(null);
    fetch(`/api/agent/review/${item.id}/attachment`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load document");
        const d = await r.json();
        setAttachSignedUrl(d.signedUrl);
      })
      .catch(() => setAttachError("Failed to load document"))
      .finally(() => setAttachLoading(false));
  }, [item.id, hasAttachment]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setAttachFullscreen(false); }
    if (attachFullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachFullscreen]);

  const actionBar = done ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <CheckCircle2 size={14} style={{ color: "var(--text-primary)" }} />
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Done — renewal proceeding.</span>
    </div>
  ) : (
    <>
      {changes.length > 0 && (
        <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: allChecked ? "var(--accent)" : "var(--text-secondary)" }}>
            {checked.size}/{changes.length}
          </span>{" "}done
        </span>
      )}
      <span style={{ flex: 1 }} />
      <button
        onClick={onComplete}
        disabled={!allChecked || busy}
        style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: allChecked && !busy ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 500, background: allChecked ? "var(--accent)" : "var(--surface-raised)", color: allChecked ? "var(--text-inverse)" : "var(--text-tertiary)", border: `1px solid ${allChecked ? "var(--accent)" : "var(--border)"}`, transition: "all 140ms", opacity: busy ? 0.5 : 1 }}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Confirm Renewal
      </button>
    </>
  );

  return (
    <DetailShell
      row={row} onBack={onBack} actionBar={actionBar}
      learningApproved={learningApproved}
      learningThreshold={learningThreshold}
    >
      {(item.signal_id !== null && item.raw_signal_snippet) && (
        <>
          <SectionDivider label="Conversation" />
          {senderEmail && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>From</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)" }}>{senderEmail}</span>
            </div>
          )}
          <ClientBubble
            name={item.policies?.client_name ?? "Client"}
            text={item.raw_signal_snippet}
            attachmentCard={hasAttachment ? (
              <AttachmentCard
                filename={attachmentFilename}
                mimeType={attachmentMime}
                signedUrl={attachSignedUrl}
                loading={attachLoading}
                error={attachError}
                onOpenFullscreen={() => setAttachFullscreen(true)}
                size="sm"
              />
            ) : undefined}
          />
          {hasAttachment && attachSignedUrl && (isPdf || isImage) && (
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{attachmentFilename ?? "Attachment"}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={attachSignedUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 8px", height: 24, borderRadius: 5, border: "1px solid var(--border)", background: "transparent", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                    <ExternalLink size={10} /> Open
                  </a>
                  <a href={attachSignedUrl} download={attachmentFilename ?? "attachment"} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 8px", height: 24, borderRadius: 5, border: "1px solid var(--border)", background: "transparent", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                    <Download size={10} /> Download
                  </a>
                  <button onClick={() => setAttachFullscreen(true)} style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>
              {isPdf ? (
                <iframe src={`${attachSignedUrl}#toolbar=0&navpanes=0`} title={attachmentFilename ?? "Document"} style={{ width: "100%", height: 480, border: "none", background: "#fff", display: "block" }} />
              ) : (
                <div style={{ background: "#fff", display: "flex", justifyContent: "center" }}>
                  <img src={attachSignedUrl} alt={attachmentFilename ?? "Attachment"} style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain", display: "block", cursor: "zoom-in" }} onClick={() => setAttachFullscreen(true)} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {changes.length > 0 && (
        <>
          <SectionDivider label="Hollis is waiting on you" color={PILL.todo.fg} />
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, padding: "8px 20px", display: "flex", flexDirection: "column" }}>
            {changes.map((change, idx) => {
              const on = checked.has(idx);
              return (
                <button
                  key={idx}
                  onClick={() => onToggle(idx)}
                  style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", background: "transparent", border: "none", borderTop: idx > 0 ? "1px solid var(--border-subtle)" : "none", cursor: "pointer" }}
                >
                  <div style={{ flexShrink: 0, marginTop: 2, width: 16, height: 16, borderRadius: 4, background: on ? "var(--accent)" : "transparent", border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms" }}>
                    {on && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="var(--text-inverse)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 14.5, lineHeight: 1.55, color: on ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: on ? "line-through" : "none", letterSpacing: "-0.003em" }}>
                    {change}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Fullscreen overlay */}
      {attachFullscreen && attachSignedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{attachmentFilename ?? "Document"}</span>
            <button onClick={() => setAttachFullscreen(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer" }}>
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {isPdf ? (
              <iframe src={attachSignedUrl} className="w-full h-full rounded-lg" style={{ border: "none" }} title={attachmentFilename ?? "Document"} />
            ) : isImage ? (
              <div className="w-full h-full flex items-center justify-center">
                <img src={attachSignedUrl} alt={attachmentFilename ?? "Document"} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </DetailShell>
  );
}
