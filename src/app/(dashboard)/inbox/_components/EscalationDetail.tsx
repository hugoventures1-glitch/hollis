"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, Loader2, Send, FileText, Download, ExternalLink, Maximize2, X, Play, Square, AlertTriangle,
} from "lucide-react";
import type { InboxItem } from "../page";
import { type DisplayRow } from "./inbox-types";
import { DetailShell, SectionDivider, AttachmentCard } from "./InboxShared";

interface OutboundMessage {
  kind: "touchpoint" | "auto_reply";
  subject: string | null;
  body: string;
  sent_at: string;
  type?: string;
}

interface ThreadData {
  previousOutbound: OutboundMessage | null;
}

export function EscalationDetail({
  row,
  item,
  onBack,
  busy,
  resolved,
  resolutionType,
  errorMsg,
  onResolve,
}: {
  row: DisplayRow;
  item: InboxItem;
  onBack: () => void;
  busy: boolean;
  resolved: boolean;
  resolutionType: "handled" | "resume" | "terminate" | null;
  errorMsg: string | null;
  onResolve: (resolution: "handled" | "resume" | "terminate") => void;
}) {
  const payload = item.proposed_action?.payload as Record<string, unknown> | undefined;
  const flagReason = (payload?.flag_reason ?? payload?.escalation_reason ?? item.proposed_action?.description ?? "Escalation requires manual intervention.") as string;
  const fullSignal = item.raw_signal ?? item.raw_signal_snippet;
  const expiryDate = (payload?.expiry_date as string | undefined) ?? item.policies?.expiration_date;
  const lastTouchpoint = (payload?.last_touchpoint_at as string | null | undefined) ?? null;

  const escalationSenderEmail = item.sender_email;
  const [showEmailReply, setShowEmailReply] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [thread, setThread] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    setThread(null);
    setThreadLoading(true);
    fetch(`/api/agent/escalation/${item.id}/thread`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load thread");
        const d = await r.json();
        if (!ignore) setThread(d);
      })
      .catch(() => { if (!ignore) setThread(null); })
      .finally(() => { if (!ignore) setThreadLoading(false); });
    return () => { ignore = true; };
  }, [item.id]);

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

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "never";
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const actionBar = resolved ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: resolutionType === "terminate" ? "rgba(220,38,38,0.12)" : "rgba(22,163,74,0.12)", color: resolutionType === "terminate" ? "var(--danger)" : "#4ade80", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <CheckCircle2 size={11} />
      </span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
        {resolutionType === "handled" && "Marked as handled."}
        {resolutionType === "resume" && "Escalation resolved — sequence resumed."}
        {resolutionType === "terminate" && "Escalation resolved — sequence terminated."}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
        {resolutionType === "resume" ? "Hollis will continue the renewal sequence." : resolutionType === "terminate" ? "Renewal sequence stopped for this policy." : "No further action required."}
      </span>
    </div>
  ) : (
    <>
      <button onClick={() => onResolve("handled")} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "var(--accent)", color: "var(--text-inverse)", border: "1px solid var(--accent)", opacity: busy ? 0.5 : 1 }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Mark as handled
      </button>
      <button onClick={() => onResolve("resume")} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
      >
        <Play size={12} /> Resume sequence
      </button>
      <span style={{ flex: 1 }} />
      <button onClick={() => onResolve("terminate")} disabled={busy} style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--danger)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(204,41,41,0.4)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
      >
        <Square size={12} /> Terminate sequence
      </button>
    </>
  );

  return (
    <DetailShell row={row} onBack={onBack} actionBar={actionBar}>
      {/* Urgent escalation banner */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: 10, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.22)" }}>
        <span style={{ color: "var(--danger)", fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>
            Tier 3 escalation — manual intervention required.
          </span>
          <span style={{ fontSize: 13, color: "rgba(220,38,38,0.75)", marginLeft: 6 }}>
            Hollis will not act on this automatically.
          </span>
        </div>
      </div>

      {/* Escalation context card */}
      <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", fontSize: 12.5, color: "var(--text-tertiary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--danger)", fontWeight: 600 }}>
            <AlertTriangle size={11} /> Escalation context
          </span>
          <span style={{ flex: 1 }} />
          <span>From Hollis Renewal Intelligence</span>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, columnGap: 16, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Client</span>
            <span style={{ color: "var(--text-primary)" }}>{item.policies?.client_name ?? "—"}</span>

            <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Policy</span>
            <span style={{ color: "var(--text-primary)" }}>{item.policies?.policy_name ?? "—"}</span>

            {escalationSenderEmail && (
              <>
                <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Sender</span>
                <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>{escalationSenderEmail}</span>
              </>
            )}

            <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Expires</span>
            <span style={{ color: "var(--text-primary)" }}>{formatDate(expiryDate)}</span>

            <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Last touchpoint</span>
            <span style={{ color: "var(--text-primary)" }}>{formatDate(lastTouchpoint)}</span>
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Reason</span>
            <span style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)", letterSpacing: "-0.003em" }}>{flagReason}</span>
          </div>

          {/* Thread history */}
          {(threadLoading || thread?.previousOutbound || fullSignal) && (
            <>
              <div style={{ height: 1, background: "var(--border-subtle)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Thread</span>

                {threadLoading && !thread?.previousOutbound && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <div className="animate-pulse" style={{ width: 22, height: 22, borderRadius: 999, background: "var(--border)", flexShrink: 0 }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div className="animate-pulse" style={{ width: 48, height: 10, borderRadius: 4, background: "var(--border)" }} />
                        <div className="animate-pulse" style={{ width: 72, height: 9, borderRadius: 4, background: "var(--border-subtle)" }} />
                      </div>
                    </div>
                    <div className="animate-pulse" style={{
                      marginLeft: 30,
                      padding: "12px 16px",
                      background: "var(--surface)",
                      borderRadius: 12, borderTopLeftRadius: 4,
                      border: "1px solid var(--border-subtle)",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}>
                      <div style={{ height: 10, borderRadius: 4, background: "var(--border)", width: "80%" }} />
                      <div style={{ height: 10, borderRadius: 4, background: "var(--border)", width: "65%" }} />
                      <div style={{ height: 10, borderRadius: 4, background: "var(--border)", width: "72%" }} />
                    </div>
                  </div>
                )}

                {/* Previous outbound message from Hollis */}
                {thread?.previousOutbound && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                        background: "var(--accent)", color: "var(--text-inverse)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700,
                      }}>H</span>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Hollis</span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {new Date(thread.previousOutbound.sent_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                          {thread.previousOutbound.type && (
                            <span style={{ textTransform: "capitalize" }}> · {thread.previousOutbound.type.replace(/_/g, " ")}</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      marginLeft: 30,
                      fontSize: 13.5, lineHeight: 1.65, color: "var(--text-primary)",
                      padding: "12px 16px",
                      background: "var(--surface)",
                      borderRadius: 12, borderTopLeftRadius: 4,
                      border: "1px solid var(--border-subtle)",
                      whiteSpace: "pre-wrap",
                      maxHeight: 400,
                      overflow: "auto",
                    }}>
                      {thread.previousOutbound.subject && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--border-subtle)" }}>
                          {thread.previousOutbound.subject}
                        </div>
                      )}
                      {thread.previousOutbound.body}
                    </div>
                  </div>
                )}

                {/* Client reply */}
                {fullSignal && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexDirection: "row-reverse" }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                        background: "var(--border)", color: "var(--text-secondary)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 700,
                      }}>{(item.policies?.client_name?.[0] ?? "C").toUpperCase()}</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{item.policies?.client_name ?? "Client"}</span>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {item.sender_email ?? "Email reply"}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      marginRight: 30,
                      fontSize: 13.5, lineHeight: 1.65, color: "var(--text-primary)",
                      padding: "12px 16px",
                      background: "var(--surface-raised)",
                      borderRadius: 12, borderTopRightRadius: 4,
                      border: "1px solid var(--border-subtle)",
                      whiteSpace: "pre-wrap",
                      maxHeight: 400, overflow: "auto",
                    }}>
                      {fullSignal}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Document attachment */}
      {hasAttachment && (
        <>
          <SectionDivider label="Document" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AttachmentCard
              filename={attachmentFilename}
              mimeType={attachmentMime}
              signedUrl={attachSignedUrl}
              loading={attachLoading}
              error={attachError}
              onOpenFullscreen={() => setAttachFullscreen(true)}
              size="md"
            />
            {attachSignedUrl && (isPdf || isImage) && (
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
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
          </div>
        </>
      )}

      {/* Fullscreen overlay */}
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

      {/* Custom email reply */}
      {escalationSenderEmail && !resolved && (
        <div>
          {!showEmailReply ? (
            <button
              onClick={() => setShowEmailReply(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              <Send size={12} /> Draft custom email reply
            </button>
          ) : replySent ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <CheckCircle2 size={13} style={{ color: "#4ade80" }} /> Reply sent to {escalationSenderEmail}
            </div>
          ) : (
            <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", fontSize: 12, color: "var(--text-tertiary)" }}>
                <Send size={11} />
                <span>To: <span style={{ color: "var(--text-secondary)" }}>{escalationSenderEmail}</span></span>
                <span style={{ flex: 1 }} />
                <button onClick={() => setShowEmailReply(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 11 }}>✕ Cancel</button>
              </div>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Write your reply here…"
                rows={6}
                style={{ width: "100%", background: "transparent", border: "none", padding: "14px 16px", fontSize: 14, color: "var(--text-primary)", fontFamily: "inherit", lineHeight: 1.65, resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                {replyError && (
                  <span style={{ fontSize: 12.5, color: "var(--danger)", alignSelf: "stretch", padding: "6px 10px", background: "rgba(204,41,41,0.06)", borderRadius: 6, border: "1px solid rgba(204,41,41,0.2)" }}>
                    {replyError}
                  </span>
                )}
                <button
                  onClick={async () => {
                    if (!replyDraft.trim() || !escalationSenderEmail) return;
                    setReplySending(true);
                    setReplyError(null);
                    try {
                      const res = await fetch(`/api/agent/escalation/${item.id}/custom-reply`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: escalationSenderEmail, body: replyDraft }),
                      });
                      if (!res.ok) {
                        const d = await res.json().catch(() => ({}));
                        setReplyError(d.error ?? `Send failed (${res.status})`);
                      } else {
                        setReplySent(true);
                      }
                    } catch {
                      setReplyError("Network error — could not send reply.");
                    } finally { setReplySending(false); }
                  }}
                  disabled={!replyDraft.trim() || replySending}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, background: "var(--accent)", color: "var(--text-inverse)", border: "none", fontSize: 13, fontWeight: 500, cursor: !replyDraft.trim() || replySending ? "not-allowed" : "pointer", opacity: !replyDraft.trim() || replySending ? 0.5 : 1 }}
                >
                  {replySending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Send reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(204,41,41,0.06)", border: "1px solid rgba(204,41,41,0.2)", fontSize: 13, color: "var(--danger)" }}>
          {errorMsg}
        </div>
      )}
    </DetailShell>
  );
}
