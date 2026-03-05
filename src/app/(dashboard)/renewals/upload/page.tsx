"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Upload, CheckCircle, AlertCircle, X, ArrowLeft } from "lucide-react";
import type { CSVPolicyRow, ColumnMapping } from "@/types/renewals";

type Step = "upload" | "map" | "preview" | "done";

const REQUIRED_FIELDS: (keyof CSVPolicyRow)[] = [
  "client_name",
  "expiration_date",
];
const OPTIONAL_FIELDS: (keyof CSVPolicyRow)[] = [
  "policy_name",
  "client_email",
  "carrier",
  "client_phone",
  "premium",
];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_LABELS: Record<keyof CSVPolicyRow, string> = {
  policy_name:     "Policy Name",
  client_name:     "Client Name",
  client_email:    "Client Email",
  expiration_date: "Expiration Date",
  carrier:         "Carrier",
  client_phone:    "Client Phone",
  premium:         "Premium ($)",
};

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line =>
    line.split(",").map(cell => cell.trim().replace(/^"|"$/g, ""))
  );
  return { headers, rows };
}

function autoMapColumns(csvHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  // All synonyms use spaces (no underscores); headers are normalized the same way.
  const SYNONYMS: Record<keyof CSVPolicyRow, string[]> = {
    policy_name:     ["policy name", "policy", "plan name", "plan", "policy number", "policy num", "policy no", "pol number", "pol no", "policy #"],
    client_name:     ["client name", "client", "insured", "name", "full name", "customer name", "account name", "named insured"],
    client_email:    ["client email", "email", "email address", "e mail", "e-mail", "insured email", "insured email address", "named insured email"],
    expiration_date: ["expiration date", "expiry", "expiry date", "end date", "exp date", "expires", "expiration", "renewal date"],
    carrier:         ["carrier", "insurance carrier", "insurer", "company", "insurance company", "provider", "underwriter"],
    client_phone:    ["client phone", "phone", "phone number", "mobile", "cell", "telephone", "contact number"],
    premium:         ["premium", "annual premium", "amount", "price", "total premium", "premium amount"],
  };

  for (const csvHeader of csvHeaders) {
    // Normalize: lowercase, collapse underscores/hyphens to spaces, trim
    const normalized = csvHeader.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    for (const [field, synonyms] of Object.entries(SYNONYMS)) {
      // Never map agent-prefixed email columns to client_email — they are different fields.
      if (field === "client_email" && /\bagent\b/.test(normalized)) continue;
      if (synonyms.includes(normalized)) {
        mapping[csvHeader] = field as keyof CSVPolicyRow;
        break;
      }
    }
    if (!(csvHeader in mapping)) mapping[csvHeader] = "";
  }
  return mapping;
}

