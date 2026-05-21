"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2,
  FileText, Download, ExternalLink, Maximize2, X,
} from "lucide-react";
import type { DocChaseReplyItem } from "../page";
import { PILL, type DisplayRow, timeAgo } from "./inbox-types";
import { DetailHeader } from "./InboxShared";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDocType(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── DocChase detail ───────────────────────────────────────────────────────────

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
  const [signedUrl,        setSignedUrl]        = useState<string | null>(null);
  const [urlLoading,       setUrlLoading]       = useState(false);
  const [marking,          setMarking]          = useState(false);
  const [markError,        setMarkError]        = useState<string | null>(null);
  const [validating,       setValidating]       = useState(false);
  const [validateError,    setValidateError]    = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ verdict: string; summary: string; issues: string[] } | null>(null);
  const [refDocSuggestion, setRefDocSuggestion] = useState<{ clientId: string; storagePath: string; originalFilename: string; suggestedLabel: string } | null>(null);
  const [refDocAdded,      setRefDocAdded]      = useState(false);
  const [refDocBusy,       setRefDocBusy]       = useState(false);
  const [refDocError,      setRefDocError]      = useState<string | null>(null);
  const [fullscreen,       setFullscreen]       = useState(false);

  const hasAttachment  = Boolean(item.received_attachment_path);
  const isPdf          = item.received_attachment_content_type?.startsWith("application/pdf") ?? false;
  const isImage        = item.received_attachment_content_type?.startsWith("image/") ?? false;
  const isPreviewable  = isPdf || isImage;
  const currentValidationStatus = validationResult?.verdict ?? item.validation_status;

  // Escape key closes fullscreen
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFullscreen(false); }
    if (fullscreen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const fetchSignedUrl = useCallback(async () => {
    if (!hasAttachment) return;
    setUrlLoading(true);
    try {
      const res  = await fetch(`/api/doc-chase/${item.id}/attachment`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSignedUrl(data.signedUrl);
    } catch { /* silent — download link still works */ }
    finally   { setUrlLoading(false); }
  }, [item.id, hasAttachment]);

  const runValidation = useCallback(async () => {
    setValidating(true); setValidateError(null);
    try {
      const res  = await fetch(`/api/doc-chase/${item.id}/validate-stored`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Validation failed"); }
      const data = await res.json();
      setValidationResult({ verdict: data.verdict, summary: data.summary, issues: data.issues ?? [] });
      if (data.verdict === "pass") {
        onMarkReceived(item.id);
        if (data.ref_doc_suggestion) {
          setRefDocSuggestion({ clientId: data.ref_doc_suggestion.client_id, storagePath: data.ref_doc_suggestion.storage_path, originalFilename: data.ref_doc_suggestion.original_filename, suggestedLabel: data.ref_doc_suggestion.suggested_label });
        }
      }
    } catch (err) { setValidateError(err instanceof Error ? err.message : "Validation failed"); }
    finally       { setValidating(false); }
  }, [item.id, onMarkReceived]);

  // Reset state on item change and fetch signed URL
  useEffect(() => {
    setSignedUrl(null); setMarkError(null); setValidationResult(null);
    setRefDocSuggestion(null); setRefDocAdded(false); setRefDocError(null); setValidateError(null);
    fetchSignedUrl();
  }, [fetchSignedUrl, item.id]);

  // Auto-validate on open if no prior result exists
  useEffect(() => {
    if (hasAttachment && !item.validation_status) {
      runValidation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function handleMarkReceived() {
    setMarking(true); setMarkError(null);
    try {
      const res = await fetch(`/api/doc-chase/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "received" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to mark received"); }
      onMarkReceived(item.id);
    } catch (err) { setMarkError(err instanceof Error ? err.message : "Failed to mark received"); }
    finally       { setMarking(false); }
  }

  function handleReject() {
    const snapshot = item;
    onRejected(item.id);
    fetch(`/api/doc-chase/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed"); }
        addToast(`Rejected — no reply sent to ${item.client_name}`, "success");
      })
      .catch(() => {
        onRestoreItem?.(snapshot);
        addToast(`Failed to reject — item restored to inbox`, "error");
      });
  }

  async function handleAddToRefDocs() {
    if (!refDocSuggestion) return;
    setRefDocBusy(true); setRefDocError(null);
    try {
      const res  = await fetch(`/api/clients/${refDocSuggestion.clientId}/reference-docs/from-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: refDocSuggestion.storagePath, original_filename: refDocSuggestion.originalFilename, suggested_label: refDocSuggestion.suggestedLabel }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setRefDocError(d.error ?? "Failed"); return; }
      setRefDocAdded(true);
    } catch { setRefDocError("Network error — try again"); }
    finally  { setRefDocBusy(false); }
  }

  const dcFg = PILL.docchase.fg;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <DetailHeader row={row} onBack={onBack} learningApproved={learningApproved} learningThreshold={learningThreshold} />

      {/* ── Two-column body ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "45fr 55fr", minHeight: 0, overflow: "hidden" }}>

        {/* Left panel — context + client reply */}
        <div style={{ overflow: "auto", borderRight: "1px solid var(--border-subtle)", padding: "28px 28px 40px" }}>
          <div style={{ marginBottom: 24 }}>
            <span style={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-tertiary)",
            }}>
              Document requested
            </span>
            <h1 style={{
              margin: "6px 0 10px", fontSize: 21, fontWeight: 600,
              color: "var(--text-primary)", letterSpacing: "-0.022em", lineHeight: 1.3,
            }}>
              {formatDocType(item.document_type)}
            </h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Requested from{" "}
                <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{item.client_name}</strong>
              </span>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                Chase started {timeAgo(item.created_at)} ago
              </span>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)", marginBottom: 24 }} />

          {/* Client reply bubble */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11.5 }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{item.client_name}</span>
              {item.client_email && (
                <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {item.client_email}
                </span>
              )}
              {item.last_client_reply_at && (
                <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                  · {timeAgo(item.last_client_reply_at)} ago
                </span>
              )}
            </div>
            <div style={{
              fontSize: 14, lineHeight: 1.65, color: "var(--text-primary)",
              background: "var(--surface)", border: "1px solid var(--border-subtle)",
              borderRadius: 12, borderTopLeftRadius: 4,
              padding: "12px 16px", whiteSpace: "pre-wrap",
            }}>
              {item.last_client_reply || (
                <span style={{ fontStyle: "italic", color: "var(--text-tertiary)" }}>
                  No message — document attached.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — doc preview + validation */}
        <div style={{ overflow: "auto", padding: "24px 28px 40px" }}>
          {!hasAttachment ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", gap: 10, color: "var(--text-tertiary)",
            }}>
              <FileText size={30} style={{ opacity: 0.25 }} />
              <span style={{ fontSize: 13 }}>No document received yet</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Validation result */}
              <div style={{
                padding: "14px 16px", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 10,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {validating ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Loader2 size={13} className="animate-spin" style={{ color: dcFg }} />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      Hollis is checking the document…
                    </span>
                  </div>
                ) : currentValidationStatus ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                        ...(currentValidationStatus === "pass"
                          ? { background: "rgba(22,163,74,0.10)",  color: "#4ade80", border: "1px solid rgba(22,163,74,0.20)"  }
                          : currentValidationStatus === "fail"
                          ? { background: "rgba(220,38,38,0.10)",  color: "#f87171", border: "1px solid rgba(220,38,38,0.20)"  }
                          : { background: "rgba(245,158,11,0.10)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.20)" }),
                      }}>
                        {currentValidationStatus === "pass"
                          ? <CheckCircle2 size={10} strokeWidth={2.4} />
                          : <XCircle size={10} strokeWidth={2.4} />}
                        {currentValidationStatus.charAt(0).toUpperCase() + currentValidationStatus.slice(1)}
                      </span>
                      {item.received_attachment_filename && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
                          {item.received_attachment_filename}
                        </span>
                      )}
                    </div>
                    {(validationResult?.summary ?? item.validation_summary) && (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {validationResult?.summary ?? item.validation_summary}
                      </p>
                    )}
                    {((validationResult?.issues ?? item.validation_issues) ?? []).length > 0 && (
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                        {(validationResult?.issues ?? item.validation_issues ?? []).map((issue, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#f87171" }}>
                            <span style={{ flexShrink: 0, marginTop: 1 }}>·</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : validateError ? (
                  <span style={{ fontSize: 12, color: "#f87171" }}>{validateError}</span>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                    Document received — checking now.
                  </span>
                )}
              </div>

              {/* Ref doc suggestion */}
              {refDocSuggestion && (
                <div style={{
                  padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)",
                  background: "var(--surface)", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 12,
                }}>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                    Add <strong style={{ color: "var(--text-primary)" }}>{refDocSuggestion.suggestedLabel}</strong> to this client&apos;s AI reference docs?
                  </p>
                  {refDocAdded ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#4ade80" }}>
                      <CheckCircle2 size={12} /> Added
                    </span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {refDocError && <span style={{ fontSize: 11, color: "#f87171" }}>{refDocError}</span>}
                      <button
                        onClick={handleAddToRefDocs}
                        disabled={refDocBusy}
                        style={{ height: 28, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", fontSize: 11, fontWeight: 600, color: refDocBusy ? "var(--text-secondary)" : "var(--text-primary)", cursor: refDocBusy ? "default" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {refDocBusy && <Loader2 size={10} className="animate-spin" />} Add
                      </button>
                      <button
                        onClick={() => setRefDocSuggestion(null)}
                        style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Inline document preview */}
              {urlLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
                  <Loader2 size={13} className="animate-spin" /> Loading document…
                </div>
              ) : signedUrl && isPreviewable ? (
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface)", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {item.received_attachment_filename ?? "Attachment"}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <a
                        href={signedUrl}
                        download={item.received_attachment_filename ?? "attachment"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 8px", height: 24, borderRadius: 5, border: "1px solid var(--border)", background: "transparent", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}
                      >
                        <Download size={10} /> Download
                      </a>
                      <button
                        onClick={() => setFullscreen(true)}
                        style={{ height: 24, padding: "0 8px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                      >
                        <Maximize2 size={10} /> Expand
                      </button>
                    </div>
                  </div>
                  {isPdf ? (
                    <iframe
                      src={`${signedUrl}#toolbar=0&navpanes=0`}
                      title={item.received_attachment_filename ?? "Document"}
                      style={{ width: "100%", height: 540, border: "none", background: "#fff", display: "block" }}
                    />
                  ) : (
                    <div style={{ background: "#fff", display: "flex", justifyContent: "center" }}>
                      <img
                        src={signedUrl}
                        alt={item.received_attachment_filename ?? "Attachment"}
                        style={{ maxWidth: "100%", maxHeight: 480, objectFit: "contain", display: "block", cursor: "zoom-in" }}
                        onClick={() => setFullscreen(true)}
                      />
                    </div>
                  )}
                </div>
              ) : signedUrl ? (
                // Non-previewable file type
                <div style={{ padding: "16px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 12 }}>
                  <FileText size={18} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.received_attachment_filename ?? "Document"}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      {item.received_attachment_content_type ?? "Unknown type"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <a
                      href={signedUrl}
                      download={item.received_attachment_filename ?? "attachment"}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500 }}
                    >
                      <Download size={12} /> Download
                    </a>
                    <a
                      href={signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", fontWeight: 500 }}
                    >
                      <ExternalLink size={12} /> Open
                    </a>
                  </div>
                </div>
              ) : null}

            </div>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ──────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 28px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleMarkReceived}
            disabled={marking}
            style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: marking ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: marking ? 0.6 : 1, transition: "opacity 120ms" }}
          >
            {marking ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Mark received
          </button>
          <button
            onClick={handleReject}
            style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,41,41,0.4)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          >
            <XCircle size={12} /> Reject
          </button>
          {markError && <span style={{ fontSize: 12, color: "#f87171", marginLeft: 8 }}>{markError}</span>}
        </div>
      </div>

      {/* ── Fullscreen modal ───────────────────────────────────────────────── */}
      {fullscreen && signedUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.92)" }}>
          <div className="shrink-0 flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <FileText size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                {item.received_attachment_filename ?? "Document"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={signedUrl}
                download={item.received_attachment_filename ?? "attachment"}
                className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                <Download size={14} /> Download
              </a>
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[12px] transition-opacity hover:opacity-70"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                <ExternalLink size={14} /> Open in tab
              </a>
              <button
                onClick={() => setFullscreen(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer" }}
              >
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {isPdf ? (
              <iframe
                src={signedUrl}
                className="w-full h-full rounded-lg"
                style={{ border: "none" }}
                title={item.received_attachment_filename ?? "Document"}
              />
            ) : isImage ? (
              <div className="w-full h-full flex items-center justify-center">
                <img
                  src={signedUrl}
                  alt={item.received_attachment_filename ?? "Document"}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
