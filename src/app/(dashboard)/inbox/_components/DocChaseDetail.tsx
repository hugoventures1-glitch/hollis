"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2, Send, Pencil,
  FileText, Download, ExternalLink, Maximize2, X, Paperclip,
} from "lucide-react";
import type { DocChaseReplyItem } from "../page";
import { PILL, type DisplayRow, timeAgo } from "./inbox-types";
import { DetailHeader, SectionDivider, AttachmentCard } from "./InboxShared";

// ── DocChase detail panel ────────────────────────────────────────────────────

function DocChaseDetailPanel({
  item,
  onMarkReceived,
  onReplySent,
  onRejected,
  addToast,
  onRestoreItem,
}: {
  item: DocChaseReplyItem;
  onMarkReceived: (id: string) => void;
  onReplySent: (id: string) => void;
  onRejected: (id: string) => void;
  addToast: (message: string, type: "success" | "error") => void;
  onRestoreItem?: (item: DocChaseReplyItem) => void;
}) {
  const [signedUrl,        setSignedUrl]        = useState<string | null>(null);
  const [urlLoading,       setUrlLoading]       = useState(false);
  const [urlError,         setUrlError]         = useState<string | null>(null);
  const [marking,          setMarking]          = useState(false);
  const [marked,           setMarked]           = useState(false);
  const [draftSubject,     setDraftSubject]     = useState(item.draft_reply_subject ?? "");
  const [draftBody,        setDraftBody]        = useState(item.draft_reply_body ?? "");
  const [sending,          setSending]          = useState(false);
  const [replySent,        setReplySent]        = useState(false);
  const [replyError,       setReplyError]       = useState<string | null>(null);
  const [validateError,    setValidateError]    = useState<string | null>(null);
  const [markError,        setMarkError]        = useState<string | null>(null);
  const [fullscreen,       setFullscreen]       = useState(false);
  const [validating,       setValidating]       = useState(false);
  const [validationResult, setValidationResult] = useState<{ verdict: string; summary: string; issues: string[] } | null>(null);
  const [refDocSuggestion, setRefDocSuggestion] = useState<{ clientId: string; storagePath: string; originalFilename: string; suggestedLabel: string } | null>(null);
  const [refDocAdded,      setRefDocAdded]      = useState(false);
  const [refDocBusy,       setRefDocBusy]       = useState(false);
  const [refDocError,      setRefDocError]      = useState<string | null>(null);
  const [isEditing,        setIsEditing]        = useState(false);
  const [rejecting,        setRejecting]        = useState(false);
  const [rejected,         setRejected]         = useState(false);
  const [rejectError,      setRejectError]      = useState<string | null>(null);
  const draftBodyRef = useRef<HTMLTextAreaElement>(null);

  const hasAttachment = Boolean(item.received_attachment_path);
  const isPdf  = item.received_attachment_content_type?.startsWith("application/pdf") ?? false;
  const isImage = item.received_attachment_content_type?.startsWith("image/") ?? false;
  const isReceived = item.status === "received" || marked;
  const hasDraft = Boolean(draftSubject || draftBody);
  const currentValidationStatus = validationResult?.verdict ?? item.validation_status;
  const canValidate = hasAttachment && !currentValidationStatus && !isReceived;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFullscreen(false); }
    if (fullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const fetchSignedUrl = useCallback(async () => {
    if (!hasAttachment) return;
    setUrlLoading(true); setUrlError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}/attachment`);
      if (!res.ok) throw new Error("Could not load document");
      const data = await res.json();
      setSignedUrl(data.signedUrl);
    } catch { setUrlError("Failed to load document"); }
    finally   { setUrlLoading(false); }
  }, [item.id, hasAttachment]);

  useEffect(() => {
    setSignedUrl(null); setUrlError(null); setMarked(false); setReplySent(false);
    setDraftSubject(item.draft_reply_subject ?? "");
    setDraftBody(item.draft_reply_body ?? "");
    setValidationResult(null); setRefDocSuggestion(null); setRefDocAdded(false); setRefDocError(null);
    fetchSignedUrl();
  }, [fetchSignedUrl, item.id, item.draft_reply_subject, item.draft_reply_body]);

  useEffect(() => {
    const el = draftBodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [draftBody]);

  async function handleMarkReceived() {
    setMarking(true); setMarkError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "received" }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to mark received"); }
      setMarked(true); onMarkReceived(item.id);
    } catch (err) { setMarkError(err instanceof Error ? err.message : "Failed to mark received"); }
    finally       { setMarking(false); }
  }

  function handleSendReply() {
    const snapshot = item;
    onReplySent(item.id);
    fetch(`/api/doc-chase/${item.id}/send-reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: draftSubject, body: draftBody }) })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to send reply"); }
        addToast(`Reply sent to ${item.client_name}`, "success");
      })
      .catch(() => {
        onRestoreItem?.(snapshot);
        addToast(`Failed to send reply — item restored to inbox`, "error");
      });
  }

  async function handleValidate() {
    setValidating(true); setValidateError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}/validate-stored`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Validation failed"); }
      const data = await res.json();
      setValidationResult({ verdict: data.verdict, summary: data.summary, issues: data.issues ?? [] });
      if (data.verdict === "pass") {
        setMarked(true); onMarkReceived(item.id);
        if (data.ref_doc_suggestion) setRefDocSuggestion({ clientId: data.ref_doc_suggestion.client_id, storagePath: data.ref_doc_suggestion.storage_path, originalFilename: data.ref_doc_suggestion.original_filename, suggestedLabel: data.ref_doc_suggestion.suggested_label });
      }
      if (data.draft_subject) setDraftSubject(data.draft_subject);
      if (data.draft_body)    setDraftBody(data.draft_body);
    } catch (err) { setValidateError(err instanceof Error ? err.message : "Validation failed"); }
    finally       { setValidating(false); }
  }

  async function handleAddToRefDocs() {
    if (!refDocSuggestion) return;
    setRefDocBusy(true); setRefDocError(null);
    try {
      const res = await fetch(`/api/clients/${refDocSuggestion.clientId}/reference-docs/from-suggestion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: refDocSuggestion.storagePath, original_filename: refDocSuggestion.originalFilename, suggested_label: refDocSuggestion.suggestedLabel }) });
      const data = await res.json();
      if (!res.ok) { setRefDocError(data.error ?? "Failed"); return; }
      setRefDocAdded(true);
    } catch { setRefDocError("Network error — please try again"); }
    finally  { setRefDocBusy(false); }
  }

  function handleReject() {
    const snapshot = item;
    onRejected(item.id);
    fetch(`/api/doc-chase/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to reject"); }
        addToast(`Rejected — no reply sent to ${item.client_name}`, "success");
      })
      .catch(() => {
        onRestoreItem?.(snapshot);
        addToast(`Failed to reject — item restored to inbox`, "error");
      });
  }

  const dcFg = PILL.docchase.fg;
  const decisionFg = PILL.decision.fg;

  const actionBar = replySent ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: "color-mix(in oklch, var(--accent) 22%, transparent)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Send size={10} strokeWidth={2.4} />
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Reply sent.</span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Hollis dispatched to {item.client_name}.</span>
    </div>
  ) : rejected ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: "rgba(220,38,38,0.12)", color: "var(--danger)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <XCircle size={11} />
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>Rejected.</span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No reply sent to {item.client_name}.</span>
    </div>
  ) : isEditing ? (
    <>
      <button onClick={handleSendReply} disabled={sending || !draftBody.trim()} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: sending || !draftBody.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: sending || !draftBody.trim() ? 0.5 : 1 }}>
        {sending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Save & send
      </button>
      <button onClick={() => { setIsEditing(false); setDraftSubject(item.draft_reply_subject ?? ""); setDraftBody(item.draft_reply_body ?? ""); }} disabled={sending} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
        Cancel
      </button>
      {replyError && <span style={{ fontSize: 12, color: "#f87171", marginLeft: 8 }}>{replyError}</span>}
    </>
  ) : (
    <>
      <button onClick={handleSendReply} disabled={sending || !draftBody.trim()} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: sending || !draftBody.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: sending || !draftBody.trim() ? 0.4 : 1, transition: "opacity 120ms" }}>
        {sending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Approve & send
      </button>
      <button onClick={() => setIsEditing(true)} disabled={sending} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      >
        <Pencil size={12} /> Edit draft
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={handleReject} disabled={rejecting} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: rejecting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", opacity: rejecting ? 0.5 : 1 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,41,41,0.4)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        {rejecting ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
        Reject
      </button>
      {(rejectError || replyError || markError || validateError) && (
        <span style={{ fontSize: 12, color: "#f87171", marginLeft: 8 }}>
          {rejectError ?? replyError ?? markError ?? validateError}
        </span>
      )}
    </>
  );

  return (
    <>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 28px 60px", display: "flex", flexDirection: "column", gap: 24 }}>

          <SectionDivider label="Client reply" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, padding: "0 4px", flexDirection: "row-reverse" }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{item.client_name}</span>
              {item.client_email && <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{item.client_email}</span>}
              {item.last_client_reply_at && <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{timeAgo(item.last_client_reply_at)}</span>}
            </div>
            <div style={{ maxWidth: "75%", fontSize: 14, lineHeight: 1.6, letterSpacing: "-0.003em", padding: "10px 14px", borderRadius: 12, borderTopRightRadius: 4, background: "var(--surface-raised)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)", whiteSpace: "pre-wrap" }}>
              {item.last_client_reply || <span style={{ fontStyle: "italic", color: "var(--text-tertiary)" }}>No message body — document attached.</span>}
            </div>
            {hasAttachment && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 4 }}>
                <AttachmentCard
                  filename={item.received_attachment_filename ?? null}
                  mimeType={item.received_attachment_content_type ?? null}
                  signedUrl={signedUrl}
                  loading={urlLoading}
                  error={urlError}
                  onOpenFullscreen={() => setFullscreen(true)}
                  size="md"
                />
              </div>
            )}
          </div>

          {hasAttachment && (
            <>
              <SectionDivider label="Document check" color={dcFg} />
              <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {!currentValidationStatus ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13.5, color: "var(--text-secondary)", flex: 1 }}>
                      {urlLoading ? "Loading attachment…" : "Hollis hasn't read the attachment yet."}
                    </span>
                    {canValidate && (
                      <button onClick={handleValidate} disabled={validating} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 7, cursor: validating ? "default" : "pointer", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", fontSize: 12.5, opacity: validating ? 0.6 : 1 }}>
                        {validating ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                        {validating ? "Validating…" : "Run check"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                        ...(currentValidationStatus === "pass"    ? { background: "rgba(22,163,74,0.10)",  color: "#4ade80", border: "1px solid rgba(22,163,74,0.20)"  } :
                            currentValidationStatus === "fail"    ? { background: "rgba(220,38,38,0.10)",  color: "#f87171", border: "1px solid rgba(220,38,38,0.20)"  } :
                                                                    { background: "rgba(245,158,11,0.10)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.20)" }),
                      }}>
                        {currentValidationStatus === "pass" ? <CheckCircle2 size={10} strokeWidth={2.4} /> : <XCircle size={10} strokeWidth={2.4} />}
                        {currentValidationStatus.charAt(0).toUpperCase() + currentValidationStatus.slice(1)}
                      </span>
                      {item.received_attachment_filename && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.received_attachment_filename}</span>
                      )}
                    </div>
                    {(validationResult?.summary ?? item.validation_summary) && (
                      <div style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {validationResult?.summary ?? item.validation_summary}
                      </div>
                    )}
                    {((validationResult?.issues ?? item.validation_issues) ?? []).length > 0 && (
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                        {(validationResult?.issues ?? item.validation_issues ?? []).map((issue, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#f87171" }}>
                            <span style={{ flexShrink: 0 }}>·</span><span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {validateError && <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{validateError}</p>}
              </div>

              {refDocSuggestion && (
                <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      Add <strong style={{ color: "var(--text-primary)" }}>{refDocSuggestion.suggestedLabel}</strong> to this client&apos;s AI reference docs?
                    </p>
                    {refDocAdded ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#4ade80" }}>
                        <CheckCircle2 size={12} /> Added
                      </span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {refDocError && <span style={{ fontSize: 11, color: "#f87171" }}>{refDocError}</span>}
                        <button onClick={handleAddToRefDocs} disabled={refDocBusy} style={{ height: 28, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", fontSize: 11, fontWeight: 600, color: refDocBusy ? "var(--text-secondary)" : "var(--text-primary)", cursor: refDocBusy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                          {refDocBusy && <Loader2 size={10} className="animate-spin" />} Add
                        </button>
                        <button onClick={() => setRefDocSuggestion(null)} style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {hasAttachment && signedUrl && (isPdf || isImage) && (
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.received_attachment_filename ?? "Attachment"}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={signedUrl} download={item.received_attachment_filename ?? "attachment"} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 8px", height: 24, borderRadius: 5, border: "1px solid var(--border)", background: "transparent", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                    <Download size={10} /> Download
                  </a>
                  <button onClick={() => setFullscreen(true)} style={{ color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", display: "flex" }}>
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>
              {isPdf ? (
                <iframe src={`${signedUrl}#toolbar=0&navpanes=0`} title={item.received_attachment_filename ?? "Document"} style={{ width: "100%", height: 480, border: "none", background: "#fff", display: "block" }} />
              ) : (
                <div style={{ background: "#fff", display: "flex", justifyContent: "center" }}>
                  <img src={signedUrl} alt={item.received_attachment_filename ?? "Attachment"} style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain", display: "block", cursor: "zoom-in" }} onClick={() => setFullscreen(true)} />
                </div>
              )}
            </div>
          )}

          {hasDraft && (
            <>
              <SectionDivider label="Reply to send" color={decisionFg} />
              <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", fontSize: 12.5, color: "var(--text-tertiary)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: decisionFg, fontWeight: 600 }}>
                    <Send size={11} /> {replySent ? "Sent" : "Ready to send"}
                  </span>
                  <span style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>·</span>
                  <span>To <span style={{ color: "var(--text-secondary)" }}>{item.client_email || item.client_name}</span></span>
                  <span style={{ flex: 1 }} />
                  <span>From Hollis on your behalf</span>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 16, color: "var(--text-primary)", fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {draftSubject}
                  </div>
                  {isEditing ? (
                    <textarea
                      ref={draftBodyRef}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      rows={9}
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.65, fontFamily: "inherit", resize: "vertical", outline: "none", width: "100%" }}
                    />
                  ) : (
                    <div style={{ fontSize: 14.5, lineHeight: 1.7, color: replySent ? "var(--text-tertiary)" : "var(--text-primary)", whiteSpace: "pre-wrap", letterSpacing: "-0.003em" }}>
                      {draftBody}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 28px", flexShrink: 0 }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
          {actionBar}
        </div>
      </div>

      {fullscreen && signedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{item.received_attachment_filename ?? "Document"}</span>
            </div>
            <div className="flex items-center gap-3">
              <a href={signedUrl} download={item.received_attachment_filename ?? "attachment"} className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <Download size={14} /> Download
              </a>
              <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.55)" }}>
                <ExternalLink size={14} /> Open in tab
              </a>
              <button onClick={() => setFullscreen(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer" }}>
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {isPdf ? (
              <iframe src={signedUrl} className="w-full h-full rounded-lg" style={{ border: "none" }} title={item.received_attachment_filename ?? "Document"} />
            ) : isImage ? (
              <div className="w-full h-full flex items-center justify-center">
                <img src={signedUrl} alt={item.received_attachment_filename ?? "Document"} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

// ── DocChase detail shell ─────────────────────────────────────────────────────

export function DocChaseDetail({
  row, item, onBack, onMarkReceived, onReplySent, onRejected,
  learningApproved, learningThreshold, addToast, onRestoreItem,
}: {
  row: DisplayRow; item: DocChaseReplyItem; onBack: () => void;
  onMarkReceived: (id: string) => void; onReplySent: (id: string) => void; onRejected: (id: string) => void;
  learningApproved?: number; learningThreshold?: number;
  addToast: (message: string, type: "success" | "error") => void;
  onRestoreItem?: (item: DocChaseReplyItem) => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <DetailHeader row={row} onBack={onBack} learningApproved={learningApproved} learningThreshold={learningThreshold} />
      <div style={{ padding: "32px 28px 8px", flexShrink: 0, maxWidth: 820, margin: "0 auto", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.022em", lineHeight: 1.3 }}>
          {row.headline}
        </h1>
      </div>
      <DocChaseDetailPanel item={item} onMarkReceived={onMarkReceived} onReplySent={onReplySent} onRejected={onRejected} addToast={addToast} onRestoreItem={onRestoreItem} />
    </div>
  );
}
