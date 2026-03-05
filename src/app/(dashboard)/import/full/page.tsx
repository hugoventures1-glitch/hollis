"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Upload, CheckCircle, AlertCircle,
  X, Download, Loader2, Users, ShieldCheck, RefreshCw,
} from "lucide-react";
import {
  parseCSVText, normaliseEmail, normalisePhone, normaliseDate,
  generateTemplateCsv, triggerCsvDownload, errorsToCSV,
} from "@/lib/import/csv-utils";
import { normaliseHeader } from "@/lib/import/csv-utils";
import type { RowError } from "@/lib/import/csv-utils";

// ── Entity bucket types ────────────────────────────────────────

type Bucket = "client" | "policy" | "certificate" | "ignore";

interface ColumnAssignment {
  header: string;
  bucket: Bucket;
  field: string; // the specific field within the bucket
}

// Client fields
type ClientField = "name" | "email" | "phone" | "industry" | "notes";
const CLIENT_FIELDS: ClientField[] = ["name", "email", "phone", "industry", "notes"];
const CLIENT_LABELS: Record<ClientField, string> = {
  name: "Client Name", email: "Email", phone: "Phone", industry: "Industry", notes: "Notes",
};
const CLIENT_SYNONYMS: Record<ClientField, string[]> = {
  name:     ["name", "client name", "full name", "insured", "account", "customer", "business name", "company name", "account name"],
  email:    ["email", "email address", "client email", "e-mail", "e mail", "contact email"],
  phone:    ["phone", "phone number", "mobile", "cell", "telephone", "contact number"],
  industry: ["industry", "type", "business type", "sector", "line of business", "lob"],
  notes:    ["notes", "comments", "memo"],
};

// Policy fields
type PolicyField = "client_name" | "policy_name" | "expiration_date" | "carrier" | "premium" | "client_email";
const POLICY_FIELDS: PolicyField[] = ["client_name", "policy_name", "expiration_date", "carrier", "premium", "client_email"];
const POLICY_LABELS: Record<PolicyField, string> = {
  client_name: "Client Name", policy_name: "Policy Name", expiration_date: "Expiration Date",
  carrier: "Carrier", premium: "Premium", client_email: "Client Email",
};
const POLICY_SYNONYMS: Record<PolicyField, string[]> = {
  client_name:     ["client name", "client", "insured", "name", "full name", "customer name", "account name"],
  policy_name:     ["policy name", "policy", "plan name", "plan", "policy number", "policy num", "policy no", "pol number", "pol no", "policy #"],
  expiration_date: ["expiration date", "expiry", "expiry date", "end date", "exp date", "expires", "expiration", "renewal date"],
  carrier:         ["carrier", "insurance carrier", "insurer", "company", "insurance company", "provider"],
  premium:         ["premium", "annual premium", "amount", "price", "total premium"],
  client_email:    ["client email", "email", "email address", "insured email", "insured email address", "named insured email"],
};

// Certificate fields
type CertField =
  | "insured_name" | "holder_name" | "holder_email" | "holder_address"
  | "expiration_date" | "effective_date" | "certificate_number"
  | "coverage_type" | "policy_number" | "line_of_business"
  | "additional_insured" | "requested_by" | "requested_date" | "insured_email";
const CERT_FIELDS: CertField[] = [
  "insured_name", "holder_name", "holder_email", "holder_address",
  "expiration_date", "effective_date", "certificate_number",
  "coverage_type", "policy_number", "line_of_business",
  "additional_insured", "requested_by", "requested_date", "insured_email",
];
const CERT_LABELS: Record<CertField, string> = {
  insured_name: "Insured Name", holder_name: "Holder Name", holder_email: "Holder Email",
  holder_address: "Certificate Holder Address", expiration_date: "Expiration Date",
  effective_date: "Effective Date", certificate_number: "Certificate #",
  coverage_type: "Coverage Type", policy_number: "Policy Number",
  line_of_business: "Line of Business", additional_insured: "Additional Insured",
  requested_by: "Requested By", requested_date: "Requested Date", insured_email: "Insured Email",
};
const CERT_SYNONYMS: Record<CertField, string[]> = {
  insured_name:       ["insured", "insured name", "named insured", "policyholder"],
  holder_name:        ["holder", "certificate holder", "holder name", "issued to", "recipient"],
  holder_email:       ["holder email", "certificate holder email", "send to"],
  holder_address:     ["certificate holder address", "holder address", "cert holder address"],
  expiration_date:    ["cert expiration", "cert exp date", "certificate expiry", "expiration date", "expiry", "expiration"],
  effective_date:     ["effective date", "effective", "inception date", "start date"],
  certificate_number: ["cert number", "certificate number", "cert no", "coi number"],
  coverage_type:      ["coverage", "coverage type", "lines of coverage"],
  policy_number:      ["policy number", "policy no", "policy num", "pol number"],
  line_of_business:   ["line of business", "lob", "business line"],
  additional_insured: ["additional insured", "addl insured", "additional insureds"],
  requested_by:       ["requested by", "requester", "requestor", "submitted by"],
  requested_date:     ["requested date", "request date", "submission date"],
  insured_email:      ["insured email", "insured email address", "named insured email"],
};

