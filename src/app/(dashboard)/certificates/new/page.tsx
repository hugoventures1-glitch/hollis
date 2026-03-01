"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, CheckCircle, AlertTriangle, Loader2, Send, ExternalLink } from "lucide-react";
import { HolderAutofillInput } from "@/components/coi/HolderAutofillInput";
import type { COIRequest, CoverageSnapshot, GLCoverage, AutoCoverage, UmbrellaCoverage, WCCoverage, Certificate, CoverageCheckResult } from "@/types/coi";

// ── Helpers ───────────────────────────────────────────────────

function fmtNum(n: number | null | undefined) {
  if (!n) return "";
  return n.toString();
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function Field({
  label, value, onChange, placeholder, required, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-[#00d4aa] ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 placeholder-[#505057]"
      />
      {hint && <p className="text-[10px] text-[#505057] mt-1">{hint}</p>}
    </div>
  );
}

function MoneyField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#505057] text-[12px]">$</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "0"}
          className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 pl-6 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40 placeholder-[#3a3a42]"
        />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 text-[12px] font-medium transition-colors ${checked ? "text-[#00d4aa]" : "text-[#8a8b91] hover:text-[#f5f5f7]"}`}
    >
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? "bg-[#00d4aa] border-[#00d4aa]" : "border-[#3a3a42]"}`}>
        {checked && <CheckCircle size={10} className="text-black" />}
      </div>
      {label}
    </button>
  );
}

function SectionHeader({ title, enabled, onToggle }: { title: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1e1e2a]">
      <span className="text-[14px] font-semibold text-[#f5f5f7]">{title}</span>
      <Toggle label={enabled ? "Included" : "Not included"} checked={enabled} onChange={onToggle} />
    </div>
  );
}

// ── Default blank coverage objects ────────────────────────────

const blankGL = (): GLCoverage => ({
  enabled: false, claims_made: false, each_occurrence: null, damage_to_rented_premises: null,
  med_exp: null, personal_adv_injury: null, general_aggregate: null, products_comp_ops_agg: null,
  policy_number: "", effective: "", expiration: "", insurer: "",
});

const blankAuto = (): AutoCoverage => ({
  enabled: false, any_auto: true, owned_autos_only: false, hired_autos_only: false,
  non_owned_autos_only: false, combined_single_limit: null, bodily_injury_per_person: null,
  bodily_injury_per_accident: null, property_damage_per_accident: null,
  policy_number: "", effective: "", expiration: "", insurer: "",
});

const blankUmbrella = (): UmbrellaCoverage => ({
  enabled: false, is_umbrella: true, claims_made: false, each_occurrence: null, aggregate: null,
  policy_number: "", effective: "", expiration: "", insurer: "",
});

const blankWC = (): WCCoverage => ({
  enabled: false, el_each_accident: null, el_disease_policy_limit: null, el_disease_each_employee: null,
  policy_number: "", effective: "", expiration: "", insurer: "",
});

// ── Main page ─────────────────────────────────────────────────

