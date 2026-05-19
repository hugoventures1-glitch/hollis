"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, XCircle, Pencil, Loader2,
  Send, FileText, ExternalLink, Download, Maximize2, X,
} from "lucide-react";
import type { InboxItem } from "../page";
import { intentLabel, confidenceColors, type DisplayRow, PILL } from "./inbox-types";
import {
  DetailShell, SectionDivider, FlagPill,
  AttachmentCard, ClientBubble, HollisSentBubble,
} from "./InboxShared";

export function DecisionDetail({
  row, item, onBack, busy, sent, sentAction,
  isEditing, editedBody, errorMsg,
  onApprove, onReject, onEdit, onEditedBodyChange, onConfirmEdit, onCancelEdit,
  learningApproved, learningThreshold,
}: {
  row: DisplayRow; item: InboxItem; onBack: () => void;
  busy: boolean; sent: boolean; sentAction: "approved" | "rejected" | "edited" | null;
  isEditing: boolean; editedBody: string; errorMsg: string | null;
  onApprove: () => void; onReject: () => void; onEdit: () => void;
  onEditedBodyChange: (v: string) => void; onConfirmEdit: () => void; onCancelEdit: () => void;
  learningApproved?: number; learningThreshold?: number;
}) {
  const conf = confidenceColors(item.confidence_score);
  const draftBody    = typeof item.proposed_action?.payload?.body    === "string" ? item.proposed_action.payload.body    : null;
  const draftSubject = typeof item.proposed_action?.payload?.subject === "string" ? item.proposed_action.payload.subject : intentLabel(item.classified_intent);
  const recipientEmail = typeof item.proposed_action?.payload?.to   === "string" ? item.proposed_action.payload.to      : item.policies?.client_name ?? "client";
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

  const actionBar = sent ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: sentAction === "rejected" ? "rgba(220,38,38,0.12)" : "rgba(26,25,23,0.10)", color: sentAction === "rejected" ? "var(--danger)" : "var(--text-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {sentAction === "rejected" ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
        {sentAction === "rejected" ? "Rejected." : sentAction === "edited" ? "Edits saved & approved." : "Approved."}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
        {sentAction === "rejected"
          ? `No outreach sent to ${item.policies?.client_name ?? "client"}.`
          : `Hollis is dispatching to ${item.policies?.client_name ?? "client"}.`}
      </span>
    </div>
  ) : isEditing ? (
    <>
      <button onClick={onConfirmEdit} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: busy ? 0.5 : 1 }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Save & approve
      </button>
      <button onClick={onCancelEdit} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
        Cancel
      </button>
    </>
  ) : (
    <>
      <button onClick={onApprove} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: busy ? 0.5 : 1 }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Approve & send
      </button>
      <button onClick={onEdit} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      >
        <Pencil size={12} /> Edit draft
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={onReject} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,41,41,0.4)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        <XCircle size={12} /> Reject
      </button>
    </>
  );

  return (
    <DetailShell
      row={row} onBack={onBack} actionBar={actionBar}
      learningApproved={learningApproved}
      learningThreshold={learningThreshold}
    >
      {(item.sent_emails.length > 0 || (item.signal_id !== null && (item.raw_signal ?? item.raw_signal_snippet))) && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SectionDivider label="Conversation" />
          </div>
          {senderEmail && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>From</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)" }}>{senderEmail}</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {item.sent_emails.length > 0 && item.sent_emails.map((email) => (
              <HollisSentBubble
                key={email.id}
                snapshot={email.content_snapshot}
                recipient={email.recipient}
                sentAt={email.created_at}
              />
            ))}
            {item.signal_id !== null && (item.raw_signal ?? item.raw_signal_snippet) && (
              <ClientBubble
                name={item.policies?.client_name ?? "Client"}
                text={(item.raw_signal ?? item.raw_signal_snippet)!}
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
            )}
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
            {item.proposed_action?.description && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "2px 12px", color: "var(--text-tertiary)", fontSize: 12.5, lineHeight: 1.6 }}>
                <span style={{ marginTop: 3, flexShrink: 0 }}>✦</span>
                <span style={{ flex: 1 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Hollis</span>
                  <span style={{ margin: "0 6px" }}>·</span>
                  <span>{item.proposed_action.description}</span>
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <SectionDivider label="Hollis reasoning" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.7 }}>
        <span style={{ marginTop: 3, flexShrink: 0, color: "var(--text-tertiary)", fontSize: 13 }}>✦</span>
        {item.confidence_score == null ? (
          <div style={{ flex: 1 }}>
            <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Hollis scheduled this outreach.</strong>{" "}
            <span>This touchpoint was queued automatically by the renewal campaign — no inbound signal was received.</span>
          </div>
        ) : (
          <>
            <div style={{ flex: 1 }}>
              <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>Hollis reviewed this signal.</strong>{" "}
              <span><strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{intentLabel(item.classified_intent)}</strong> detected with <strong style={{ color: conf.fg, fontWeight: 600 }}>{Math.round(item.confidence_score * 100)}% confidence</strong>.</span>
              {row.flagPills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {row.flagPills.map((flag) => (
                    <FlagPill key={flag} text={flag} />
                  ))}
                </div>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, padding: "3px 9px", borderRadius: 999, background: conf.bg, color: conf.fg, border: `1px solid ${conf.bd}` }}>
              {Math.round(item.confidence_score * 100)}%
            </span>
          </>
        )}
      </div>

      {draftBody && (
        <>
          <SectionDivider label="Outreach to send" color={PILL.decision.fg} />
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", fontSize: 12.5, color: "var(--text-tertiary)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: PILL.decision.fg, fontWeight: 600 }}>
                <Send size={11} /> Ready to send
              </span>
              <span>·</span>
              <span>To <span style={{ color: "var(--text-secondary)" }}>{recipientEmail}</span></span>
              <span style={{ flex: 1 }} />
              <span>From Hollis on your behalf</span>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 16, color: "var(--text-primary)", fontWeight: 600, letterSpacing: "-0.01em" }}>
                {draftSubject}
              </div>
              {isEditing ? (
                <textarea
                  value={editedBody}
                  onChange={(e) => onEditedBodyChange(e.target.value)}
                  rows={9}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.65, fontFamily: "inherit", resize: "vertical", outline: "none", width: "100%" }}
                />
              ) : (
                <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap", letterSpacing: "-0.003em" }}>
                  {draftBody}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(204,41,41,0.06)", border: "1px solid rgba(204,41,41,0.2)", fontSize: 13, color: "var(--danger)" }}>
          {errorMsg}
        </div>
      )}

      {attachFullscreen && attachSignedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{attachmentFilename ?? "Document"}</span>
            </div>
            <div className="flex items-center gap-3">
              <a href={attachSignedUrl} download={attachmentFilename ?? "attachment"} className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <Download size={14} /> Download
              </a>
              <a href={attachSignedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <ExternalLink size={14} /> Open in tab
              </a>
              <button onClick={() => setAttachFullscreen(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer" }}>
                <X size={13} /> Close
              </button>
            </div>
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
