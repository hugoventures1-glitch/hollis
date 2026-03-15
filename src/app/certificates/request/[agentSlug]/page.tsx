"use client";

import { useState, useEffect, useRef } from "react";
import { use } from "react";
import { CheckCircle, Zap, Loader2 } from "lucide-react";
import type { CoverageType } from "@/types/coi";
import { COVERAGE_TYPE_LABELS } from "@/types/coi";
import { HolderAutofillInput } from "@/components/coi/HolderAutofillInput";

const COVERAGE_OPTIONS: { value: CoverageType; label: string; desc: string }[] = [
  { value: "gl",       label: "General Liability",        desc: "Bodily injury and property damage" },
  { value: "auto",     label: "Automobile Liability",      desc: "Company-owned or hired vehicles" },
  { value: "umbrella", label: "Umbrella / Excess Liability", desc: "Above primary coverage limits" },
  { value: "wc",       label: "Workers Compensation",      desc: "Employee work-related injuries" },
];

function Field({
  label, value, onChange, placeholder, required, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[#8a8b91] mb-1.5">
        {label}{required && <span className="text-[#FAFAFA] ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-[#111111] border border-[#1C1C1C] rounded-lg px-3.5 py-2.5 text-[14px] text-[#FAFAFA] outline-none focus:border-[#555555] placeholder-[#6b6b6b] transition-colors"
      />
    </div>
  );
}

function MoneyInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[#6b6b6b] mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b6b] text-[13px]">$</span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? ""}
          className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 pl-7 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] placeholder-[#6b6b6b] transition-colors"
        />
      </div>
    </div>
  );
}

export default function COIPortalPage({ params }: { params: Promise<{ agentSlug: string }> }) {
  const { agentSlug } = use(params);

  const [agencyName, setAgencyName] = useState("");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loadingAgent, setLoadingAgent] = useState(true);
  const [agentNotFound, setAgentNotFound] = useState(false);
  const selectedHolderIdRef = useRef<string | null>(null);

  // Form fields
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [insuredName, setInsuredName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [holderAddress, setHolderAddress] = useState("");
  const [holderCity, setHolderCity] = useState("");
  const [holderState, setHolderState] = useState("");
  const [holderZip, setHolderZip] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<CoverageType[]>([]);
  const [reqGlOcc, setReqGlOcc] = useState("");
  const [reqGlAgg, setReqGlAgg] = useState("");
  const [reqAutoCsl, setReqAutoCsl] = useState("");
  const [reqUmbOcc, setReqUmbOcc] = useState("");
  const [additionalInsured, setAdditionalInsured] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/coi/agent-info?id=${agentSlug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setAgentNotFound(true); return; }
        setAgencyName(data.agency_name);
        setAgentId(data.agent_id ?? agentSlug);
      })
      .catch(() => setAgentNotFound(true))
      .finally(() => setLoadingAgent(false));
  }, [agentSlug]);

  const toggleType = (type: CoverageType) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requesterName || !requesterEmail || !insuredName || !holderName) return;

    setSubmitting(true);
    setError(null);

    const body = {
      agent_id: agentSlug,
      requester_name: requesterName,
      requester_email: requesterEmail,
      insured_name: insuredName,
      holder_name: holderName,
      holder_address: holderAddress || null,
      holder_city: holderCity || null,
      holder_state: holderState || null,
      holder_zip: holderZip || null,
      coverage_types: selectedTypes,
      required_gl_per_occurrence: reqGlOcc ? parseFloat(reqGlOcc.replace(/[^0-9.]/g, "")) : null,
      required_gl_aggregate: reqGlAgg ? parseFloat(reqGlAgg.replace(/[^0-9.]/g, "")) : null,
      required_auto_combined_single: reqAutoCsl ? parseFloat(reqAutoCsl.replace(/[^0-9.]/g, "")) : null,
      required_umbrella_each_occurrence: reqUmbOcc ? parseFloat(reqUmbOcc.replace(/[^0-9.]/g, "")) : null,
      additional_insured_language: additionalInsured || null,
      project_description: projectDescription || null,
    };

    try {
      const res = await fetch("/api/coi/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Submission failed"); return; }
      setSubmitted(true);

      // Record holder usage for intelligence (fire-and-forget)
      if (agentId) {
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
            coverageTypes: selectedTypes,
            agentId,
          }),
        }).catch(() => null);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingAgent) {
    return (
      <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[#8a8b91]" />
      </div>
    );
  }

  if (agentNotFound) {
    return (
      <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center text-center px-4">
        <div>
          <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl">✕</span>
          </div>
          <div className="text-[18px] font-bold text-[#FAFAFA] mb-2">Portal not found</div>
          <div className="text-[14px] text-[#8a8b91]">This certificate request link is invalid or has expired.</div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C] flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={30} className="text-[#FAFAFA]" />
          </div>
          <h1 className="text-[24px] font-bold text-[#FAFAFA] mb-3">Request submitted!</h1>
          <p className="text-[15px] text-[#8a8b91] mb-2">
            Your COI request has been sent to <strong className="text-[#FAFAFA]">{agencyName}</strong>.
          </p>
          <p className="text-[14px] text-[#6b6b6b]">
            You&apos;ll receive a copy at <strong className="text-[#8a8b91]">{requesterEmail}</strong> once
            the certificate is approved and issued — typically within 1 business day.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0C0C0C] py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded bg-[#FAFAFA] flex items-center justify-center ">
              <Zap size={16} className="text-black fill-current" />
            </div>
            <span className="text-[18px] font-bold text-[#FAFAFA]">{agencyName}</span>
          </div>
          <h1 className="text-[26px] font-bold text-[#FAFAFA] mb-2">
            Request a Certificate of Insurance
          </h1>
          <p className="text-[15px] text-[#8a8b91]">
            Fill out the form below and we&apos;ll process your COI request within 1 business day.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Requester */}
          <div className="rounded-xl bg-[#111111] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#FAFAFA] mb-4">Your Information</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Your Name" value={requesterName} onChange={setRequesterName} required placeholder="Jane Smith" />
              <Field label="Your Email" value={requesterEmail} onChange={setRequesterEmail} required placeholder="jane@company.com" type="email" />
            </div>
          </div>

          {/* Insured */}
          <div className="rounded-xl bg-[#111111] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#FAFAFA] mb-1">Insured Party</div>
            <p className="text-[12px] text-[#8a8b91] mb-4">The name of the business or individual who holds the policy.</p>
            <Field label="Insured Name" value={insuredName} onChange={setInsuredName} required placeholder="Acme Construction LLC" />
          </div>

          {/* Certificate holder */}
          <div className="rounded-xl bg-[#111111] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#FAFAFA] mb-1">Certificate Holder</div>
            <p className="text-[12px] text-[#8a8b91] mb-4">
              The party that needs to be listed on the certificate (e.g., property owner, general contractor).
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#8a8b91] mb-1.5">
                  Holder Name<span className="text-[#FAFAFA] ml-0.5">*</span>
                </label>
                <HolderAutofillInput
                  value={holderName}
                  onChange={setHolderName}
                  onHolderSelect={(h) => {
                    selectedHolderIdRef.current = h.id;
                    if (h.address !== undefined) setHolderAddress(h.address);
                    if (h.city !== undefined) setHolderCity(h.city);
                    if (h.state !== undefined) setHolderState(h.state);
                    if (h.zip !== undefined) setHolderZip(h.zip);
                    // Pre-select coverage types based on holder history
                    const suggested = h.commonCoverageTypes as CoverageType[];
                    if (suggested.length > 0) {
                      setSelectedTypes(prev => {
                        const merged = [...prev];
                        for (const ct of suggested) {
                          if (!merged.includes(ct)) merged.push(ct);
                        }
                        return merged;
                      });
                    }
                  }}
                  agentId={agentId ?? undefined}
                  placeholder="ABC Property Management"
                />
              </div>
              <Field label="Address" value={holderAddress} onChange={setHolderAddress} placeholder="123 Main St" />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="City" value={holderCity} onChange={setHolderCity} placeholder="New York" />
                </div>
                <Field label="State" value={holderState} onChange={setHolderState} placeholder="NY" />
              </div>
              <Field label="ZIP Code" value={holderZip} onChange={setHolderZip} placeholder="10001" />
            </div>
          </div>

          {/* Coverage required */}
          <div className="rounded-xl bg-[#111111] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#FAFAFA] mb-1">Coverage Required</div>
            <p className="text-[12px] text-[#8a8b91] mb-4">Select the types of coverage you need listed.</p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {COVERAGE_OPTIONS.map(opt => {
                const selected = selectedTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleType(opt.value)}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? "border-[#555555] bg-[#FAFAFA]/[0.06]"
                        : "border-[#1C1C1C] bg-[#0C0C0C] hover:border-[#3e3e4a]"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${selected ? "bg-[#FAFAFA] border-[#FAFAFA]" : "border-[#333333]"}`}>
                      {selected && <CheckCircle size={10} className="text-black" />}
                    </div>
                    <div>
                      <div className={`text-[12px] font-semibold ${selected ? "text-[#FAFAFA]" : "text-[#FAFAFA]"}`}>{opt.label}</div>
                      <div className="text-[11px] text-[#6b6b6b] mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Coverage limits */}
            {(selectedTypes.includes("gl") || selectedTypes.includes("auto") || selectedTypes.includes("umbrella")) && (
              <div>
                <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-wider mb-3">Minimum Required Limits (optional)</div>
                <div className="grid grid-cols-2 gap-3">
                  {selectedTypes.includes("gl") && (
                    <>
                      <MoneyInput label="GL Per Occurrence" value={reqGlOcc} onChange={setReqGlOcc} placeholder="1,000,000" />
                      <MoneyInput label="GL General Aggregate" value={reqGlAgg} onChange={setReqGlAgg} placeholder="2,000,000" />
                    </>
                  )}
                  {selectedTypes.includes("auto") && (
                    <MoneyInput label="Auto Combined Single Limit" value={reqAutoCsl} onChange={setReqAutoCsl} placeholder="1,000,000" />
                  )}
                  {selectedTypes.includes("umbrella") && (
                    <MoneyInput label="Umbrella Each Occurrence" value={reqUmbOcc} onChange={setReqUmbOcc} placeholder="5,000,000" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Additional info */}
          <div className="rounded-xl bg-[#111111] border border-[#1e1e2a] p-6">
            <div className="text-[13px] font-semibold text-[#FAFAFA] mb-4">Additional Details</div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#8a8b91] mb-1.5">
                  Additional Insured Language <span className="text-[#6b6b6b] font-normal">(if required)</span>
                </label>
                <textarea
                  value={additionalInsured}
                  onChange={e => setAdditionalInsured(e.target.value)}
                  rows={2}
                  placeholder="e.g. ABC Property Management is included as additional insured per written contract…"
                  className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3.5 py-2.5 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] placeholder-[#6b6b6b] resize-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#8a8b91] mb-1.5">
                  Project Description <span className="text-[#6b6b6b] font-normal">(optional)</span>
                </label>
                <textarea
                  value={projectDescription}
                  onChange={e => setProjectDescription(e.target.value)}
                  rows={2}
                  placeholder="Brief description of the project or reason for the COI request…"
                  className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3.5 py-2.5 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] placeholder-[#6b6b6b] resize-none"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 text-[13px] text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !requesterName || !requesterEmail || !insuredName || !holderName}
            className="w-full h-12 rounded-xl bg-[#FAFAFA] text-[#0C0C0C] text-[15px] font-bold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 "
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? "Submitting…" : "Submit COI Request"}
          </button>

          <p className="text-center text-[11px] text-[#6b6b6b]">
            Your request will be reviewed by {agencyName}. You&apos;ll receive the certificate at your email once approved.
          </p>
        </form>
      </div>
    </div>
  );
}
