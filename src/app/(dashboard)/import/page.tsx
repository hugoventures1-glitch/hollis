"use client";

/**
 * /import — AI-Powered Full Book Import
 *
 * Replaces the old multi-card hub with a single, premium import flow:
 *   Step 1 — Drop Zone:     drag-and-drop .xlsx/.xls/.csv
 *   Step 2 — Analysing:     client-side xlsx parse + Claude AI mapping
 *   Step 3 — Confirm:       review AI mapping, resolve ambiguities, approve
 *   Step 4 — Importing:     write to Supabase via /api/import/full
 *   Step 5 — Done:          success summary
 *
 * Architecture note: JavaScript owns all counting (it has the full dataset).
 * AI owns only meaning — column mapping, AMS detection, data quality warnings.
 * Pre-computed facts are passed to the AI as ground truth; it must not re-estimate.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
  Check,
  X,
  Zap,
  FileSpreadsheet,
} from "lucide-react";
import { normaliseDate } from "@/lib/import/csv-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "drop" | "analysing" | "confirm" | "importing" | "done";

interface ParsedFile {
  name: string;
  sheetNames: string[];
  headers: string[];
  sampleRows: Record<string, string>[];
  allRows: Record<string, string>[];
  totalRows: number;
}

interface ColumnMapping {
  client_name?: string | null;
  client_abn?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  policy_number?: string | null;
  policy_type?: string | null;
  insurer?: string | null;
  premium?: string | null;
  renewal_date?: string | null;
  inception_date?: string | null;
  expiry_date?: string | null;
  sum_insured?: string | null;
  coverage_description?: string | null;
}

interface AmbiguousColumn {
  header: string;
  possible_meanings: string[];
  recommendation: string;
}

interface AIAnalysis {
  confidence: "high" | "medium" | "low";
  detected_system: string;
  summary: {
    total_rows: number;
    clients_detected: number;
    policies_detected: number;
    renewals_in_90_days: number;
    overdue_renewals: number;
  };
  column_mapping: ColumnMapping;
  ambiguous_columns: AmbiguousColumn[];
  warnings: string[];
  unmapped_columns: string[];
}

interface ImportResult {
  clients: { inserted: number; duplicates: number };
  policies: { inserted: number; duplicates: number };
  certificates: { inserted: number; duplicates: number };
  errors: Array<{ row: number; reason: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HOLLIS_FIELD_LABELS: Record<string, string> = {
  client_name: "Client Name",
  client_abn: "ABN",
  client_email: "Client Email",
  client_phone: "Client Phone",
  client_address: "Client Address",
  policy_number: "Policy Number",
  policy_type: "Policy Type / Class",
  insurer: "Insurer",
  premium: "Premium",
  renewal_date: "Renewal Date",
  inception_date: "Inception Date",
  expiry_date: "Expiry Date",
  sum_insured: "Sum Insured",
  coverage_description: "Coverage Description",
};

const CONFIDENCE_STYLES = {
  high: { label: "High confidence", className: "text-[#FAFAFA] bg-[#FAFAFA]/[0.06] border-[#1C1C1C]" },
  medium: { label: "Medium confidence", className: "text-[#888888] bg-[#1C1C1C] border-[#1C1C1C]" },
  low: { label: "Low confidence", className: "text-red-400 bg-red-900/20 border-red-700/30" },
};

// ── Pre-computation helpers (JS owns all counting) ────────────────────────────

/** Find the most likely client-name column from headers. */
function detectNameColumn(headers: string[]): string | null {
  const patterns = ["client", "insured", "clientname", "client name", "name", "business", "account"];
  return (
    headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p))) ?? null
  );
}

/** Find the most likely renewal/expiry date column from headers. */
function detectRenewalColumn(headers: string[]): string | null {
  const patterns = ["renewal", "r/d", "renew", "expiry", "expiration", "exp date", "due date", "expiry date"];
  return (
    headers.find((h) => patterns.some((p) => h.toLowerCase().includes(p))) ?? null
  );
}

