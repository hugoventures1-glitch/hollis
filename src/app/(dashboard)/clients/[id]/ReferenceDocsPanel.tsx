"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Upload, X, FileText, Loader2 } from "lucide-react";

interface RefDoc {
  id: string;
  label: string;
  original_filename: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  added_by: "broker" | "ai";
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

// ── Upload modal ───────────────────────────────────────────────────────────────

function UploadModal({
  clientId,
  onClose,
  onUploaded,
}: {
  clientId: string;
  onClose: () => void;
  onUploaded: (doc: RefDoc) => void;
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

  // Auto-populate label from filename
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
      onUploaded(data.doc);
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
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--surface-raised)" }}>
          <span className="text-[13px] font-semibold text-text-primary">Add Reference Doc</span>
          <button onClick={onClose} className="transition-colors hover:text-text-primary" style={{ color: "var(--text-tertiary)" }}>
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {/* File picker */}
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
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: file ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <Upload size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <span className="truncate">{file ? file.name : "Choose PDF or image…"}</span>
            </button>
          </div>

          {/* Label */}
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Current Declarations Page"
              className="w-full h-9 px-3 rounded-md border text-[13px] text-text-primary placeholder-text-tertiary outline-none transition-colors"
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

// ── Main export ────────────────────────────────────────────────────────────────

export function ReferenceDocsPanel({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<RefDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/reference-docs`);
      if (!res.ok) return;
      const data = await res.json();
      setDocs(data.docs ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function handleRemove(docId: string) {
    setRemoving(docId);
    try {
      await fetch(`/api/clients/${clientId}/reference-docs?docId=${docId}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } finally {
      setRemoving(null);
    }
  }

  function handleUploaded(doc: RefDoc) {
    setDocs((prev) => [doc, ...prev]);
  }

  return (
    <>
      <div
        className="rounded-xl p-5 flex flex-col gap-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={12} style={{ color: "var(--text-secondary)" }} />
            <span className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              AI Reference Docs
            </span>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="text-[11px] px-2.5 py-1 rounded-md transition-colors hover:text-text-primary"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            + Add
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
            <FileText size={16} style={{ color: "var(--border)" }} />
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
              No reference docs yet.
              <br />
              <span style={{ color: "#3A3A3A" }}>Add key docs to improve Hollis replies.</span>
            </p>
          </div>
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
                    onClick={() => handleRemove(doc.id)}
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

      {modalOpen && (
        <UploadModal
          clientId={clientId}
          onClose={() => setModalOpen(false)}
          onUploaded={handleUploaded}
        />
      )}
    </>
  );
}