export default function NewCOIPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request");

  const [sourceRequest, setSourceRequest] = useState<COIRequest | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(!!requestId);

  // Basic info
  const [insuredName, setInsuredName] = useState("");
  const [insuredAddress, setInsuredAddress] = useState("");
  const [producerName, setProducerName] = useState("");
  const [producerAddress, setProducerAddress] = useState("");
  const [producerPhone, setProducerPhone] = useState("");
  const [producerEmail, setProducerEmail] = useState("");
  const [holderName, setHolderName] = useState("");
  const [holderAddress, setHolderAddress] = useState("");
  const [holderCity, setHolderCity] = useState("");
  const [holderState, setHolderState] = useState("");
  const [holderZip, setHolderZip] = useState("");
  const [holderEmail, setHolderEmail] = useState("");
  const [additionalInsured, setAdditionalInsured] = useState("");
  const [description, setDescription] = useState("");

  // Coverage
  const [gl, setGl] = useState<GLCoverage>(blankGL());
  const [auto, setAuto] = useState<AutoCoverage>(blankAuto());
  const [umbrella, setUmbrella] = useState<UmbrellaCoverage>(blankUmbrella());
  const [wc, setWc] = useState<WCCoverage>(blankWC());

  // Holder autofill
  const selectedHolderIdRef = useRef<string | null>(null);

  const handleHolderSelect = useCallback((holder: {
    id: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    commonCoverageTypes: string[];
    commonInsuredNames: string[];
  }) => {
    selectedHolderIdRef.current = holder.id;
    if (holder.address !== undefined) setHolderAddress(holder.address);
    if (holder.city !== undefined) setHolderCity(holder.city);
    if (holder.state !== undefined) setHolderState(holder.state);
    if (holder.zip !== undefined) setHolderZip(holder.zip);
    // Pre-enable coverage types based on this holder's history
    if (holder.commonCoverageTypes.includes("gl"))       setGl(p => ({ ...p, enabled: true }));
    if (holder.commonCoverageTypes.includes("auto"))     setAuto(p => ({ ...p, enabled: true }));
    if (holder.commonCoverageTypes.includes("umbrella")) setUmbrella(p => ({ ...p, enabled: true }));
    if (holder.commonCoverageTypes.includes("wc"))       setWc(p => ({ ...p, enabled: true }));
  }, []);

  // Result state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ certificate: Certificate; coverage_check: CoverageCheckResult | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Send state
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Load source request if present
  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/coi/requests/${requestId}`)
      .catch(() => null)
      .finally(() => setLoadingRequest(false));

    // Fetch request details directly from requests API
    fetch(`/api/coi?_=1`)
      .then(r => r.json())
      .then(data => {
        const req = data.requests?.find((r: COIRequest) => r.id === requestId);
        if (req) {
          setSourceRequest(req);
          setInsuredName(req.insured_name);
          setHolderName(req.holder_name);
          setHolderAddress(req.holder_address ?? "");
          setHolderCity(req.holder_city ?? "");
          setHolderState(req.holder_state ?? "");
          setHolderZip(req.holder_zip ?? "");
          setAdditionalInsured(req.additional_insured_language ?? "");
          setDescription(req.project_description ?? "");
          setSendEmail(req.requester_email ?? "");
          // Pre-enable required coverage types
          if (req.coverage_types.includes("gl")) setGl(p => ({ ...p, enabled: true }));
          if (req.coverage_types.includes("auto")) setAuto(p => ({ ...p, enabled: true }));
          if (req.coverage_types.includes("umbrella")) setUmbrella(p => ({ ...p, enabled: true }));
          if (req.coverage_types.includes("wc")) setWc(p => ({ ...p, enabled: true }));
        }
      })
      .catch(() => null)
      .finally(() => setLoadingRequest(false));
  }, [requestId]);

  const handleGenerate = useCallback(async () => {
    if (!insuredName.trim() || !holderName.trim()) {
      setError("Insured name and certificate holder are required.");
      return;
    }

    setGenerating(true);
    setError(null);

    const coverage_snapshot: CoverageSnapshot = {};
    if (gl.enabled) coverage_snapshot.gl = gl;
    if (auto.enabled) coverage_snapshot.auto = auto;
    if (umbrella.enabled) coverage_snapshot.umbrella = umbrella;
    if (wc.enabled) coverage_snapshot.wc = wc;

    const body = {
      request_id: requestId ?? undefined,
      insured_name: insuredName,
      insured_address: insuredAddress || undefined,
      producer_name: producerName || undefined,
      producer_address: producerAddress || undefined,
      producer_phone: producerPhone || undefined,
      producer_email: producerEmail || undefined,
      holder_name: holderName,
      holder_address: holderAddress || undefined,
      holder_city: holderCity || undefined,
      holder_state: holderState || undefined,
      holder_zip: holderZip || undefined,
      holder_email: holderEmail || undefined,
      additional_insured_language: additionalInsured || undefined,
      description: description || undefined,
      coverage_snapshot,
      requirements: sourceRequest
        ? {
            coverage_types: sourceRequest.coverage_types,
            required_gl_per_occurrence: sourceRequest.required_gl_per_occurrence,
            required_gl_aggregate: sourceRequest.required_gl_aggregate,
            required_auto_combined_single: sourceRequest.required_auto_combined_single,
            required_umbrella_each_occurrence: sourceRequest.required_umbrella_each_occurrence,
            required_umbrella_aggregate: sourceRequest.required_umbrella_aggregate,
            required_wc_el_each_accident: sourceRequest.required_wc_el_each_accident,
          }
        : undefined,
    };

    try {
      const res = await fetch("/api/coi/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Generation failed"); return; }
      setResult(data);

      // Record holder usage for intelligence (fire-and-forget)
      const enabledCoverageTypes: string[] = [];
      if (gl.enabled) enabledCoverageTypes.push("gl");
      if (auto.enabled) enabledCoverageTypes.push("auto");
      if (umbrella.enabled) enabledCoverageTypes.push("umbrella");
      if (wc.enabled) enabledCoverageTypes.push("wc");

      fetch("/api/coi/holders/record-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holderId: selectedHolderIdRef.current ?? undefined,
          holderName,
          holderAddress: holderAddress || undefined,
          holderCity: holderCity || undefined,
          holderState: holderState || undefined,
          holderZip: holderZip || undefined,
          insuredName,
          coverageTypes: enabledCoverageTypes,
        }),
      }).catch(() => null); // non-critical
    } catch {
      setError("Network error — please try again");
    } finally {
      setGenerating(false);
    }
  }, [insuredName, holderName, insuredAddress, producerName, producerAddress, producerPhone, producerEmail, holderAddress, holderCity, holderState, holderZip, holderEmail, additionalInsured, description, gl, auto, umbrella, wc, requestId, sourceRequest]);

  const handleSend = async () => {
    if (!result || !sendEmail) return;
    setSending(true);
    try {
      const res = await fetch(`/api/coi/${result.certificate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email: sendEmail }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => router.push("/certificates"), 2000);
      } else {
        const d = await res.json();
        setError(d.error ?? "Send failed");
      }
    } catch {
      setError("Send failed");
    } finally {
      setSending(false);
    }
  };

  if (loadingRequest) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d0d12]">
        <Loader2 size={20} className="animate-spin text-[#8a8b91]" />
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────
  if (result) {
    const check = result.coverage_check;
    const cert = result.certificate;
    return (
      <div className="flex flex-col h-full bg-[#0d0d12]">
        <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
          <Link href="/certificates" className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">
            <ArrowLeft size={13} /> Certificates
          </Link>
          <ChevronRight size={12} className="text-[#505057]" />
          <span className="text-[13px] text-[#f5f5f7]">COI Generated</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-10 py-10">

            {/* Status */}
            <div className={`flex items-start gap-4 rounded-xl p-5 border mb-6 ${
              check && !check.passed
                ? "bg-red-950/30 border-red-800/40"
                : "bg-[#00d4aa]/[0.06] border-[#00d4aa]/25"
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                check && !check.passed ? "bg-red-900/40" : "bg-[#00d4aa]/15"
              }`}>
                {check && !check.passed
                  ? <AlertTriangle size={20} className="text-red-400" />
                  : <CheckCircle size={20} className="text-[#00d4aa]" />}
              </div>
              <div>
                <div className="text-[16px] font-bold text-[#f5f5f7] mb-1">
                  {check && !check.passed ? "Coverage gaps detected" : "Coverage verified ✓"}
                </div>
                <div className="text-[13px] text-[#8a8b91]">
                  {check?.notes ?? "Certificate generated successfully."}
                </div>
                {check && check.gaps.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {check.gaps.map((g, i) => (
                      <li key={i} className="text-[12px] text-red-300">• {g}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Cert summary */}
            <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-mono text-[11px] text-[#505057]">{cert.certificate_number}</div>
                  <div className="text-[16px] font-bold text-[#f5f5f7] mt-0.5">{cert.insured_name}</div>
                </div>
                <a
                  href={`/api/coi/${cert.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-4 flex items-center gap-1.5 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
                >
                  <ExternalLink size={12} /> Preview PDF
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#1e1e2a]">
                <div>
                  <div className="text-[11px] text-[#505057] uppercase tracking-wider mb-0.5">Certificate Holder</div>
                  <div className="text-[13px] text-[#c5c5cb]">{cert.holder_name}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#505057] uppercase tracking-wider mb-0.5">Expires</div>
                  <div className="text-[13px] text-[#c5c5cb]">
                    {cert.expiration_date
                      ? new Date(cert.expiration_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Send */}
            {sent ? (
              <div className="flex items-center gap-2 text-[#00d4aa] text-[14px] font-medium">
                <CheckCircle size={16} /> Sent! Redirecting…
              </div>
            ) : (
              <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5">
                <div className="text-[13px] font-semibold text-[#f5f5f7] mb-3">Send to certificate holder</div>
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={sendEmail}
                    onChange={e => setSendEmail(e.target.value)}
                    placeholder="holder@company.com"
                    className="flex-1 bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 placeholder-[#505057]"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !sendEmail}
                    className="h-10 px-5 flex items-center gap-2 rounded-lg bg-[#00d4aa] text-[#0d0d12] text-[13px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sending ? "Sending…" : "Send COI"}
                  </button>
                </div>
                {check && !check.passed && (
                  <p className="mt-2 text-[11px] text-amber-400">
                    ⚠ Coverage gaps exist. You can still send — make sure the insured is aware.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-5">
              <Link href="/certificates" className="text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">
                ← Back to Certificates
              </Link>
              <Link href={`/certificates/${cert.id}`} className="text-[13px] text-[#00d4aa] hover:underline">
                View full detail →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Generate form ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#0d0d12]">
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link href="/certificates" className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">
          <ArrowLeft size={13} /> Certificates
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7]">
          {sourceRequest ? `Generate COI — ${sourceRequest.insured_name}` : "New Certificate of Insurance"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-8 space-y-6">

          {/* Source request banner */}
          {sourceRequest && (
            <div className="flex items-start gap-3 rounded-lg bg-[#111118] border border-[#1e1e2a] p-4">
              <div className="flex-1">
                <div className="text-[12px] font-semibold text-[#8a8b91] uppercase tracking-wider mb-1">Generating from request</div>
                <div className="text-[13px] text-[#c5c5cb]">
                  <strong className="text-[#f5f5f7]">{sourceRequest.requester_name}</strong> ({sourceRequest.requester_email}) requested a COI
                  for <strong className="text-[#f5f5f7]">{sourceRequest.insured_name}</strong> — holder is <strong className="text-[#f5f5f7]">{sourceRequest.holder_name}</strong>.
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 text-[13px] text-red-300">
              {error}
            </div>
          )}

          {/* Insured + Producer */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#f5f5f7] mb-4">Insured & Producer</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Insured Name" value={insuredName} onChange={setInsuredName} required placeholder="Acme Corp" />
              <Field label="Insured Address" value={insuredAddress} onChange={setInsuredAddress} placeholder="123 Main St, City, ST 00000" />
              <Field label="Producer / Agency Name" value={producerName} onChange={setProducerName} placeholder="Your agency name" />
              <Field label="Producer Address" value={producerAddress} onChange={setProducerAddress} placeholder="Agency address" />
              <Field label="Producer Phone" value={producerPhone} onChange={setProducerPhone} placeholder="(555) 000-0000" />
              <Field label="Producer Email" value={producerEmail} onChange={setProducerEmail} placeholder="agent@agency.com" />
            </div>
          </div>

          {/* Certificate holder */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#f5f5f7] mb-4">Certificate Holder</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider mb-1.5">
                  Holder Name<span className="text-[#00d4aa] ml-0.5">*</span>
                </label>
                <HolderAutofillInput
                  value={holderName}
                  onChange={setHolderName}
                  onHolderSelect={handleHolderSelect}
                  placeholder="ABC Contractors LLC"
                />
              </div>
              <Field label="Holder Email" value={holderEmail} onChange={setHolderEmail} placeholder="holder@company.com" />
              <Field label="Address" value={holderAddress} onChange={setHolderAddress} placeholder="123 Business Ave" />
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Field label="City" value={holderCity} onChange={setHolderCity} placeholder="City" />
                </div>
                <Field label="State" value={holderState} onChange={setHolderState} placeholder="ST" />
              </div>
              <Field label="ZIP" value={holderZip} onChange={setHolderZip} placeholder="00000" />
            </div>
            <div className="mt-4">
              <label className="block text-[11px] font-medium text-[#8a8b91] uppercase tracking-wider mb-1.5">
                Additional Insured Language
              </label>
              <textarea
                value={additionalInsured}
                onChange={e => setAdditionalInsured(e.target.value)}
                placeholder="e.g. ABC Contractors LLC is included as additional insured per the terms of written contract…"
                rows={2}
                className="w-full bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 placeholder-[#505057] resize-none"
              />
            </div>
          </div>

          {/* Coverage: GL */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <SectionHeader title="General Liability" enabled={gl.enabled} onToggle={v => setGl(p => ({ ...p, enabled: v }))} />
            {gl.enabled && (
              <div className="pt-4 space-y-3">
                <div className="flex gap-4 mb-2">
                  <Toggle label="Occurrence" checked={!gl.claims_made} onChange={() => setGl(p => ({ ...p, claims_made: false }))} />
                  <Toggle label="Claims-Made" checked={gl.claims_made} onChange={() => setGl(p => ({ ...p, claims_made: true }))} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <MoneyField label="Each Occurrence" value={fmtNum(gl.each_occurrence)} onChange={v => setGl(p => ({ ...p, each_occurrence: parseNum(v) }))} placeholder="1,000,000" />
                  <MoneyField label="General Aggregate" value={fmtNum(gl.general_aggregate)} onChange={v => setGl(p => ({ ...p, general_aggregate: parseNum(v) }))} placeholder="2,000,000" />
                  <MoneyField label="Products-Comp/Op Agg" value={fmtNum(gl.products_comp_ops_agg)} onChange={v => setGl(p => ({ ...p, products_comp_ops_agg: parseNum(v) }))} placeholder="2,000,000" />
                  <MoneyField label="Personal & Adv Inj" value={fmtNum(gl.personal_adv_injury)} onChange={v => setGl(p => ({ ...p, personal_adv_injury: parseNum(v) }))} placeholder="1,000,000" />
                  <MoneyField label="Med Exp" value={fmtNum(gl.med_exp)} onChange={v => setGl(p => ({ ...p, med_exp: parseNum(v) }))} placeholder="5,000" />
                  <MoneyField label="Damage to Rented Premises" value={fmtNum(gl.damage_to_rented_premises)} onChange={v => setGl(p => ({ ...p, damage_to_rented_premises: parseNum(v) }))} placeholder="100,000" />
                </div>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Policy Number</label>
                    <input type="text" value={gl.policy_number} onChange={e => setGl(p => ({ ...p, policy_number: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40 placeholder-[#3a3a42]" placeholder="GL-123456" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Effective</label>
                    <input type="date" value={gl.effective} onChange={e => setGl(p => ({ ...p, effective: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Expiration</label>
                    <input type="date" value={gl.expiration} onChange={e => setGl(p => ({ ...p, expiration: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Insurer Name</label>
                    <input type="text" value={gl.insurer} onChange={e => setGl(p => ({ ...p, insurer: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="Hartford Fire Insurance Co" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coverage: Auto */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <SectionHeader title="Automobile Liability" enabled={auto.enabled} onToggle={v => setAuto(p => ({ ...p, enabled: v }))} />
            {auto.enabled && (
              <div className="pt-4 space-y-3">
                <div className="flex gap-4 flex-wrap mb-2">
                  <Toggle label="Any Auto" checked={auto.any_auto} onChange={v => setAuto(p => ({ ...p, any_auto: v }))} />
                  <Toggle label="Owned Autos Only" checked={auto.owned_autos_only} onChange={v => setAuto(p => ({ ...p, owned_autos_only: v }))} />
                  <Toggle label="Hired Autos Only" checked={auto.hired_autos_only} onChange={v => setAuto(p => ({ ...p, hired_autos_only: v }))} />
                  <Toggle label="Non-Owned Autos Only" checked={auto.non_owned_autos_only} onChange={v => setAuto(p => ({ ...p, non_owned_autos_only: v }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MoneyField label="Combined Single Limit" value={fmtNum(auto.combined_single_limit)} onChange={v => setAuto(p => ({ ...p, combined_single_limit: parseNum(v) }))} placeholder="1,000,000" />
                  <MoneyField label="Bodily Injury Per Person" value={fmtNum(auto.bodily_injury_per_person)} onChange={v => setAuto(p => ({ ...p, bodily_injury_per_person: parseNum(v) }))} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Policy Number</label>
                    <input type="text" value={auto.policy_number} onChange={e => setAuto(p => ({ ...p, policy_number: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="AU-123456" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Effective</label>
                    <input type="date" value={auto.effective} onChange={e => setAuto(p => ({ ...p, effective: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Expiration</label>
                    <input type="date" value={auto.expiration} onChange={e => setAuto(p => ({ ...p, expiration: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Insurer Name</label>
                    <input type="text" value={auto.insurer} onChange={e => setAuto(p => ({ ...p, insurer: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="State Auto Insurance Co" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coverage: Umbrella */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <SectionHeader title="Umbrella / Excess Liability" enabled={umbrella.enabled} onToggle={v => setUmbrella(p => ({ ...p, enabled: v }))} />
            {umbrella.enabled && (
              <div className="pt-4 space-y-3">
                <div className="flex gap-4 mb-2">
                  <Toggle label="Umbrella" checked={umbrella.is_umbrella} onChange={() => setUmbrella(p => ({ ...p, is_umbrella: true }))} />
                  <Toggle label="Excess" checked={!umbrella.is_umbrella} onChange={() => setUmbrella(p => ({ ...p, is_umbrella: false }))} />
                  <Toggle label="Claims-Made" checked={umbrella.claims_made} onChange={v => setUmbrella(p => ({ ...p, claims_made: v }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MoneyField label="Each Occurrence" value={fmtNum(umbrella.each_occurrence)} onChange={v => setUmbrella(p => ({ ...p, each_occurrence: parseNum(v) }))} placeholder="5,000,000" />
                  <MoneyField label="Aggregate" value={fmtNum(umbrella.aggregate)} onChange={v => setUmbrella(p => ({ ...p, aggregate: parseNum(v) }))} placeholder="5,000,000" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Policy Number</label>
                    <input type="text" value={umbrella.policy_number} onChange={e => setUmbrella(p => ({ ...p, policy_number: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="UMB-123456" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Effective</label>
                    <input type="date" value={umbrella.effective} onChange={e => setUmbrella(p => ({ ...p, effective: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Expiration</label>
                    <input type="date" value={umbrella.expiration} onChange={e => setUmbrella(p => ({ ...p, expiration: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Insurer Name</label>
                    <input type="text" value={umbrella.insurer} onChange={e => setUmbrella(p => ({ ...p, insurer: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="Chubb Insurance Co" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coverage: WC */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <SectionHeader title="Workers Compensation & Employers Liability" enabled={wc.enabled} onToggle={v => setWc(p => ({ ...p, enabled: v }))} />
            {wc.enabled && (
              <div className="pt-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <MoneyField label="E.L. Each Accident" value={fmtNum(wc.el_each_accident)} onChange={v => setWc(p => ({ ...p, el_each_accident: parseNum(v) }))} placeholder="1,000,000" />
                  <MoneyField label="E.L. Disease - Policy Limit" value={fmtNum(wc.el_disease_policy_limit)} onChange={v => setWc(p => ({ ...p, el_disease_policy_limit: parseNum(v) }))} placeholder="1,000,000" />
                  <MoneyField label="E.L. Disease - Each Employee" value={fmtNum(wc.el_disease_each_employee)} onChange={v => setWc(p => ({ ...p, el_disease_each_employee: parseNum(v) }))} placeholder="1,000,000" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Policy Number</label>
                    <input type="text" value={wc.policy_number} onChange={e => setWc(p => ({ ...p, policy_number: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="WC-123456" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Effective</label>
                    <input type="date" value={wc.effective} onChange={e => setWc(p => ({ ...p, effective: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Expiration</label>
                    <input type="date" value={wc.expiration} onChange={e => setWc(p => ({ ...p, expiration: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-medium text-[#505057] uppercase tracking-wider mb-1">Insurer Name</label>
                    <input type="text" value={wc.insurer} onChange={e => setWc(p => ({ ...p, insurer: e.target.value }))} className="w-full bg-[#111118] border border-[#2e2e3a] rounded px-3 py-1.5 text-[12px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/40" placeholder="Travelers Casualty Insurance" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description + submit */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#f5f5f7] mb-4">Description of Operations</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the project, location, or any special conditions…"
              className="w-full bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2.5 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 placeholder-[#505057] resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pb-10">
            <button
              onClick={handleGenerate}
              disabled={generating || !insuredName.trim() || !holderName.trim()}
              className="h-10 px-6 flex items-center gap-2 rounded-lg bg-[#00d4aa] text-[#0d0d12] text-[14px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(0,212,170,0.3)]"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              {generating ? "Checking coverage…" : "Generate COI"}
            </button>
            <Link href="/certificates" className="text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors">
              Cancel
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