/** Parse a date value from a spreadsheet cell (handles AU format, ISO, Excel serials). */
function parseImportDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Excel serial number (40000–60000 ≈ years 2009–2064)
  if (typeof value === "number" && value > 40000 && value < 60000) {
    return new Date((value - 25569) * 86400 * 1000);
  }
  const str = String(value).trim();
  if (!str) return null;
  // AU/UK: DD/MM/YYYY — check this before JS Date (which assumes US order)
  const auMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (auMatch) {
    const d = new Date(
      `${auMatch[3]}-${auMatch[2].padStart(2, "0")}-${auMatch[1].padStart(2, "0")}`
    );
    if (!isNaN(d.getTime())) return d;
  }
  // ISO: YYYY-MM-DD (safe — unambiguous)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(str.slice(0, 10));
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback to JS Date parser
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

interface PrecomputedStats {
  totalRows: number;
  uniqueClients: number | null;
  renewalsIn90Days: number | null;
  overdueRenewals: number | null;
}

/** Compute ground-truth counts from the full parsed dataset before calling AI. */
function computeStats(
  allRows: Record<string, string>[],
  headers: string[]
): PrecomputedStats {
  // Exclude entirely blank rows (subtotals, spacer rows, etc.)
  const dataRows = allRows.filter((row) =>
    Object.values(row).some((v) => v !== null && v !== "" && v !== undefined)
  );
  const totalRows = dataRows.length;

  // Unique clients — deduplicate by the detected name column
  const nameCol = detectNameColumn(headers);
  const uniqueClients = nameCol
    ? new Set(
        dataRows
          .map((r) => String(r[nameCol] ?? "").trim().toLowerCase())
          .filter(Boolean)
      ).size
    : null;

  // Renewal counts — scan all rows against the detected date column
  const renewalCol = detectRenewalColumn(headers);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  let renewalsIn90Days: number | null = null;
  let overdueRenewals: number | null = null;

  if (renewalCol) {
    renewalsIn90Days = 0;
    overdueRenewals = 0;
    for (const row of dataRows) {
      const d = parseImportDate(row[renewalCol]);
      if (!d) continue;
      if (d >= today && d <= in90) renewalsIn90Days++;
      if (d < today) overdueRenewals++;
    }
  }

  return { totalRows, uniqueClients, renewalsIn90Days, overdueRenewals };
}

// ── File parsing ──────────────────────────────────────────────────────────────

/**
 * Returns true if a raw spreadsheet row looks like a header row.
 * Header rows have ≥3 non-empty cells, most of which are short label strings —
 * not the long banner/sentence strings that AMS exports place in row 0
 * (e.g. "COASTAL BROKING GROUP PTY LTD — WinBEAT Policy Register Export").
 */
function isHeaderRow(row: unknown[]): boolean {
  const nonEmpty = row.filter((v) => v !== null && v !== "" && v !== undefined);
  if (nonEmpty.length < 3) return false;
  const shortLabels = nonEmpty.filter((v) => {
    const s = String(v).trim();
    return (
      s.length > 0 &&
      s.length < 40 &&
      !s.includes("—") &&
      !s.includes("Printed") &&
      !s.includes("Export")
    );
  });
  return shortLabels.length / nonEmpty.length > 0.5;
}

async function parseFile(file: File): Promise<ParsedFile> {
  // Dynamic import — keeps xlsx out of the server bundle
  const XLSX = await import("xlsx");

  let wb: import("xlsx").WorkBook;

  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    wb = XLSX.read(text, { type: "string" });
  } else {
    const ab = await file.arrayBuffer();
    wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: false });
  }

  // Pick the sheet with the most rows — avoids summary/cover sheets that
  // some AMS exports place first (e.g. WinBEAT "Cover" tab before data tab).
  const sheetName = wb.SheetNames.reduce((best, name) => {
    const range = XLSX.utils.decode_range(wb.Sheets[name]["!ref"] || "A1:A1");
    const bestRange = XLSX.utils.decode_range(
      wb.Sheets[best]["!ref"] || "A1:A1"
    );
    return range.e.r > bestRange.e.r ? name : best;
  }, wb.SheetNames[0]);

  const ws = wb.Sheets[sheetName];

  // Read as raw arrays so we can inspect each row before committing to headers.
  // raw:false gives formatted strings (dates, numbers) rather than raw values.
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  // Find the first row that looks like column headers (not a banner row).
  const headerRowIndex = rawRows.findIndex(isHeaderRow);
  if (headerRowIndex === -1) {
    throw new Error(
      "Could not detect a header row. Check the file has column labels and try again."
    );
  }

  const headers = rawRows[headerRowIndex].map((h) => String(h).trim());

  // Everything after the header row, minus blank rows and AMS junk rows
  // (SUBTOTAL banners, *** separators, etc.)
  const dataRows = rawRows.slice(headerRowIndex + 1).filter(
    (row) =>
      row.some((v) => v !== "" && v !== null && v !== undefined) &&
      !String(row[0]).includes("SUBTOTAL") &&
      !String(row[0]).includes("***")
  );

  // Convert each data row array to an object keyed by header name
  const allRows: Record<string, string>[] = dataRows.map((row) =>
    Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? "")]))
  );

  return {
    name: file.name,
    sheetNames: wb.SheetNames,
    headers,
    sampleRows: allRows.slice(0, 5),
    allRows,
    totalRows: allRows.length,
  };
}