// ── Auto-detect which bucket each column belongs to ───────────

function autoAssign(headers: string[]): ColumnAssignment[] {
  return headers.map((h) => {
    const norm = normaliseHeader(h);

    // Try policy synonyms (more specific than client)
    for (const [field, syns] of Object.entries(POLICY_SYNONYMS) as [PolicyField, string[]][]) {
      if (syns.includes(norm)) return { header: h, bucket: "policy", field };
    }
    // Try cert synonyms
    for (const [field, syns] of Object.entries(CERT_SYNONYMS) as [CertField, string[]][]) {
      if (syns.includes(norm)) return { header: h, bucket: "certificate", field };
    }
    // Try client synonyms
    for (const [field, syns] of Object.entries(CLIENT_SYNONYMS) as [ClientField, string[]][]) {
      if (syns.includes(norm)) return { header: h, bucket: "client", field };
    }
    return { header: h, bucket: "ignore", field: "" };
  });
}

// ── Detect what entity types are likely in the file ───────────

function detectEntityTypes(assignments: ColumnAssignment[]): string[] {
  const buckets = new Set(assignments.map((a) => a.bucket).filter((b) => b !== "ignore"));
  const labels: string[] = [];
  if (buckets.has("client")) labels.push("client data");
  if (buckets.has("policy")) labels.push("policy & renewal data");
  if (buckets.has("certificate")) labels.push("certificate data");
  return labels;
}

// ── Transform rows per entity ──────────────────────────────────

function extractEntityRows(
  rows: Record<string, string>[],
  assignments: ColumnAssignment[],
  bucket: Bucket
): Record<string, string>[] {
  const relevant = assignments.filter((a) => a.bucket === bucket);
  if (relevant.length === 0) return [];
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    for (const a of relevant) obj[a.field] = (row[a.header] ?? "").trim();
    return obj;
  });
}

// ── Import result types ────────────────────────────────────────

interface EntityResult {
  inserted: number;
  duplicates: number;
}

interface FullImportResult {
  clients: EntityResult;
  policies: EntityResult;
  certificates: EntityResult;
  errors: RowError[];
  jobId?: string;
}

type Step = "upload" | "detect" | "map" | "preview" | "importing" | "done";

const STEP_LABELS = ["Upload", "Detect", "Map", "Preview", "Import"];

