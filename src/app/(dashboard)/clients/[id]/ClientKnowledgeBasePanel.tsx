"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { BookOpen, Upload, FileText, X, Check, Loader2, Plus } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface RefDoc {
  id: string;
  label: string;
  original_filename: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  added_by: "broker" | "ai";
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

// ── Add file modal ─────────────────────────────────────────────────────────────

function AddFileModal({
  clientId,
  onClose,
  onAdded,
}: {
  clientId: string;
  onClose: () => void;
  onAdded: (doc: RefDoc) => void;
}) {
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleFileChange(f: File | null) {
    setFile(f);
    if (f && !label) {
      const base = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setLabel(base.charAt(0).toUpperCase() + base.slice(1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !label.trim()) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("label", label.trim());
    try {
      const res = await fetch(`/api/clients/${clientId}/reference-docs`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed"); return; }
      onAdded(data.doc);
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full rounded-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: 440, background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--surface-raised)" }}
        >
          <span className="text-[13px] font-semibold text-text-primary">Store Reference File</span>
          <button
            onClick={onClose}
            className="transition-colors hover:text-text-primary"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              File <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-9 px-3 rounded-md border text-[13px] text-left flex items-center gap-2 transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: file ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <Upload size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <span className="truncate">{file ? file.name : "Choose PDF or image…"}</span>
            </button>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Current Declarations Page"
              className="w-full h-9 px-3 rounded-md border text-[13px] text-text-primary placeholder-text-tertiary outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            />
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-md border text-[13px] transition-colors"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !label.trim()}
              className="h-9 px-5 rounded-md text-[13px] font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: "var(--text-primary)", color: "var(--background)" }}
            >
              {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function ClientKnowledgeBasePanel({
  clientId,
  initialValue,
}: {
  clientId: string;
  initialValue: string;
}) {
  // Notes state
  const [text, setText] = useState(initialValue);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [importing, setImporting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Files state
  const [docs, setDocs] = useState<RefDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // ── Notes ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (value: string) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge-base`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge_base: value }),
      });
      if (!res.ok) throw new Error();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }, [clientId]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    setSaveStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(value), 1000);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/clients/${clientId}/extract-text`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Import failed"); return; }
      const separator = text.trim() ? "\n\n---\n\n" : "";
      const appended = text + separator + data.text;
      setText(appended);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(appended), 1000);
    } catch {
      alert("Network error — please try again");
    } finally {
      setImporting(false);
    }
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/clients/${clientId}/reference-docs`)
      .then((r) => r.ok ? r.json() : { docs: [] })
      .then((d) => setDocs(d.docs ?? []))
      .finally(() => setDocsLoading(false));
  }, [clientId]);

  async function handleRemoveDoc(docId: string) {
    setRemoving(docId);
    try {
      await fetch(`/api/clients/${clientId}/reference-docs?docId=${docId}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } finally {
      setRemoving(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="rounded-xl p-5 flex flex-col gap-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={12} style={{ color: "var(--text-secondary)" }} />
            <span
              className="text-[12px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Knowledge Base
            </span>
          </div>

          <div className="flex items-center gap-3">
            {saveStatus === "saving" && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                <Loader2 size={10} className="animate-spin" /> Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-[11px] flex items-center gap-1" style={{ color: "#00D97E" }}>
                <Check size={10} /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-[11px]" style={{ color: "var(--danger)" }}>Save failed</span>
            )}

            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors hover:text-text-primary disabled:opacity-50"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              {importing ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
              Import text
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </div>

        {/* Notes textarea */}
        <textarea
          value={text}
          onChange={handleTextChange}
          placeholder="Type notes, paste info, or import a document to extract its text. Hollis reads this when you ask questions about this client."
          className="w-full resize-none outline-none text-[13px] leading-relaxed placeholder-text-tertiary"
          style={{ background: "transparent", color: "var(--text-primary)", minHeight: 120, border: "none" }}
          rows={5}
        />

        <div
          className="flex items-center justify-between border-t pt-1"
          style={{ borderColor: "var(--surface-raised)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Hollis reads this when you ask questions about this client
          </p>
          <span className="text-[11px] tabular-nums" style={{ color: "#3A3A3A" }}>
            {text.length.toLocaleString()} chars
          </span>
        </div>

        {/* Divider + files section */}
        <div className="border-t" style={{ borderColor: "var(--surface-raised)" }} />

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Stored files
          </span>
          <button
            onClick={() => setFileModalOpen(true)}
            className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors hover:text-text-primary"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            <Plus size={10} /> Add file
          </button>
        </div>

        {docsLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-[12px] text-center py-1" style={{ color: "var(--text-tertiary)" }}>
            No stored files yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y" style={{ borderColor: "#191919" }}>
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-2">
                <FileText size={12} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>{doc.label}</div>
                  <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    {doc.original_filename}
                    {doc.file_size_bytes ? ` · ${fmtSize(doc.file_size_bytes)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.added_by === "ai" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#1A1A2E", color: "#7B93DB", border: "1px solid #2A2A4A" }}>
                      AI
                    </span>
                  )}
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{timeAgo(doc.created_at)}</span>
                  <button
                    onClick={() => handleRemoveDoc(doc.id)}
                    disabled={removing === doc.id}
                    className="transition-colors hover:text-red-400 disabled:opacity-50"
                    style={{ color: "var(--text-tertiary)" }}
                    title="Remove"
                  >
                    {removing === doc.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {fileModalOpen && (
        <AddFileModal
          clientId={clientId}
          onClose={() => setFileModalOpen(false)}
          onAdded={(doc) => setDocs((prev) => [doc, ...prev])}
        />
      )}
    </>
  );
}