// ── Import payload builder ────────────────────────────────────────────────────

interface ClientRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  notes: string;
}

interface PolicyRow {
  client_name: string;
  policy_name: string;
  expiration_date: string;
  carrier: string;
  premium?: number;
  client_email: string;
}

function buildImportPayload(
  allRows: Record<string, string>[],
  mapping: ColumnMapping,
  ambiguityChoices: Record<string, string>
): { clients: ClientRow[]; policies: PolicyRow[] } {
  // Merge user-resolved ambiguities into the mapping
  const fm = { ...mapping } as Record<string, string | null>;
  for (const [header, field] of Object.entries(ambiguityChoices)) {
    if (field) fm[field] = header;
  }

  const clientsSeen = new Set<string>();
  const clients: ClientRow[] = [];
  const policies: PolicyRow[] = [];

  for (const row of allRows) {
    const get = (field: keyof ColumnMapping): string => {
      const col = fm[field];
      return col ? (row[col] ?? "").trim() : "";
    };

    const clientName = get("client_name");
    const clientEmail = get("client_email").toLowerCase();
    const clientPhone = get("client_phone");
    const clientAddress = get("client_address");
    const abn = get("client_abn");

    // Deduplicate clients by name
    if (clientName) {
      const key = clientName.toLowerCase();
      if (!clientsSeen.has(key)) {
        clientsSeen.add(key);
        clients.push({
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
          address: clientAddress,
          industry: "",
          notes: abn ? `ABN: ${abn}` : "",
        });
      }
    }

    // Each row → one policy
    const policyType = get("policy_type");
    const policyNumber = get("policy_number");
    const policyName =
      [policyType, policyNumber].filter(Boolean).join(" — ") || "Imported Policy";

    const insurer = get("insurer");

    // Date: prefer renewal_date, fallback to expiry_date, then inception_date
    const rawDate =
      get("renewal_date") || get("expiry_date") || get("inception_date");
    const expirationDate = rawDate
      ? normaliseDate(rawDate) ?? rawDate
      : "";

    const premiumStr = get("premium").replace(/[^0-9.]/g, "");
    const premium = premiumStr ? parseFloat(premiumStr) || undefined : undefined;

    if (clientName || policyName !== "Imported Policy") {
      policies.push({
        client_name: clientName,
        policy_name: policyName,
        expiration_date: expirationDate,
        carrier: insurer,
        premium,
        client_email: clientEmail,
      });
    }
  }

  return { clients, policies };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] px-6 py-5 flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-[#333333] uppercase tracking-[0.1em]">
        {label}
      </span>
      <span
        className={`text-[36px] font-bold leading-none tracking-tight ${accent ?? "text-[#FAFAFA]"}`}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[12px] text-[#333333] font-medium">{sub}</span>
      )}
    </div>
  );
}

