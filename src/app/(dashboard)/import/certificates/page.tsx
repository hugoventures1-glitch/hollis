"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Upload, CheckCircle, AlertCircle,
  X, Download, ShieldCheck,
} from "lucide-react";
import {
  parseCSVText, autoMap, normaliseEmail, normaliseDate,
  generateTemplateCsv, triggerCsvDownload, errorsToCSV,
} from "@/lib/import/csv-utils";
import type { RowError } from "@/lib/import/csv-utils";

// ── Field definitions ──────────────────────────────────────────

type Field =
  | "insured_name"
  | "holder_name"
  | "holder_email"
  | "holder_address"
  | "expiration_date"
  | "effective_date"
  | "certificate_number"
  | "coverage_type"
  | "policy_number"
  | "line_of_business"
  | "additional_insured"
  | "requested_by"
  | "requested_date"
  | "insured_email";

const REQUIRED: Field[] = ["insured_name", "holder_name", "expiration_date"];
const OPTIONAL: Field[] = [
  "holder_email",
  "holder_address",
  "effective_date",
  "certificate_number",
  "coverage_type",
  "policy_number",
  "line_of_business",
  "additional_insured",
  "requested_by",
  "requested_date",
  "insured_email",
];
const ALL_FIELDS: Field[] = [...REQUIRED, ...OPTIONAL];

const FIELD_LABELS: Record<Field, string> = {
  insured_name:        "Insured Name",
  holder_name:         "Certificate Holder",
  holder_email:        "Holder Email",
  holder_address:      "Certificate Holder Address",
  expiration_date:     "Expiration Date",
  effective_date:      "Effective Date",
  certificate_number:  "Certificate Number",
  coverage_type:       "Coverage Type",
  policy_number:       "Policy Number",
  line_of_business:    "Line of Business",
  additional_insured:  "Additional Insured",
  requested_by:        "Requested By",
  requested_date:      "Requested Date",
  insured_email:       "Insured Email",
};

const SYNONYMS: Record<Field, string[]> = {
  insured_name:       ["insured", "insured name", "client", "named insured", "policyholder", "policy holder"],
  holder_name:        ["holder", "certificate holder", "holder name", "issued to", "recipient", "cert holder"],
  holder_email:       ["holder email", "email", "certificate holder email", "send to", "contact email", "recipient email"],
  holder_address:     ["certificate holder address", "holder address", "holder address line", "cert holder address"],
  expiration_date:    ["expiration", "expiry", "exp date", "end date", "expires", "expiration date", "expiry date", "policy expiration"],
  effective_date:     ["effective date", "effective", "inception date", "start date", "policy effective"],
  certificate_number: ["cert number", "certificate number", "cert no", "coi number", "cert num", "certificate no", "certificate num"],
  coverage_type:      ["coverage", "line", "type", "policy type", "coverage type", "lines of coverage"],
  policy_number:      ["policy number", "policy no", "policy num", "pol number", "pol no", "policy #"],
  line_of_business:   ["line of business", "lob", "business line", "product line"],
  additional_insured: ["additional insured", "addl insured", "ai", "additional insureds"],
  requested_by:       ["requested by", "requester", "requestor", "submitted by"],
  requested_date:    ["requested date", "request date", "submission date", "date requested"],
  insured_email:      ["insured email", "insured email address", "named insured email", "client email"],
};

const TEMPLATE_HEADERS = ["Insured Name", "Holder Name", "Holder Email", "Expiration Date", "Certificate Number", "Coverage Type"];
const TEMPLATE_ROWS = [
  ["Acme Corp", "City of Austin", "certs@austin.gov", "2025-12-31", "HOL-2025-00001", "General Liability"],
  ["Beta LLC", "Westfield Mall", "insurance@westfield.com", "2026-03-15", "HOL-2025-00002", "GL, Auto"],
];

type Step = "upload" | "map" | "preview" | "done";

interface MappedRow {
  insured_name: string;
  holder_name: string;
  holder_email: string;
  holder_address: string;
  expiration_date: string;
  effective_date: string;
  certificate_number: string;
  coverage_type: string;
  policy_number: string;
  line_of_business: string;
  additional_insured: string;
  requested_by: string;
  requested_date: string;
  insured_email: string;
}

interface ImportResult {
  inserted: number;
  duplicates: number;
  errors: RowError[];
}

