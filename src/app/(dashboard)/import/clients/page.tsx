"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Upload, CheckCircle, AlertCircle,
  X, Download, Users,
} from "lucide-react";
import {
  parseCSVText, autoMap, normaliseEmail, normalisePhone,
  generateTemplateCsv, triggerCsvDownload, errorsToCSV,
} from "@/lib/import/csv-utils";
import type { RowError } from "@/lib/import/csv-utils";
import { useHollisStore } from "@/stores/hollisStore";

// ── Field definitions ──────────────────────────────────────────

type Field = "name" | "email" | "phone" | "address" | "industry" | "notes";

const REQUIRED: Field[] = ["name"];
const OPTIONAL: Field[] = ["email", "phone", "address", "industry", "notes"];
const ALL_FIELDS: Field[] = [...REQUIRED, ...OPTIONAL];

const FIELD_LABELS: Record<Field, string> = {
  name:     "Client Name",
  email:    "Email",
  phone:    "Phone",
  address:  "Address",
  industry: "Industry",
  notes:    "Notes",
};

const SYNONYMS: Record<Field, string[]> = {
  name:     ["name", "client name", "full name", "insured", "account", "customer", "business name", "company name", "account name"],
  email:    ["email", "email address", "client email", "e-mail", "e mail", "contact email"],
  phone:    ["phone", "phone number", "mobile", "cell", "telephone", "contact", "contact number"],
  address:  ["address", "street", "location", "business address", "mailing address"],
  industry: ["industry", "type", "business type", "sector", "line of business", "lob"],
  notes:    ["notes", "comments", "memo", "comment"],
};

const TEMPLATE_HEADERS = ["Name", "Email", "Phone", "Address", "Industry", "Notes"];
const TEMPLATE_ROWS = [
  ["Acme Corp", "acme@example.com", "555-123-4567", "123 Main St, Austin TX", "Construction", "Key account"],
  ["Beta LLC", "beta@example.com", "555-987-6543", "456 Oak Ave, Dallas TX", "Retail", ""],
];

type Step = "upload" | "map" | "preview" | "done";

interface MappedRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  notes: string;
}

interface ImportResult {
  inserted: number;
  duplicates: number;
  errors: RowError[];
}

// ── Step indicator (shared pattern) ───────────────────────────

const STEPS = ["upload", "map", "preview", "done"] as const;
const STEP_LABELS = ["Upload", "Map", "Preview", "Done"];