function MappingRow({
  field,
  header,
  sample,
}: {
  field: string;
  header: string;
  sample: string;
}) {
  return (
    <tr className="border-b border-[#1C1C1C]/50 last:border-b-0">
      <td className="px-5 py-3 w-[200px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shrink-0">
            <Check size={9} className="text-[#FAFAFA]" strokeWidth={3} />
          </div>
          <span className="text-[13px] text-[#FAFAFA] font-medium">
            {HOLLIS_FIELD_LABELS[field] ?? field}
          </span>
        </div>
      </td>
      <td className="px-5 py-3">
        <span className="text-[12px] font-mono text-[#555555] bg-[#1a1a24] border border-[#1C1C1C] px-2 py-0.5 rounded">
          {header}
        </span>
      </td>
      <td className="px-5 py-3">
        <span className="text-[13px] text-[#FAFAFA] truncate max-w-[220px] block">
          {sample || <span className="text-[#333333]">—</span>}
        </span>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FullBookImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("drop");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysingPhase, setAnalysingPhase] = useState(0); // 1=parsing, 2=AI, 3=done

  // Data
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Ambiguity choices: header → resolved field name
  const [ambiguityChoices, setAmbiguityChoices] = useState<Record<string, string>>({});
  const [unmappedOpen, setUnmappedOpen] = useState(false);

  // Import result
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Pre-fill ambiguity choices with recommendations
  useEffect(() => {
    if (!aiAnalysis?.ambiguous_columns?.length) return;
    const defaults: Record<string, string> = {};
    for (const col of aiAnalysis.ambiguous_columns) {
      defaults[col.header] = col.recommendation;
    }
    setAmbiguityChoices(defaults);
  }, [aiAnalysis]);

  const processFile = useCallback(async (file: File) => {
    setFileError(null);
    setAnalysisError(null);

    // Validate
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setFileError("Unsupported file type. Upload an Excel (.xlsx, .xls) or CSV file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("File exceeds 10 MB limit.");
      return;
    }

    setStep("analysing");
    setAnalysingPhase(1); // Parsing

    let parsed: ParsedFile;
    try {
      parsed = await parseFile(file);
      setParsedFile(parsed);
    } catch (err) {
      console.error("Parse error:", err);
      setFileError("Could not read this file. Try saving as .xlsx or .csv and uploading again.");
      setStep("drop");
      return;
    }

    if (parsed.headers.length === 0 || parsed.totalRows === 0) {
      setFileError("This file appears empty. Check that it has headers and data rows.");
      setStep("drop");
      return;
    }

    setAnalysingPhase(2); // AI call

    // JS owns all counting — compute ground-truth stats before calling AI
    const stats = computeStats(parsed.allRows, parsed.headers);

    try {
      const res = await fetch("/api/import/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetNames: parsed.sheetNames,
          headers: parsed.headers,
          sampleRows: parsed.sampleRows,
          totalRows: stats.totalRows,
          uniqueClients: stats.uniqueClients,
          renewalsIn90Days: stats.renewalsIn90Days,
          overdueRenewals: stats.overdueRenewals,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setAnalysisError(data.error ?? "Analysis failed — please try again.");
        setStep("drop");
        return;
      }

      setAnalysingPhase(3); // Done
      await new Promise((r) => setTimeout(r, 600)); // brief pause for UX
      setAiAnalysis(data as AIAnalysis);
      setStep("confirm");
    } catch {
      setAnalysisError("Couldn't reach the AI service. Check your connection and try again.");
      setStep("drop");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleImport = useCallback(async () => {
    if (!parsedFile || !aiAnalysis) return;
    setImporting(true);
    setImportError(null);
    setStep("importing");

    const { clients, policies } = buildImportPayload(
      parsedFile.allRows,
      aiAnalysis.column_mapping,
      ambiguityChoices
    );

    try {
      const isLarge = parsedFile.totalRows > 500;
      const res = await fetch("/api/import/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients,
          policies,
          certificates: [],
          async: isLarge,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setImportError(data.error ?? "Import failed — please try again.");
        setStep("confirm");
        setImporting(false);
        return;
      }

      // Store counts for overview banner
      if (typeof window !== "undefined") {
        const existing = JSON.parse(
          localStorage.getItem("hollis_import_counts") ?? "{}"
        );
        existing.policies = (existing.policies ?? 0) + (data.policies?.inserted ?? 0);
        existing.clients = (existing.clients ?? 0) + (data.clients?.inserted ?? 0);
        localStorage.setItem("hollis_import_counts", JSON.stringify(existing));
      }

      setImportResult(data as ImportResult);
      setStep("done");
    } catch {
      setImportError("Network error — please try again.");
      setStep("confirm");
    } finally {
      setImporting(false);
    }
  }, [parsedFile, aiAnalysis, ambiguityChoices]);

  function reset() {
    setStep("drop");
    setParsedFile(null);
    setAiAnalysis(null);
    setAmbiguityChoices({});
    setImportResult(null);
    setImportError(null);
    setFileError(null);
    setAnalysisError(null);
    setAnalysingPhase(0);
    setUnmappedOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Derived data for confirm screen ──────────────────────────

  const mappedFields = aiAnalysis
    ? (Object.entries(aiAnalysis.column_mapping) as [string, string | null][]).filter(
        ([, col]) => col != null
      )
    : [];

  // First non-empty sample value for a column
  const sampleFor = (col: string | null): string => {
    if (!col || !parsedFile) return "";
    for (const row of parsedFile.sampleRows) {
      const val = (row[col] ?? "").trim();
      if (val) return val;
    }
    return "";
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C] text-[#FAFAFA] antialiased">

      {/* Header */}
      <header className="h-[56px] shrink-0 border-b border-[#1C1C1C] flex items-center px-10 gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-[#333333]">Import</span>
          <span className="text-[#1C1C1C]">/</span>
          <span className="text-[#FAFAFA] font-medium">Full Book Import</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Zap size={13} className="text-[#FAFAFA]" />
          <span className="text-[12px] text-[#333333] font-medium">AI-Powered</span>
        </div>
      </header>

      {/* ── Step: Drop ──────────────────────────────────────────── */}
      {step === "drop" && (
        <div className="flex-1 flex flex-col items-center justify-center px-10 py-16">
          <div className="w-full max-w-[600px]">

            {/* Headline */}
            <div className="text-center mb-10">
              <h1 className="text-[28px] font-bold text-[#FAFAFA] tracking-tight mb-2">
                Drop your AMS export
              </h1>
              <p className="text-[15px] text-[#333333]">
                Hollis reads any WinBEAT, Sunrise, or Applied Epic export and maps every field automatically.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center min-h-[280px] rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                dragging
                  ? "border-[#FAFAFA] bg-[#FAFAFA]/[0.04] shadow-[0_0_60px_rgba(0,212,170,0.08)]"
                  : "border-[#1C1C1C] bg-[#111111] hover:border-[#3e3e4a] hover:bg-[#111820]"
              }`}
            >
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-colors ${
                  dragging
                    ? "bg-[#FAFAFA]/[0.08] border border-[#1C1C1C]"
                    : "bg-[#1a1a24] border border-[#1C1C1C]"
                }`}
              >
                <Upload
                  size={26}
                  className={`transition-colors ${dragging ? "text-[#FAFAFA]" : "text-[#333333]"}`}
                />
              </div>

              <p className={`text-[17px] font-semibold mb-1 transition-colors ${dragging ? "text-[#FAFAFA]" : "text-[#FAFAFA]"}`}>
                {dragging ? "Release to analyse" : "Drop file here"}
              </p>
              <p className="text-[13px] text-[#333333] mb-6">
                Excel (.xlsx, .xls) or CSV · max 10 MB
              </p>

              <div
                className="h-9 px-5 rounded-lg border border-[#1C1C1C] text-[13px] text-[#555555] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors font-medium"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Browse files
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                }}
              />
            </div>

            {/* Error */}
            {(fileError || analysisError) && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3">
                <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-300">{fileError ?? analysisError}</p>
              </div>
            )}

            {/* Supported systems */}
            <div className="flex items-center justify-center gap-4 mt-8">
              {["WinBEAT", "Sunrise", "Applied Epic", "Insight", "Any CSV"].map((s) => (
                <span
                  key={s}
                  className="text-[11px] text-[#333333] font-medium px-2 py-0.5 rounded border border-[#1C1C1C]"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Analysing ─────────────────────────────────────── */}
      {step === "analysing" && (
        <div className="flex-1 flex flex-col items-center justify-center px-10 py-16">
          <div className="w-full max-w-[420px] text-center">

            {/* Pulsing ring */}
            <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 rounded-full border-2 border-[#1C1C1C] animate-ping" />
              <div className="absolute inset-0 rounded-full border-2 border-[#FAFAFA]/10 animate-ping [animation-delay:0.5s]" />
              <div className="w-20 h-20 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center relative">
                <Zap size={26} className="text-[#FAFAFA]" />
              </div>
            </div>

            <h2 className="text-[20px] font-bold text-[#FAFAFA] mb-2">
              {analysingPhase <= 1 ? "Reading your file…" : analysingPhase === 2 ? "Analysing format…" : "Building mapping…"}
            </h2>
            <p className="text-[13px] text-[#333333] mb-10">
              {parsedFile?.name ?? "Processing"}
            </p>

            {/* Step indicators */}
            <div className="space-y-3 text-left">
              {[
                { label: "Parsing spreadsheet", phase: 1 },
                { label: "Detecting AMS system with AI", phase: 2 },
                { label: "Building field mapping", phase: 3 },
              ].map(({ label, phase }) => (
                <div key={phase} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    analysingPhase > phase
                      ? "bg-[#FAFAFA]/20 border border-[#555555]"
                      : analysingPhase === phase
                      ? "border border-[#1C1C1C] bg-transparent"
                      : "border border-[#1C1C1C] bg-transparent"
                  }`}>
                    {analysingPhase > phase ? (
                      <Check size={10} className="text-[#FAFAFA]" strokeWidth={3} />
                    ) : analysingPhase === phase ? (
                      <Loader2 size={11} className="text-[#FAFAFA] animate-spin" />
                    ) : null}
                  </div>
                  <span className={`text-[13px] transition-colors ${
                    analysingPhase >= phase ? "text-[#FAFAFA]" : "text-[#333333]"
                  }`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step: Confirm ───────────────────────────────────────── */}
      {step === "confirm" && aiAnalysis && parsedFile && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[820px] mx-auto px-10 py-10">

            {/* Headline */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <FileSpreadsheet size={18} className="text-[#FAFAFA]" />
                <h1 className="text-[22px] font-bold text-[#FAFAFA] tracking-tight">
                  Hollis detected{" "}
                  <span className="text-[#FAFAFA]">
                    {aiAnalysis.summary.clients_detected} clients
                  </span>{" "}
                  and{" "}
                  <span className="text-[#FAFAFA]">
                    {aiAnalysis.summary.policies_detected} policies
                  </span>{" "}
                  in your {aiAnalysis.detected_system} export.
                </h1>
              </div>
              <p className="text-[14px] text-[#333333]">
                Review the mapping below, resolve any flagged fields, then confirm to import.
              </p>
            </div>

            {/* Low confidence warning */}
            {aiAnalysis.confidence === "low" && (
              <div className="flex items-start gap-3 rounded-xl bg-[#1C1C1C] border border-[#1C1C1C] px-5 py-4 mb-6">
                <AlertTriangle size={16} className="text-[#888888] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#888888] mb-0.5">Low confidence mapping</p>
                  <p className="text-[13px] text-[#888888]/80">
                    The field mapping is uncertain. Review carefully before importing.
                  </p>
                </div>
              </div>
            )}

            {/* Import error */}
            {importError && (
              <div className="flex items-start gap-3 rounded-xl bg-red-950/30 border border-red-700/40 px-5 py-4 mb-6">
                <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-300 flex-1">{importError}</p>
                <button onClick={() => setImportError(null)}>
                  <X size={13} className="text-red-400 hover:text-red-300" />
                </button>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-5 gap-3 mb-8">
              <SummaryCard
                label="Clients"
                value={aiAnalysis.summary.clients_detected}
                sub="unique clients"
                accent="text-[#FAFAFA]"
              />
              <SummaryCard
                label="Policies"
                value={aiAnalysis.summary.policies_detected}
                sub="total policies"
                accent="text-[#FAFAFA]"
              />
              <SummaryCard
                label="Due in 90 days"
                value={aiAnalysis.summary.renewals_in_90_days}
                sub="upcoming renewals"
                accent={aiAnalysis.summary.renewals_in_90_days > 0 ? "text-[#ff6b35]" : "text-[#333333]"}
              />
              <SummaryCard
                label="At Risk"
                value={aiAnalysis.summary.overdue_renewals ?? "—"}
                sub="overdue renewals"
                accent={
                  (aiAnalysis.summary.overdue_renewals ?? 0) > 0
                    ? "text-red-400"
                    : "text-[#333333]"
                }
              />
              <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] px-6 py-5 flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-[#333333] uppercase tracking-[0.1em]">
                  Detected System
                </span>
                <span className="text-[20px] font-bold text-[#FAFAFA] leading-tight mt-0.5">
                  {aiAnalysis.detected_system}
                </span>
                <span
                  className={`self-start text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    CONFIDENCE_STYLES[aiAnalysis.confidence].className
                  }`}
                >
                  {CONFIDENCE_STYLES[aiAnalysis.confidence].label}
                </span>
              </div>
            </div>

            {/* Field mapping table */}
            {mappedFields.length > 0 && (
              <div className="rounded-xl border border-[#1C1C1C] bg-[#111111] overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-[#1C1C1C] bg-[#0C0C0C]">
                  <span className="text-[12px] font-bold text-[#333333] uppercase tracking-[0.1em]">
                    Field Mapping — {mappedFields.length} fields detected
                  </span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1C1C1C]">
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium text-[#333333] uppercase tracking-wider w-[200px]">
                        Hollis Field
                      </th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium text-[#333333] uppercase tracking-wider">
                        Detected From
                      </th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-medium text-[#333333] uppercase tracking-wider">
                        Sample Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedFields.map(([field, col]) => (
                      <MappingRow
                        key={field}
                        field={field}
                        header={col as string}
                        sample={sampleFor(col)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ambiguous columns */}
            {aiAnalysis.ambiguous_columns.length > 0 && (
              <div className="rounded-xl border border-[#1C1C1C] bg-[#1C1C1C] overflow-hidden mb-6">
                <div className="px-5 py-3 border-b border-[#1C1C1C] flex items-center gap-2.5">
                  <AlertTriangle size={13} className="text-[#888888]" />
                  <span className="text-[12px] font-bold text-[#888888]/80 uppercase tracking-[0.1em]">
                    {aiAnalysis.ambiguous_columns.length} field{aiAnalysis.ambiguous_columns.length !== 1 ? "s" : ""} need clarification
                  </span>
                </div>
                <div className="divide-y divide-[#1C1C1C]">
                  {aiAnalysis.ambiguous_columns.map((col) => (
                    <div key={col.header} className="px-5 py-4 flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-mono text-[#FAFAFA] bg-[#1a1a24] border border-[#1C1C1C] px-2 py-0.5 rounded">
                            {col.header}
                          </span>
                          <span className="text-[12px] text-[#888888]/70">
                            is ambiguous
                          </span>
                        </div>
                        <p className="text-[12px] text-[#333333]">
                          AI suggests: <span className="text-[#888888]">{col.recommendation}</span>
                        </p>
                      </div>
                      <select
                        value={ambiguityChoices[col.header] ?? ""}
                        onChange={(e) =>
                          setAmbiguityChoices((prev) => ({
                            ...prev,
                            [col.header]: e.target.value,
                          }))
                        }
                        className="bg-[#1a1a24] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[12px] text-[#FAFAFA] outline-none focus:border-[#555555] shrink-0"
                      >
                        <option value="">— ignore this column —</option>
                        {col.possible_meanings.map((m) => (
                          <option key={m} value={m}>
                            {HOLLIS_FIELD_LABELS[m] ?? m}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {aiAnalysis.warnings.length > 0 && (
              <div className="space-y-2.5 mb-6">
                {aiAnalysis.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg bg-[#1C1C1C] border border-[#1C1C1C] px-4 py-3"
                  >
                    <AlertTriangle size={13} className="text-[#888888] shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#888888]/90">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Unmapped columns — collapsible */}
            {aiAnalysis.unmapped_columns.length > 0 && (
              <div className="rounded-xl border border-[#1C1C1C] bg-[#0C0C0C] overflow-hidden mb-8">
                <button
                  onClick={() => setUnmappedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px] font-bold text-[#333333] uppercase tracking-[0.1em]">
                      {aiAnalysis.unmapped_columns.length} columns won&apos;t be imported
                    </span>
                  </div>
                  {unmappedOpen ? (
                    <ChevronUp size={14} className="text-[#333333]" />
                  ) : (
                    <ChevronDown size={14} className="text-[#333333]" />
                  )}
                </button>
                {unmappedOpen && (
                  <div className="border-t border-[#1C1C1C] px-5 py-4">
                    <p className="text-[12px] text-[#333333] mb-3">
                      These columns don&apos;t match any Hollis field and will be skipped.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {aiAnalysis.unmapped_columns.map((col) => (
                        <span
                          key={col}
                          className="text-[11px] font-mono text-[#333333] bg-[#111111] border border-[#1C1C1C] px-2 py-0.5 rounded"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2 pb-8">
              <button
                onClick={handleImport}
                disabled={importing}
                className="h-11 px-7 rounded-xl bg-[#FAFAFA] text-[#0C0C0C] text-[14px] font-bold hover:bg-[#E8E8E8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2.5 shadow-[0_0_30px_rgba(0,212,170,0.3),0_0_8px_rgba(0,212,170,0.15)]"
              >
                {importing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ArrowRight size={15} strokeWidth={2.5} />
                )}
                Import {aiAnalysis.summary.clients_detected} Clients &amp;{" "}
                {aiAnalysis.summary.policies_detected} Policies
              </button>
              <button
                onClick={reset}
                className="h-11 px-5 rounded-xl border border-[#1C1C1C] text-[14px] text-[#333333] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Step: Importing ─────────────────────────────────────── */}
      {step === "importing" && (
        <div className="flex-1 flex flex-col items-center justify-center px-10 py-16">
          <div className="w-full max-w-[400px] text-center">
            <div className="w-20 h-20 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center mx-auto mb-6">
              <Loader2 size={30} className="text-[#FAFAFA] animate-spin" />
            </div>
            <h2 className="text-[20px] font-bold text-[#FAFAFA] mb-2">
              Writing to your book…
            </h2>
            <p className="text-[13px] text-[#333333]">
              Matching clients, creating policies, scheduling renewals.
            </p>
          </div>
        </div>
      )}

      {/* ── Step: Done ──────────────────────────────────────────── */}
      {step === "done" && importResult && (
        <div className="flex-1 flex flex-col items-center justify-center px-10 py-16">
          <div className="w-full max-w-[480px]">

            {/* Icon */}
            <div className="flex justify-center mb-7">
              <div className="w-20 h-20 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center shadow-[0_0_40px_rgba(0,212,170,0.15)]">
                <CheckCircle2 size={32} className="text-[#FAFAFA]" />
              </div>
            </div>

            <h1 className="text-[26px] font-bold text-[#FAFAFA] text-center tracking-tight mb-8">
              Import complete
            </h1>

            {/* Result cards */}
            <div className="space-y-3 mb-8">
              {[
                {
                  label: "Clients",
                  inserted: importResult.clients.inserted,
                  dupes: importResult.clients.duplicates,
                  color: "text-[#FAFAFA]",
                },
                {
                  label: "Policies",
                  inserted: importResult.policies.inserted,
                  dupes: importResult.policies.duplicates,
                  color: "text-[#FAFAFA]",
                },
              ].map(({ label, inserted, dupes, color }) => (
                <div
                  key={label}
                  className="rounded-xl bg-[#111111] border border-[#1C1C1C] px-6 py-4 flex items-center justify-between"
                >
                  <span className="text-[14px] font-semibold text-[#555555]">
                    {label}
                  </span>
                  <div className="flex items-baseline gap-4">
                    <div className="text-right">
                      <span className={`text-[22px] font-bold tabular-nums ${color}`}>
                        {inserted}
                      </span>
                      <span className="text-[12px] text-[#333333] ml-1.5">added</span>
                    </div>
                    {dupes > 0 && (
                      <div className="text-right">
                        <span className="text-[16px] font-bold tabular-nums text-[#333333]">
                          {dupes}
                        </span>
                        <span className="text-[12px] text-[#333333] ml-1">skipped</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Row errors */}
            {importResult.errors.length > 0 && (
              <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] px-5 py-4 mb-6">
                <p className="text-[12px] text-[#333333] mb-2">
                  {importResult.errors.length} row{importResult.errors.length !== 1 ? "s" : ""} couldn&apos;t be imported and were skipped.
                </p>
                <ul className="space-y-1 max-h-24 overflow-y-auto">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i} className="text-[11px] text-[#333333] font-mono">
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li className="text-[11px] text-[#333333]">
                      + {importResult.errors.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/clients"
                className="h-11 px-7 rounded-xl bg-[#FAFAFA] text-[#0C0C0C] text-[14px] font-bold hover:bg-[#E8E8E8] transition-colors flex items-center gap-2 shadow-[0_0_30px_rgba(0,212,170,0.25)]"
              >
                View your book
                <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
              <button
                onClick={reset}
                className="h-11 px-5 rounded-xl border border-[#1C1C1C] text-[14px] text-[#333333] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors"
              >
                Import another file
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