function StepIndicator({ current }: { current: Step }) {
  const STEPS = ["upload", "map", "preview", "done"] as const;
  const ci = STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-3">
      {STEPS.slice(0, 3).map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <div className="w-8 h-px bg-[#1C1C1C]" />}
          <div className={`flex items-center gap-1.5 text-[12px] ${ci === i ? "text-[#FAFAFA]" : ci > i ? "text-[#FAFAFA]" : "text-[#6b6b6b]"}`}>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${
              ci === i ? "bg-[#FAFAFA] border-[#FAFAFA] text-[#0C0C0C]" : ci > i ? "bg-[#FAFAFA]/20 border-[#555555] text-[#FAFAFA]" : "bg-transparent border-[#333333] text-[#6b6b6b]"
            }`}>{i + 1}</div>
            {["Upload", "Map", "Preview"][i]}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CertificateImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field | "">>({});
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = useCallback((file: File) => {
    setFileError(null);
    if (file.size > 10 * 1024 * 1024) { setFileError("File exceeds 10 MB limit."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSVText(text);
      if (headers.length === 0) { setFileError("No columns found."); return; }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMap<Field>(headers, SYNONYMS));
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  }, [handleFile]);

  const missingRequired = REQUIRED.filter((f) => !Object.values(mapping).includes(f));

  function buildMappedRows(): MappedRow[] {
    return csvRows
      .map((row) => {
        const obj: Partial<MappedRow> = {};
        for (const header of csvHeaders) {
          const field = mapping[header];
          if (field) {
            const val = (row[header] ?? "").trim();
            (obj as Record<string, string>)[field] =
              field === "holder_email" || field === "insured_email" ? normaliseEmail(val)
              : field === "expiration_date" || field === "effective_date" || field === "requested_date"
                ? (normaliseDate(val) ?? val)
              : val;
          }
        }
        return {
          insured_name: "", holder_name: "", holder_email: "", holder_address: "",
          expiration_date: "", effective_date: "", certificate_number: "", coverage_type: "",
          policy_number: "", line_of_business: "", additional_insured: "", requested_by: "",
          requested_date: "", insured_email: "", ...obj,
        };
      })
      .filter((r) => r.insured_name.trim() !== "" || r.holder_name.trim() !== "");
  }

  function handleConfirmMapping() {
    setMappedRows(buildMappedRows());
    setStep("preview");
  }

  async function handleImport() {
    setLoading(true); setServerError(null);
    try {
      const res = await fetch("/api/certificates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificates: mappedRows }),
      });
      const data = await res.json();
      if (!res.ok) { setServerError(data.error ?? "Import failed"); return; }
      if (typeof window !== "undefined") {
        const existing = JSON.parse(localStorage.getItem("hollis_import_counts") ?? "{}");
        existing.certificates = (existing.certificates ?? 0) + (data.inserted ?? 0);
        localStorage.setItem("hollis_import_counts", JSON.stringify(existing));
      }
      setResult(data);
      setStep("done");
    } catch { setServerError("Network error — please try again"); }
    finally { setLoading(false); }
  }

  function reset() {
    setStep("upload"); setCsvHeaders([]); setCsvRows([]); setMapping({});
    setMappedRows([]); setResult(null); setServerError(null); setFileError(null);
  }

  const withEmail = mappedRows.filter((r) => r.holder_email).length;
  const badDates = mappedRows.filter((r) => r.expiration_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.expiration_date)).length;

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Link href="/import" className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">
          <ArrowLeft size={13} /> Import
        </Link>
        <ChevronRight size={12} className="text-[#6b6b6b]" />
        <span className="text-[13px] text-[#FAFAFA]">Certificate Import</span>
        <div className="ml-auto"><StepIndicator current={step} /></div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-10">

        {step === "upload" && (
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-[22px] font-bold text-[#FAFAFA]">Import certificates</h1>
              <button onClick={() => triggerCsvDownload("hollis-certificates-template.csv", generateTemplateCsv(TEMPLATE_HEADERS, TEMPLATE_ROWS))}
                className="flex items-center gap-1.5 text-[12px] text-[#6b6b6b] hover:text-[#8a8a8a] transition-colors">
                <Download size={12} /> Download template
              </button>
            </div>
            <p className="text-[14px] text-[#8a8a8a] mb-8">Upload a CSV of issued certificates or COIs. Deduplicates on certificate number.</p>

            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center h-52 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragging ? "border-[#FAFAFA] bg-[#FAFAFA]/[0.04]" : "border-[#1C1C1C] bg-[#111111] hover:border-[#3e3e4a] hover:bg-[#14141e]"}`}>
              <Upload size={28} className={dragging ? "text-[#FAFAFA]" : "text-[#6b6b6b]"} />
              <div className="text-[15px] font-medium text-[#FAFAFA] mt-3">Drop a CSV file here</div>
              <div className="text-[13px] text-[#8a8a8a] mt-1">or click to browse — max 10 MB</div>
              <input ref={fileRef} type="file" accept=".csv" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {fileError && <div className="mt-4 flex items-center gap-2 text-[13px] text-red-400"><AlertCircle size={14} /> {fileError}</div>}

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

        {step === "map" && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#FAFAFA] mb-1">Map your columns</h1>
            <p className="text-[14px] text-[#8a8a8a] mb-8">
              <strong className="text-[#FAFAFA]">{csvHeaders.length} columns</strong> · <strong className="text-[#FAFAFA]">{csvRows.length} rows</strong>
            </p>

            <div className="rounded-lg border border-[#1C1C1C] bg-[#111111] overflow-hidden mb-6">
              <div className="grid grid-cols-2 px-5 py-2.5 border-b border-[#1C1C1C] bg-[#0C0C0C]">
                <div className="text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">CSV Column</div>
                <div className="text-[11px] font-medium text-[#8a8a8a] uppercase tracking-wider">Maps To</div>
              </div>
              {csvHeaders.map((header) => (
                <div key={header} className="grid grid-cols-2 px-5 py-3 border-b border-[#1C1C1C]/60 last:border-b-0 items-center">
                  <div className="text-[13px] text-[#FAFAFA] font-mono">{header}</div>
                  <select value={mapping[header] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value as Field | "" }))}
                    className="bg-[#1a1a24] border border-[#1C1C1C] rounded-md px-3 py-1.5 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] max-w-[220px]">
                    <option value="">— Skip —</option>
                    {ALL_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-[13px] text-red-300">Missing required: <strong>{missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}</strong></div>
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

        {step === "preview" && (
          <div className="max-w-5xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#FAFAFA] mb-1">Preview import</h1>
            <p className="text-[14px] text-[#8a8a8a] mb-6">
              Ready to import <strong className="text-[#FAFAFA]">{mappedRows.length} certificates</strong>.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: "Total rows", value: mappedRows.length, color: "text-[#FAFAFA]" },
                { label: "With holder email", value: withEmail, color: "text-[#FAFAFA]" },
                { label: "Date issues", value: badDates, color: badDates > 0 ? "text-[#9e9e9e]" : "text-[#6b6b6b]" },
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
                        <td className="px-4 py-2.5 text-[13px] text-[#FAFAFA] whitespace-nowrap">{row.insured_name || <span className="text-red-400">Missing</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#FAFAFA] whitespace-nowrap">{row.holder_name || <span className="text-red-400">Missing</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#FAFAFA] whitespace-nowrap">{row.holder_email || <span className="text-[#6b6b6b]">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] whitespace-nowrap">
                          <span className={/^\d{4}-\d{2}-\d{2}$/.test(row.expiration_date) ? "text-[#FAFAFA]" : "text-[#9e9e9e]"}>
                            {row.expiration_date || <span className="text-red-400">Missing</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-[#6b6b6b] font-mono whitespace-nowrap">{row.certificate_number || "—"}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#6b6b6b] whitespace-nowrap">{row.coverage_type || "—"}</td>
                      </tr>
                    ))}
                    {mappedRows.length > 5 && (
                      <tr><td colSpan={6} className="px-4 py-2.5 text-[12px] text-[#6b6b6b] text-center">+ {mappedRows.length - 5} more rows not shown</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep("map")} className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">Back</button>
              <button onClick={handleImport} disabled={loading}
                className="h-9 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-60">
                {loading ? "Importing…" : `Import ${mappedRows.length} Certificates`}
              </button>
            </div>
          </div>
        )}

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
                  <div className="text-[12px] font-semibold text-red-400 uppercase tracking-wider">{result.errors.length} rows with errors</div>
                  <button onClick={() => triggerCsvDownload("hollis-cert-import-errors.csv", errorsToCSV(result.errors))}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300">
                    <Download size={11} /> Download
                  </button>
                </div>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 8).map((err, i) => <li key={i} className="text-[12px] text-red-300">Row {err.row}: {err.reason}</li>)}
                  {result.errors.length > 8 && <li className="text-[12px] text-red-400">+ {result.errors.length - 8} more</li>}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button onClick={reset} className="h-9 px-5 rounded-md border border-[#1C1C1C] text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors">Import Another</button>
              <Link href="/certificates" className="h-9 px-5 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[13px] font-semibold hover:bg-[#E8E8E8] transition-colors flex items-center gap-1.5">
                <ShieldCheck size={13} /> View Certificates
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