function StepIndicator({ current }: { current: Step }) {
  const STEPS: Step[] = ["upload", "detect", "map", "preview", "importing"];
  const ci = STEPS.indexOf(current === "done" ? "importing" : current);
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && <div className="w-6 h-px bg-[#1e1e2a]" />}
          <div className={`flex items-center gap-1.5 text-[11px] ${ci === i ? "text-[#f5f5f7]" : ci > i ? "text-[#00d4aa]" : "text-[#505057]"}`}>
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border ${
              ci === i ? "bg-[#00d4aa] border-[#00d4aa] text-[#0d0d12]" : ci > i ? "bg-[#00d4aa]/20 border-[#00d4aa]/40 text-[#00d4aa]" : "bg-transparent border-[#505057] text-[#505057]"
            }`}>{i + 1}</div>
            {STEP_LABELS[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Bucket selector row ────────────────────────────────────────

const BUCKET_OPTIONS: { value: Bucket; label: string }[] = [
  { value: "client",      label: "Client field" },
  { value: "policy",      label: "Policy field" },
  { value: "certificate", label: "Certificate field" },
  { value: "ignore",      label: "Ignore" },
];

const FIELD_OPTIONS_BY_BUCKET: Record<Bucket, { value: string; label: string }[]> = {
  client:      CLIENT_FIELDS.map((f) => ({ value: f, label: CLIENT_LABELS[f] })),
  policy:      POLICY_FIELDS.map((f) => ({ value: f, label: POLICY_LABELS[f] })),
  certificate: CERT_FIELDS.map((f) => ({ value: f, label: CERT_LABELS[f] })),
  ignore:      [],
};

const BUCKET_COLORS: Record<Bucket, string> = {
  client:      "text-blue-400 bg-blue-900/20 border-blue-800/30",
  policy:      "text-[#00d4aa] bg-[#00d4aa]/10 border-[#00d4aa]/20",
  certificate: "text-amber-400 bg-amber-900/20 border-amber-800/30",
  ignore:      "text-[#505057] bg-[#ffffff06] border-[#ffffff10]",
};

// ── Page ──────────────────────────────────────────────────────

export default function FullImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // CSV
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [assignments, setAssignments] = useState<ColumnAssignment[]>([]);
  const [detectedTypes, setDetectedTypes] = useState<string[]>([]);

  // Import
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<FullImportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Template download
  const TEMPLATE_HEADERS = ["Client Name", "Client Email", "Client Phone", "Client Industry", "Policy Name", "Expiration Date", "Carrier", "Premium", "Holder Name", "Holder Email", "Cert Expiration"];
  const TEMPLATE_ROWS = [
    ["Acme Corp", "acme@example.com", "555-123-4567", "Construction", "Commercial GL", "2025-12-31", "Travelers", "4500", "City of Austin", "certs@austin.gov", "2025-12-31"],
    ["Beta LLC", "beta@example.com", "555-987-6543", "Retail", "BOP", "2026-03-15", "Hartford", "2200", "", "", ""],
  ];

  const handleFile = useCallback((file: File) => {
    setFileError(null);
    if (file.size > 10 * 1024 * 1024) { setFileError("File exceeds 10 MB limit."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSVText(text);
      if (headers.length === 0) { setFileError("No columns found."); return; }
      const auto = autoAssign(headers);
      setCsvHeaders(headers);
      setCsvRows(rows);
      setAssignments(auto);
      setDetectedTypes(detectEntityTypes(auto));
      setStep("detect");
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
  }, [handleFile]);

  function updateAssignment(idx: number, bucket: Bucket, field: string) {
    setAssignments((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], bucket, field };
      return next;
    });
  }

  // Polling for async job status
  useEffect(() => {
    if (!jobId || step !== "importing") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/import/full/${jobId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.total_rows > 0) {
          setImportProgress(Math.round((data.processed_rows / data.total_rows) * 100));
        }
        if (data.status === "complete" && data.result_json) {
          clearInterval(timer);
          setResult(data.result_json as FullImportResult);
          setStep("done");
          setImporting(false);
        } else if (data.status === "failed") {
          clearInterval(timer);
          setServerError("Import job failed. Please try again.");
          setStep("preview");
          setImporting(false);
        }
      } catch { /* ignore polling errors */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [jobId, step]);

  async function handleImport() {
    setImporting(true);
    setServerError(null);
    setImportProgress(0);
    setStep("importing");

    // Build typed row arrays
    const clientRows = extractEntityRows(csvRows, assignments, "client").map((r) => ({
      name: r.name ?? "", email: normaliseEmail(r.email), phone: normalisePhone(r.phone),
      industry: r.industry ?? "", notes: r.notes ?? "", address: "",
    }));
    const policyRows = extractEntityRows(csvRows, assignments, "policy").map((r) => ({
      client_name: r.client_name ?? "", policy_name: r.policy_name ?? "",
      expiration_date: normaliseDate(r.expiration_date) ?? r.expiration_date ?? "",
      carrier: r.carrier ?? "", premium: r.premium ? parseFloat(r.premium.replace(/[^0-9.]/g, "")) || undefined : undefined,
      client_email: normaliseEmail(r.client_email),
    }));
    const certRows = extractEntityRows(csvRows, assignments, "certificate").map((r) => ({
      insured_name: r.insured_name ?? "", holder_name: r.holder_name ?? "",
      holder_email: normaliseEmail(r.holder_email),
      holder_address: r.holder_address ?? "",
      expiration_date: normaliseDate(r.expiration_date) ?? r.expiration_date ?? "",
      effective_date: normaliseDate(r.effective_date) ?? r.effective_date ?? "",
      certificate_number: r.certificate_number ?? "", coverage_type: r.coverage_type ?? "",
      policy_number: r.policy_number ?? "", line_of_business: r.line_of_business ?? "",
      additional_insured: r.additional_insured ?? "", requested_by: r.requested_by ?? "",
      requested_date: normaliseDate(r.requested_date) ?? r.requested_date ?? "",
      insured_email: normaliseEmail(r.insured_email),
    }));

    try {
      const isLarge = csvRows.length > 500;
      const res = await fetch("/api/import/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients: clientRows,
          policies: policyRows,
          certificates: certRows,
          async: isLarge,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Import failed");
        setStep("preview");
        setImporting(false);
        return;
      }
      if (data.jobId) {
        // Async: poll for status
        setJobId(data.jobId);
        // keep step at "importing" — polling useEffect will handle completion
      } else {
        // Sync result
        if (typeof window !== "undefined") {
          const existing = JSON.parse(localStorage.getItem("hollis_import_counts") ?? "{}");
          existing.policies = (existing.policies ?? 0) + (data.policies?.inserted ?? 0);
          existing.clients = (existing.clients ?? 0) + (data.clients?.inserted ?? 0);
          existing.certificates = (existing.certificates ?? 0) + (data.certificates?.inserted ?? 0);
          localStorage.setItem("hollis_import_counts", JSON.stringify(existing));
        }
        setResult(data);
        setStep("done");
        setImporting(false);
      }
    } catch {
      setServerError("Network error — please try again");
      setStep("preview");
      setImporting(false);
    }
  }

  function reset() {
    setStep("upload"); setCsvHeaders([]); setCsvRows([]); setAssignments([]);
    setDetectedTypes([]); setResult(null); setServerError(null); setFileError(null);
    setJobId(null); setImportProgress(0); setImporting(false);
  }

  // Derived data for preview
  const clientRows = assignments.filter((a) => a.bucket === "client").length;
  const policyRows = assignments.filter((a) => a.bucket === "policy").length;
  const certRows = assignments.filter((a) => a.bucket === "certificate").length;

  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link href="/import" className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">
          <ArrowLeft size={13} /> Import
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7]">Full Book Import</span>
        <div className="ml-auto"><StepIndicator current={step} /></div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-10">

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-[22px] font-bold text-[#f5f5f7]">Full Book Import</h1>
              <button onClick={() => triggerCsvDownload("hollis-full-book-template.csv", generateTemplateCsv(TEMPLATE_HEADERS, TEMPLATE_ROWS))}
                className="flex items-center gap-1.5 text-[12px] text-[#505057] hover:text-[#8a8b91] transition-colors">
                <Download size={12} /> Download template
              </button>
            </div>
            <p className="text-[14px] text-[#8a8b91] mb-8">
              Upload an export from Applied Epic, AMS360, HawkSoft, EZLynx, or any spreadsheet. Hollis will detect what&apos;s in each column.
            </p>

            <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center h-52 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragging ? "border-[#00d4aa] bg-[#00d4aa]/[0.04]" : "border-[#2e2e3a] bg-[#111118] hover:border-[#3e3e4a] hover:bg-[#14141e]"}`}>
              <Upload size={28} className={dragging ? "text-[#00d4aa]" : "text-[#505057]"} />
              <div className="text-[15px] font-medium text-[#f5f5f7] mt-3">Drop your AMS export here</div>
              <div className="text-[13px] text-[#8a8b91] mt-1">CSV — max 10 MB · {">"}500 rows processed async</div>
              <input ref={fileRef} type="file" accept=".csv" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {fileError && <div className="mt-4 flex items-center gap-2 text-[13px] text-red-400"><AlertCircle size={14} /> {fileError}</div>}
          </div>
        )}

        {/* ── Step 2: Detect ── */}
        {step === "detect" && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">What did we find?</h1>
            <p className="text-[14px] text-[#8a8b91] mb-6">
              We detected <strong className="text-[#f5f5f7]">{csvRows.length} rows</strong> and <strong className="text-[#f5f5f7]">{csvHeaders.length} columns</strong>.
            </p>

            {detectedTypes.length > 0 ? (
              <div className="rounded-xl bg-[#00d4aa]/[0.04] border border-[#00d4aa]/20 p-5 mb-6">
                <div className="text-[13px] font-semibold text-[#00d4aa] mb-2">Hollis detected:</div>
                <p className="text-[14px] text-[#f5f5f7]">
                  This file appears to contain <strong>{detectedTypes.join(", ")}</strong>.
                  Review the column mapping on the next step and adjust anything that looks wrong.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-950/30 border border-amber-800/40 p-5 mb-6">
                <div className="text-[13px] font-semibold text-amber-400 mb-1">Column names are unfamiliar</div>
                <p className="text-[13px] text-amber-300/80">
                  Hollis couldn&apos;t auto-detect your column types. You&apos;ll need to assign them manually on the next step.
                </p>
              </div>
            )}

            {/* Quick column summary */}
            <div className="rounded-lg border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
              <div className="px-5 py-2.5 border-b border-[#1e1e2a] bg-[#0d0d12]">
                <div className="text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Detected column assignments</div>
              </div>
              <div className="divide-y divide-[#1e1e2a]/60">
                {assignments.map((a) => (
                  <div key={a.header} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-[13px] text-[#c5c5cb] font-mono">{a.header}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${BUCKET_COLORS[a.bucket]}`}>
                      {a.bucket === "ignore" ? "Ignore" : `${a.bucket} · ${a.field}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep("upload")} className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">Back</button>
              <button onClick={() => setStep("map")} className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors">
                Adjust Mapping
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Map ── */}
        {step === "map" && (
          <div className="max-w-3xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">Assign columns to entity types</h1>
            <p className="text-[14px] text-[#8a8b91] mb-8">
              Each column can map to a Client, Policy, or Certificate field — or be ignored.
            </p>

            {/* Bucket legend */}
            <div className="flex items-center gap-3 mb-5">
              {(["client", "policy", "certificate", "ignore"] as Bucket[]).map((b) => (
                <span key={b} className={`text-[11px] px-2.5 py-1 rounded-full border font-medium capitalize ${BUCKET_COLORS[b]}`}>{b}</span>
              ))}
            </div>

            <div className="rounded-lg border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
              <div className="grid grid-cols-3 px-5 py-2.5 border-b border-[#1e1e2a] bg-[#0d0d12]">
                <div className="text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Column</div>
                <div className="text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Entity</div>
                <div className="text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider">Field</div>
              </div>
              {assignments.map((a, idx) => (
                <div key={a.header} className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-[#1e1e2a]/60 last:border-b-0 items-center">
                  <div className="text-[13px] text-[#c5c5cb] font-mono truncate">{a.header}</div>
                  <select
                    value={a.bucket}
                    onChange={(e) => updateAssignment(idx, e.target.value as Bucket, "")}
                    className="bg-[#1a1a24] border border-[#2e2e3a] rounded-md px-2 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50"
                  >
                    {BUCKET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    value={a.field}
                    onChange={(e) => updateAssignment(idx, a.bucket, e.target.value)}
                    disabled={a.bucket === "ignore"}
                    className="bg-[#1a1a24] border border-[#2e2e3a] rounded-md px-2 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 disabled:opacity-40"
                  >
                    <option value="">— field —</option>
                    {(FIELD_OPTIONS_BY_BUCKET[a.bucket] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setStep("detect")} className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">Back</button>
              <button onClick={() => setStep("preview")} className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors">
                Preview Import
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === "preview" && (
          <div className="max-w-4xl mx-auto">
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">Preview full import</h1>
            <p className="text-[14px] text-[#8a8b91] mb-6">
              <strong className="text-[#f5f5f7]">{csvRows.length} rows</strong> will be processed across all entity types.
            </p>

            {/* Entity summary */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: "Client columns", count: clientRows, icon: Users, color: "text-blue-400", bg: "bg-blue-900/20 border-blue-800/30" },
                { label: "Policy columns", count: policyRows, icon: RefreshCw, color: "text-[#00d4aa]", bg: "bg-[#00d4aa]/10 border-[#00d4aa]/20" },
                { label: "Certificate columns", count: certRows, icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-900/20 border-amber-800/30" },
              ].map(({ label, count, icon: Icon, color, bg }) => (
                <div key={label} className={`rounded-lg border ${bg} px-4 py-3 flex items-center gap-3`}>
                  <Icon size={18} className={color} />
                  <div>
                    <div className={`text-[18px] font-bold tabular-nums ${count > 0 ? color : "text-[#505057]"}`}>{count}</div>
                    <div className="text-[11px] text-[#505057]">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Sample data */}
            <div className="rounded-lg border border-[#1e1e2a] bg-[#111118] overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e1e2a] bg-[#0d0d12]">
                      {assignments.filter((a) => a.bucket !== "ignore").map((a) => (
                        <th key={a.header} className="px-3 py-2.5 text-left whitespace-nowrap">
                          <div className="text-[10px] font-mono text-[#505057]">{a.header}</div>
                          <div className={`text-[10px] font-medium mt-0.5 ${BUCKET_COLORS[a.bucket].split(" ")[0]}`}>
                            {a.bucket} · {a.field}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-[#1e1e2a]/60 last:border-b-0">
                        {assignments.filter((a) => a.bucket !== "ignore").map((a) => (
                          <td key={a.header} className="px-3 py-2.5 text-[12px] text-[#c5c5cb] whitespace-nowrap max-w-[140px] truncate">
                            {row[a.header] || <span className="text-[#505057]">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {csvRows.length > 5 && (
                      <tr><td colSpan={99} className="px-3 py-2.5 text-[12px] text-[#505057] text-center">+ {csvRows.length - 5} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {csvRows.length > 500 && (
              <div className="flex items-start gap-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40 px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-blue-400 shrink-0 mt-0.5" />
                <div className="text-[13px] text-blue-300">
                  <strong>{csvRows.length} rows</strong> — this will run as a background job. You&apos;ll see a progress indicator while it processes.
                </div>
              </div>
            )}

            {serverError && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 mb-5">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="text-[13px] text-red-300 flex-1">{serverError}</div>
                <button onClick={() => setServerError(null)}><X size={13} className="text-red-400" /></button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={() => setStep("map")} className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">Back</button>
              <button onClick={handleImport} disabled={importing}
                className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-60">
                {importing ? "Starting…" : `Import ${csvRows.length} Rows`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Importing (progress) ── */}
        {step === "importing" && (
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30 flex items-center justify-center mx-auto mb-6">
              <Loader2 size={28} className="text-[#00d4aa] animate-spin" />
            </div>
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-2">Importing…</h1>
            <p className="text-[13px] text-[#8a8b91] mb-8">
              {jobId ? "Running as background job — you can leave this page and come back." : "Processing your data…"}
            </p>
            {jobId && (
              <div className="w-full bg-[#1e1e2a] rounded-full h-2 mb-2 overflow-hidden">
                <div className="h-full bg-[#00d4aa] rounded-full transition-all duration-500" style={{ width: `${importProgress}%` }} />
              </div>
            )}
            {jobId && <div className="text-[12px] text-[#505057]">{importProgress}% complete</div>}
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && result && (
          <div className="max-w-lg mx-auto py-8">
            <div className="w-16 h-16 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-[#00d4aa]" />
            </div>
            <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-6 text-center">Full import complete</h1>

            <div className="space-y-3 mb-8">
              {[
                { label: "Clients", data: result.clients, icon: Users, color: "text-blue-400" },
                { label: "Policies", data: result.policies, icon: RefreshCw, color: "text-[#00d4aa]" },
                { label: "Certificates", data: result.certificates, icon: ShieldCheck, color: "text-amber-400" },
              ].map(({ label, data, icon: Icon, color }) => (
                <div key={label} className="rounded-lg bg-[#111118] border border-[#1e1e2a] px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={15} className={color} />
                    <span className="text-[13px] font-semibold text-[#f5f5f7]">{label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className={`text-[20px] font-bold tabular-nums ${color}`}>{data.inserted}</div>
                      <div className="text-[11px] text-[#505057]">inserted</div>
                    </div>
                    <div>
                      <div className="text-[20px] font-bold tabular-nums text-[#505057]">{data.duplicates}</div>
                      <div className="text-[11px] text-[#505057]">duplicates skipped</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg bg-red-950/30 border border-red-800/40 p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] font-semibold text-red-400 uppercase tracking-wider">{result.errors.length} row errors</div>
                  <button onClick={() => triggerCsvDownload("hollis-full-import-errors.csv", errorsToCSV(result.errors))}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300">
                    <Download size={11} /> Download
                  </button>
                </div>
                <ul className="space-y-1 max-h-28 overflow-y-auto">
                  {result.errors.slice(0, 6).map((err, i) => <li key={i} className="text-[12px] text-red-300">Row {err.row}: {err.reason}</li>)}
                  {result.errors.length > 6 && <li className="text-[12px] text-red-400">+ {result.errors.length - 6} more</li>}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button onClick={reset} className="h-9 px-5 rounded-md border border-[#2e2e3a] text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">Import Another</button>
              <Link href="/overview" className="h-9 px-5 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors flex items-center gap-1.5">
                Go to Overview
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