function mappingToRows(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping
): CSVPolicyRow[] {
  return rows.map(row => {
    const obj: Partial<CSVPolicyRow> = {};
    headers.forEach((header, i) => {
      const field = mapping[header];
      if (field) {
        const val = row[i] ?? "";
        if (field === "premium") {
          const num = parseFloat(val.replace(/[^0-9.]/g, ""));
          (obj as Record<string, unknown>)[field] = isNaN(num) ? undefined : num;
        } else {
          (obj as Record<string, unknown>)[field] = val;
        }
      }
    });
    return obj as CSVPolicyRow;
  });
}

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [previewRows, setPreviewRows] = useState<CSVPolicyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: string[]; message: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
      if (headers.length === 0) return;
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(autoMapColumns(headers));
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

  const missingRequired = REQUIRED_FIELDS.filter(
    f => !Object.values(mapping).includes(f)
  );

  const handleConfirmMapping = () => {
    const rows = mappingToRows(csvRows, csvHeaders, mapping);
    setPreviewRows(rows);
    setStep("preview");
  };

  const handleImport = async () => {
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch("/api/renewals/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policies: previewRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Upload failed");
        setLoading(false);
        return;
      }
      setResult(data);
      setStep("done");
    } catch {
      setServerError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link
          href="/renewals"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
        >
          <ArrowLeft size={13} />
          Renewals
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7]">Import CSV</span>

        {/* Step indicator */}
        <div className="ml-auto flex items-center gap-3">
          {(["upload", "map", "preview"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-[#1e1e2a]" />}
              <div className={`flex items-center gap-1.5 text-[12px] ${
                step === s || (step === "done" && s === "preview")
                  ? "text-[#f5f5f7]"
                  : ["map", "preview", "done"].indexOf(step) > ["map", "preview", "done"].indexOf(s)
                  ? "text-[#00d4aa]"
                  : "text-[#505057]"
              }`}>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                  step === s
                    ? "bg-[#00d4aa] border-[#00d4aa] text-[#0d0d12]"
                    : ["map", "preview", "done"].indexOf(step) > ["upload", "map", "preview"].indexOf(s)
                    ? "bg-[#00d4aa]/20 border-[#00d4aa]/40 text-[#00d4aa]"
                    : "bg-transparent border-[#505057] text-[#505057]"
                }`}>
                  {i + 1}
                </div>
                <span className="capitalize">{s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-10 py-10">

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="max-w-lg mx-auto">
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">Import your book of business</h1>
            <p className="text-[14px] text-[#8a8b91] mb-8">
              Upload a CSV file with your policies. We&apos;ll map the columns and create renewal campaigns automatically.
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center h-52 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragging
                  ? "border-[#00d4aa] bg-[#00d4aa]/[0.04]"
                  : "border-[#2e2e3a] bg-[#111118] hover:border-[#3e3e4a] hover:bg-[#14141e]"
              }`}
            >
              <Upload size={28} className={dragging ? "text-[#00d4aa]" : "text-[#505057]"} />
              <div className="text-[15px] font-medium text-[#f5f5f7] mt-3">Drop a CSV file here</div>
              <div className="text-[13px] text-[#8a8b91] mt-1">or click to browse</div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>

            <div className="mt-8 rounded-lg bg-[#111118] border border-[#1e1e2a] p-5">
              <div className="text-[12px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-3">
                Required columns
              </div>
              <div className="grid grid-cols-2 gap-2">
                {REQUIRED_FIELDS.map(f => (
                  <div key={f} className="flex items-center gap-2 text-[13px] text-[#c5c5cb]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00d4aa]" />
                    {FIELD_LABELS[f]}
                  </div>
                ))}
              </div>
              <div className="text-[12px] font-semibold text-[#8a8b91] uppercase tracking-widest mt-4 mb-3">
                Optional columns
              </div>
              <div className="grid grid-cols-2 gap-2">
                {OPTIONAL_FIELDS.map(f => (
                  <div key={f} className="flex items-center gap-2 text-[13px] text-[#505057]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#505057]" />
                    {FIELD_LABELS[f]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Map columns ── */}
        {step === "map" && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">Map your columns</h1>
            <p className="text-[14px] text-[#8a8b91] mb-8">
              We detected <strong className="text-[#f5f5f7]">{csvHeaders.length} columns</strong> and{" "}
              <strong className="text-[#f5f5f7]">{csvRows.length} rows</strong>. Confirm the mapping below.
            </p>

            <div className="rounded-lg border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
              <div className="grid grid-cols-2 px-5 py-2.5 border-b border-[#1e1e2a] bg-[#0d0d12]">
                <div className="text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">CSV Column</div>
                <div className="text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Maps To</div>
              </div>
              {csvHeaders.map(header => (
                <div key={header} className="grid grid-cols-2 px-5 py-3 border-b border-[#1e1e2a]/60 last:border-b-0 items-center">
                  <div className="text-[13px] text-[#c5c5cb] font-mono">{header}</div>
                  <select
                    value={mapping[header] ?? ""}
                    onChange={e => setMapping(m => ({ ...m, [header]: e.target.value as keyof CSVPolicyRow | "" }))}
                    className="bg-[#1a1a24] border border-[#2e2e3a] rounded-md px-3 py-1.5 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 max-w-[200px]"
                  >
                    <option value="">— Skip —</option>
                    {ALL_FIELDS.map(f => (
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
                  Missing required:{" "}
                  <strong>{missingRequired.map(f => FIELD_LABELS[f]).join(", ")}</strong>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("upload")}
                className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirmMapping}
                disabled={missingRequired.length > 0}
                className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Preview Import
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === "preview" && (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">Preview import</h1>
            <p className="text-[14px] text-[#8a8b91] mb-8">
              Review the first few rows before importing{" "}
              <strong className="text-[#f5f5f7]">{previewRows.length} policies</strong>.
            </p>

            {serverError && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-[13px] text-red-300">{serverError}</div>
                <button onClick={() => setServerError(null)} className="ml-auto">
                  <X size={13} className="text-red-400" />
                </button>
              </div>
            )}

            <div className="rounded-lg border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e1e2a] bg-[#0d0d12]">
                      {REQUIRED_FIELDS.concat(OPTIONAL_FIELDS).map(f => (
                        <th key={f} className="px-4 py-2.5 text-left text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider whitespace-nowrap">
                          {FIELD_LABELS[f]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-b border-[#1e1e2a]/60 last:border-b-0">
                        <td className="px-4 py-2.5 text-[13px] text-[#f5f5f7] whitespace-nowrap">{row.policy_name || <span className="text-[#505057]">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#c5c5cb] whitespace-nowrap">{row.client_name || <span className="text-red-400">Missing</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#c5c5cb] whitespace-nowrap">{row.client_email || <span className="text-[#505057]">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#c5c5cb] whitespace-nowrap">{row.expiration_date || <span className="text-red-400">Missing</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#c5c5cb] whitespace-nowrap">{row.carrier || <span className="text-[#505057]">—</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#505057] whitespace-nowrap">{row.client_phone || "—"}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#505057] whitespace-nowrap">
                          {row.premium ? `$${Number(row.premium).toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                    {previewRows.length > 8 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-2.5 text-[12px] text-[#505057] text-center">
                          + {previewRows.length - 8} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("map")}
                className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-60"
              >
                {loading ? "Importing…" : `Import ${previewRows.length} Policies`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === "done" && result && (
          <div className="max-w-lg mx-auto text-center py-8">
            <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-[#00d4aa]" />
            </div>
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-2">Import complete</h1>
            <p className="text-[14px] text-[#8a8b91] mb-8">{result.message}</p>

            {result.errors.length > 0 && (
              <div className="text-left rounded-lg bg-red-950/30 border border-red-800/40 p-4 mb-8">
                <div className="text-[12px] font-semibold text-red-400 uppercase tracking-wider mb-2">
                  {result.errors.length} errors
                </div>
                <ul className="space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-[12px] text-red-300">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setStep("upload");
                  setCsvHeaders([]);
                  setCsvRows([]);
                  setMapping({});
                  setPreviewRows([]);
                  setResult(null);
                }}
                className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
              >
                Import Another
              </button>
              <button
                onClick={() => router.push("/renewals")}
                className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors"
              >
                View Renewals
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