function StepIndicator({ current }: { current: Step }) {
  const ci = STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-3">
      {STEPS.slice(0, 3).map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <div className="w-8 h-px bg-[#1C1C1C]" />}
          <div className={`flex items-center gap-1.5 text-[12px] ${
            ci === i ? "text-[#FAFAFA]" : ci > i ? "text-[#FAFAFA]" : "text-[#6b6b6b]"
          }`}>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${
              ci === i
                ? "bg-[#FAFAFA] border-[#FAFAFA] text-[#0C0C0C]"
                : ci > i
                ? "bg-[#FAFAFA]/20 border-[#555555] text-[#FAFAFA]"
                : "bg-transparent border-[#333333] text-[#6b6b6b]"
            }`}>
              {i + 1}
            </div>
            {STEP_LABELS[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function ClientImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
    });
  }, []);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // CSV state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field | "">>({});

  // Preview / result
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = useCallback((file: File) => {
    setFileError(null);
    if (file.size > 10 * 1024 * 1024) {
      setFileError("File exceeds 10 MB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSVText(text);
      if (headers.length === 0) { setFileError("No columns found in file."); return; }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMap<Field>(headers, SYNONYMS));
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  }, [handleFile]);

  const missingRequired = REQUIRED.filter(
    (f) => !Object.values(mapping).includes(f)
  );

  function buildMappedRows(): MappedRow[] {
    return csvRows
      .map((row) => {
        const obj: Partial<MappedRow> = {};
        for (const header of csvHeaders) {
          const field = mapping[header];
          if (field) {
            const val = (row[header] ?? "").trim();
            (obj as Record<string, string>)[field] =
              field === "email" ? normaliseEmail(val)
              : field === "phone" ? normalisePhone(val)
              : val;
          }
        }
        return { name: "", email: "", phone: "", address: "", industry: "", notes: "", ...obj };
      })
      .filter((r) => r.name.trim() !== ""); // skip blank names
  }

  function handleConfirmMapping() {
    const rows = buildMappedRows();
    setMappedRows(rows);
    setStep("preview");
  }

  async function handleImport() {
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch("/api/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clients: mappedRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Import failed");
        return;
      }
      // Store counts in localStorage for the overview banner (user-scoped)
      if (typeof window !== "undefined") {
        const uid = userIdRef.current;
        const countsKey = uid ? `hollis_import_counts_${uid}` : "hollis_import_counts";
        const existing = JSON.parse(localStorage.getItem(countsKey) ?? "{}");
        existing.clients = (existing.clients ?? 0) + (data.inserted ?? 0);
        localStorage.setItem(countsKey, JSON.stringify(existing));
        fetch("/api/briefing", { method: "DELETE" }).catch(() => {});
      }
      setResult(data);
      setStep("done");
      useHollisStore.setState({ lastFetched: null });
      useHollisStore.getState().fetchAll();
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setMappedRows([]);
    setResult(null);
    setServerError(null);
    setFileError(null);
  }

  const withEmail = mappedRows.filter((r) => r.email).length;
  const withoutEmail = mappedRows.length - withEmail;

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Link href="/import" className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">
          <ArrowLeft size={13} /> Import
        </Link>
        <ChevronRight size={12} className="text-[#6b6b6b]" />
        <span className="text-[13px] text-[#FAFAFA]">Client Import</span>
        <div className="ml-auto">
          <StepIndicator current={step} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-10">

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-[22px] font-bold text-[#FAFAFA]">Import clients</h1>
              <button
                onClick={() => triggerCsvDownload("hollis-clients-template.csv", generateTemplateCsv(TEMPLATE_HEADERS, TEMPLATE_ROWS))}
                className="flex items-center gap-1.5 text-[12px] text-[#6b6b6b] hover:text-[#8a8a8a] transition-colors"
              >
                <Download size={12} /> Download template
              </button>
            </div>
            <p className="text-[14px] text-[#8a8a8a] mb-8">
              Upload a CSV with your client list. We&apos;ll detect columns automatically.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center h-52 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragging ? "border-[#FAFAFA] bg-[#FAFAFA]/[0.04]" : "border-[#1C1C1C] bg-[#111111] hover:border-[#3e3e4a] hover:bg-[#14141e]"
              }`}
            >
              <Upload size={28} className={dragging ? "text-[#FAFAFA]" : "text-[#6b6b6b]"} />
              <div className="text-[15px] font-medium text-[#FAFAFA] mt-3">Drop a CSV file here</div>
              <div className="text-[13px] text-[#8a8a8a] mt-1">or click to browse — max 10 MB</div>
              <input ref={fileRef} type="file" accept=".csv" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {fileError && (
              <div className="mt-4 flex items-center gap-2 text-[13px] text-red-400">
                <AlertCircle size={14} /> {fileError}
              </div>
            )}

            <div className="mt-8 rounded-lg bg-[#111111] border border-[#1C1C1C] p-5">
              <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mb-3">Required</div>
              {REQUIRED.map((f) => (
                <div key={f} className="flex items-center gap-2 text-[13px] text-[#FAFAFA] mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FAFAFA]" /> {FIELD_LABELS[f]}
                </div>
              ))}
              <div className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-widest mt-4 mb-3">Optional</div>
              <div className="grid grid-cols-2 gap-1">
                {OPTIONAL.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[13px] text-[#6b6b6b]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#333333]" /> {FIELD_LABELS[f]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Map ── */}
        {step === "map" && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#FAFAFA] mb-1">Map your columns</h1>
            <p className="text-[14px] text-[#8a8a8a] mb-8">
              We detected <strong className="text-[#FAFAFA]">{csvHeaders.length} columns</strong> and{" "}
              <strong className="text-[#FAFAFA]">{csvRows.length} rows</strong>. Confirm the mapping below.
            </p>

            <div className="rounded-lg border border-[#1C1C1C] bg-[#111111] overflow-hidden mb-6">
              <div className="grid grid-cols-2 px-5 py-2.5 border-b border-[#1C1C1C] bg-[#0C0C0C]">
                <div className="text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">CSV Column</div>
                <div className="text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">Maps To</div>
              </div>
              {csvHeaders.map((header) => (
                <div key={header} className="grid grid-cols-2 px-5 py-3 border-b border-[#1C1C1C]/60 last:border-b-0 items-center">
                  <div className="text-[13px] text-[#FAFAFA] font-mono">{header}</div>
                  <select
                    value={mapping[header] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value as Field | "" }))}
                    className="bg-[#1a1a24] border border-[#1C1C1C] rounded-md px-3 py-1.5 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] max-w-[200px]"
                  >
                    <option value="">— Skip —</option>
                    {ALL_FIELDS.map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-[13px] text-red-300">
                  Missing required: <strong>{missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}</strong>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={() => setStep("upload")} className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">Back</button>
              <button onClick={handleConfirmMapping} disabled={missingRequired.length > 0}
                className="h-9 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Preview Import
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === "preview" && (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#FAFAFA] mb-1">Preview import</h1>
            <p className="text-[14px] text-[#8a8a8a] mb-6">
              Ready to import <strong className="text-[#FAFAFA]">{mappedRows.length} clients</strong>.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: "Total rows", value: mappedRows.length, color: "text-[#FAFAFA]" },
                { label: "With email", value: withEmail, color: "text-[#FAFAFA]" },
                { label: "Without email", value: withoutEmail, color: "text-[#888888]" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg bg-[#111111] border border-[#1C1C1C] px-4 py-3">
                  <div className={`text-[22px] font-bold tabular-nums ${color}`}>{value}</div>
                  <div className="text-[11px] text-[#6b6b6b] mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {serverError && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-[13px] text-red-300 flex-1">{serverError}</div>
                <button onClick={() => setServerError(null)}><X size={13} className="text-red-400" /></button>
              </div>
            )}

            <div className="rounded-lg border border-[#1C1C1C] bg-[#111111] overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1C1C1C] bg-[#0C0C0C]">
                      {ALL_FIELDS.map((f) => (
                        <th key={f} className="px-4 py-2.5 text-left text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider whitespace-nowrap">
                          {FIELD_LABELS[f]}{REQUIRED.includes(f) ? " *" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-[#1C1C1C]/60 last:border-b-0">
                        <td className="px-4 py-2.5 text-[13px] text-[#FAFAFA] whitespace-nowrap">
                          {row.name || <span className="text-red-400">Missing</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-[#FAFAFA] whitespace-nowrap">{row.email || <span className="text-[#6b6b6b]">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#FAFAFA] whitespace-nowrap font-mono">{row.phone || <span className="text-[#6b6b6b]">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#6b6b6b] whitespace-nowrap max-w-[150px] truncate">{row.address || "—"}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#6b6b6b] whitespace-nowrap">{row.industry || "—"}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#6b6b6b] whitespace-nowrap max-w-[120px] truncate">{row.notes || "—"}</td>
                      </tr>
                    ))}
                    {mappedRows.length > 5 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-2.5 text-[12px] text-[#6b6b6b] text-center">
                          + {mappedRows.length - 5} more rows not shown
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep("map")} className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">Back</button>
              <button onClick={handleImport} disabled={loading}
                className="h-9 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-60">
                {loading ? "Importing…" : `Import ${mappedRows.length} Clients`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === "done" && result && (
          <div className="max-w-lg mx-auto text-center py-8">
            <div className="w-16 h-16 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-[#FAFAFA]" />
            </div>
            <h1 className="text-[22px] font-bold text-[#FAFAFA] mb-6">Import complete</h1>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { label: "Inserted", value: result.inserted, color: "text-[#FAFAFA]" },
                { label: "Duplicates skipped", value: result.duplicates, color: "text-[#8a8a8a]" },
                { label: "Errors", value: result.errors.length, color: result.errors.length > 0 ? "text-red-400" : "text-[#6b6b6b]" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg bg-[#111111] border border-[#1C1C1C] px-4 py-3">
                  <div className={`text-[22px] font-bold tabular-nums ${color}`}>{value}</div>
                  <div className="text-[11px] text-[#6b6b6b] mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <div className="text-left rounded-lg bg-red-950/30 border border-red-800/40 p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] font-semibold text-red-400 uppercase tracking-wider">
                    {result.errors.length} rows with errors
                  </div>
                  <button
                    onClick={() => triggerCsvDownload("hollis-client-import-errors.csv", errorsToCSV(result.errors))}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                  >
                    <Download size={11} /> Download
                  </button>
                </div>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 8).map((err, i) => (
                    <li key={i} className="text-[12px] text-red-300">Row {err.row}: {err.reason}</li>
                  ))}
                  {result.errors.length > 8 && (
                    <li className="text-[12px] text-red-400">+ {result.errors.length - 8} more (download for full list)</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button onClick={reset} className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">
                Import Another
              </button>
              <Link href="/clients" className="h-9 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors flex items-center gap-1.5">
                <Users size={13} /> View Clients
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
