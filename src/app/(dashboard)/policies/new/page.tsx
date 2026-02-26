"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Upload,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  FileText,
  ArrowLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Client } from "@/types/policies";

// ── Types ──────────────────────────────────────────────────────

type WizardStep = "setup" | "processing" | "done";

type FileStatus = "pending" | "uploading" | "extracting" | "done" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: WizardStep[] = ["setup", "processing", "done"];
  const labels = ["Setup", "Processing", "Report"];
  const currentIdx = steps.indexOf(current);

  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <div className="w-8 h-px bg-[#1e1e2a]" />}
          <div
            className={`flex items-center gap-1.5 text-[12px] ${
              currentIdx === i
                ? "text-[#f5f5f7]"
                : currentIdx > i
                ? "text-[#00d4aa]"
                : "text-[#505057]"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                currentIdx === i
                  ? "bg-[#00d4aa] border-[#00d4aa] text-[#0d0d12]"
                  : currentIdx > i
                  ? "bg-[#00d4aa]/20 border-[#00d4aa]/40 text-[#00d4aa]"
                  : "bg-transparent border-[#505057] text-[#505057]"
              }`}
            >
              {i + 1}
            </div>
            <span>{labels[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileStatusRow({ entry }: { entry: FileEntry }) {
  const icon =
    entry.status === "done" ? (
      <CheckCircle size={14} className="text-[#00d4aa] shrink-0" />
    ) : entry.status === "error" ? (
      <AlertCircle size={14} className="text-red-400 shrink-0" />
    ) : (
      <Loader2 size={14} className="text-[#00d4aa] animate-spin shrink-0" />
    );

  const label =
    entry.status === "uploading"
      ? "Uploading…"
      : entry.status === "extracting"
      ? "Reading with AI…"
      : entry.status === "done"
      ? "Extracted"
      : entry.status === "error"
      ? (entry.error ?? "Failed")
      : "Waiting…";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#1e1e2a]/60 last:border-b-0">
      <FileText size={13} className="text-[#505057] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[#f5f5f7] truncate">{entry.file.name}</div>
        <div
          className={`text-[11px] mt-0.5 ${
            entry.status === "error" ? "text-red-400" : "text-[#505057]"
          }`}
        >
          {entry.status === "error" ? label : `${formatFileSize(entry.file.size)} · ${label}`}
        </div>
      </div>
      {icon}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function NewPolicyCheckPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>("setup");
  const [dragging, setDragging] = useState(false);

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);

  // Processing
  const [checkId, setCheckId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [completedCheckId, setCompletedCheckId] = useState<string | null>(null);

  // ── Init ────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      const res = await fetch("/api/clients");
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      }
    }
    init();
  }, []);

  // ── File handling ────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    setFileEntries((prev) => {
      const existingNames = new Set(prev.map((e) => e.file.name));
      const novel = pdfs.filter((f) => !existingNames.has(f.name));
      return [
        ...prev,
        ...novel.map((f) => ({ file: f, status: "pending" as FileStatus })),
      ];
    });
  }, []);

  const removeFile = useCallback((name: string) => {
    setFileEntries((prev) => prev.filter((e) => e.file.name !== name));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  // ── Run check ───────────────────────────────────────────────

  async function handleRunCheck() {
    if (fileEntries.length === 0 || !userId) return;
    setStep("processing");

    // 1. Create the check shell
    const createRes = await fetch("/api/policy-checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: selectedClientId || undefined,
      }),
    });
    if (!createRes.ok) {
      setAnalysisStatus("error");
      setAnalysisError("Failed to create check — please try again.");
      return;
    }
    const { id } = await createRes.json();
    setCheckId(id);

    const supabase = createClient();

    // 2. Upload + extract each file sequentially
    for (const entry of fileEntries) {
      const name = entry.file.name;

      // Upload to Storage
      setFileEntries((prev) =>
        prev.map((e) =>
          e.file.name === name ? { ...e, status: "uploading" } : e
        )
      );

      const storagePath = `${userId}/${id}/${crypto.randomUUID()}-${name}`;
      const { error: uploadError } = await supabase.storage
        .from("policy-documents")
        .upload(storagePath, entry.file, { contentType: "application/pdf" });

      if (uploadError) {
        setFileEntries((prev) =>
          prev.map((e) =>
            e.file.name === name
              ? { ...e, status: "error", error: uploadError.message }
              : e
          )
        );
        continue;
      }

      // Extract
      setFileEntries((prev) =>
        prev.map((e) =>
          e.file.name === name ? { ...e, status: "extracting" } : e
        )
      );

      const extRes = await fetch(`/api/policy-checks/${id}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: storagePath,
          original_filename: name,
          file_size_bytes: entry.file.size,
        }),
      });

      const extData = await extRes.json().catch(() => ({}));
      const extOk =
        extRes.ok &&
        (extData as { extraction_status?: string }).extraction_status === "complete";

      setFileEntries((prev) =>
        prev.map((e) =>
          e.file.name === name
            ? {
                ...e,
                status: extOk ? "done" : "error",
                error: extOk
                  ? undefined
                  : ((extData as { error?: string }).error ?? "Extraction failed"),
              }
            : e
        )
      );
    }

    // 3. Analyze
    setAnalysisStatus("running");
    await runAnalysis(id);
  }

  async function runAnalysis(id: string) {
    setAnalysisError(null);
    setAnalysisStatus("running");

    const analyzeRes = await fetch(`/api/policy-checks/${id}/analyze`, {
      method: "POST",
    });

    if (analyzeRes.ok) {
      setAnalysisStatus("done");
      setCompletedCheckId(id);
      setStep("done");
    } else {
      const d = await analyzeRes.json().catch(() => ({}));
      setAnalysisStatus("error");
      setAnalysisError(
        (d as { error?: string }).error ?? "Analysis failed — please retry."
      );
    }
  }

  const successCount = fileEntries.filter((e) => e.status === "done").length;
  const errorCount = fileEntries.filter((e) => e.status === "error").length;
  const allSettled = fileEntries.every(
    (e) => e.status === "done" || e.status === "error"
  );

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">

      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link
          href="/policies"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
        >
          <ArrowLeft size={13} />
          Policy Audit
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7]">New Check</span>
        <div className="ml-auto">
          <StepIndicator current={step} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-10">

          {/* ── Phase 1: Setup ──────────────────────────────────── */}
          {step === "setup" && (
            <>
              <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">
                Run a policy check
              </h1>
              <p className="text-[14px] text-[#8a8b91] mb-8">
                Upload one or more policy PDFs. Claude will extract all coverage
                data and flag gaps against your client&apos;s profile.
              </p>

              {/* Client selector */}
              <div className="mb-6">
                <label className="block text-[12px] font-medium text-[#8a8b91] uppercase tracking-wider mb-2">
                  Client (optional)
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full bg-[#111118] border border-[#2e2e3a] rounded-lg px-3 py-2.5 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 transition-colors"
                >
                  <option value="">Ad-hoc check (no client profile)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.industry ? ` · ${c.industry}` : ""}
                    </option>
                  ))}
                </select>
                {selectedClientId === "" && (
                  <p className="text-[11px] text-[#505057] mt-1.5">
                    Without a client profile, Claude will flag obvious issues
                    only (expired dates, missing named insured, limit
                    inconsistencies).
                  </p>
                )}
              </div>

              {/* Drop zone */}
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-[#8a8b91] uppercase tracking-wider mb-2">
                  Policy PDFs
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center h-44 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    dragging
                      ? "border-[#00d4aa] bg-[#00d4aa]/[0.04]"
                      : "border-[#2e2e3a] bg-[#111118] hover:border-[#3e3e4a] hover:bg-[#14141e]"
                  }`}
                >
                  <Upload
                    size={26}
                    className={dragging ? "text-[#00d4aa]" : "text-[#505057]"}
                  />
                  <div className="text-[14px] font-medium text-[#f5f5f7] mt-3">
                    Drop policy PDFs here
                  </div>
                  <div className="text-[12px] text-[#8a8b91] mt-1">
                    or click to browse · PDF only · max 20 MB each
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {/* Selected files */}
              {fileEntries.length > 0 && (
                <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
                  {fileEntries.map((entry) => (
                    <div
                      key={entry.file.name}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1e1e2a]/60 last:border-b-0"
                    >
                      <FileText size={13} className="text-[#505057] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#f5f5f7] truncate">
                          {entry.file.name}
                        </div>
                        <div className="text-[11px] text-[#505057] mt-0.5">
                          {formatFileSize(entry.file.size)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(entry.file.name);
                        }}
                        className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                      >
                        <X size={12} className="text-[#505057]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Run button */}
              <button
                onClick={handleRunCheck}
                disabled={fileEntries.length === 0}
                className="w-full h-10 rounded-lg bg-[#00d4aa] text-[#0d0d12] text-[14px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Run Check
                {fileEntries.length > 0 &&
                  ` · ${fileEntries.length} ${fileEntries.length === 1 ? "doc" : "docs"}`}
              </button>
            </>
          )}

          {/* ── Phase 2: Processing ─────────────────────────────── */}
          {step === "processing" && (
            <>
              <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">
                Checking coverage…
              </h1>
              <p className="text-[14px] text-[#8a8b91] mb-8">
                Claude is reading your policies. This usually takes 15–60
                seconds per document.
              </p>

              {/* File progress */}
              <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
                {fileEntries.map((entry) => (
                  <FileStatusRow key={entry.file.name} entry={entry} />
                ))}
              </div>

              {/* Analysis status */}
              {allSettled && (
                <div className="rounded-xl border border-[#1e1e2a] bg-[#111118] px-4 py-4">
                  {analysisStatus === "running" && (
                    <div className="flex items-center gap-3">
                      <Loader2
                        size={16}
                        className="text-[#00d4aa] animate-spin shrink-0"
                      />
                      <div>
                        <div className="text-[13px] font-medium text-[#f5f5f7]">
                          Analyzing coverage…
                        </div>
                        <div className="text-[11px] text-[#505057] mt-0.5">
                          Comparing against client profile and industry
                          standards
                        </div>
                      </div>
                    </div>
                  )}

                  {analysisStatus === "error" && (
                    <div>
                      <div className="flex items-start gap-3 mb-3">
                        <AlertCircle
                          size={15}
                          className="text-red-400 shrink-0 mt-0.5"
                        />
                        <div>
                          <div className="text-[13px] font-medium text-red-300">
                            Analysis failed
                          </div>
                          <div className="text-[11px] text-red-400/70 mt-0.5">
                            {analysisError}
                          </div>
                        </div>
                      </div>
                      {successCount > 0 && checkId && (
                        <button
                          onClick={() => runAnalysis(checkId)}
                          className="h-8 px-4 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[12px] font-semibold hover:bg-[#00c49b] transition-colors"
                        >
                          Retry Analysis
                        </button>
                      )}
                      {successCount === 0 && (
                        <p className="text-[12px] text-[#505057]">
                          No documents were extracted successfully. Please go
                          back and try again with different files.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Partial failure notice */}
              {allSettled && errorCount > 0 && successCount > 0 && (
                <div className="flex items-start gap-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 px-4 py-3 mt-4">
                  <AlertCircle
                    size={14}
                    className="text-amber-400 shrink-0 mt-0.5"
                  />
                  <div className="text-[12px] text-amber-300">
                    {errorCount} document{errorCount !== 1 ? "s" : ""} could not
                    be read. The analysis will run on the{" "}
                    {successCount} successful{" "}
                    {successCount === 1 ? "document" : "documents"} — flags may
                    be incomplete.
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Phase 3: Done ───────────────────────────────────── */}
          {step === "done" && completedCheckId && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={28} className="text-[#00d4aa]" />
              </div>
              <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-2">
                Analysis complete
              </h1>
              <p className="text-[14px] text-[#8a8b91] mb-8">
                Your coverage gap report is ready. Review the flags and annotate
                each one for your E&amp;O records.
              </p>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setStep("setup");
                    setFileEntries([]);
                    setSelectedClientId("");
                    setCheckId(null);
                    setAnalysisStatus("idle");
                    setAnalysisError(null);
                    setCompletedCheckId(null);
                  }}
                  className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
                >
                  Run Another Check
                </button>
                <button
                  onClick={() => router.push(`/policies/${completedCheckId}`)}
                  className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
                >
                  View Report
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
