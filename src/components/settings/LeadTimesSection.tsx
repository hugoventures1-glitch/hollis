"use client";

import { useState, useEffect } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { SaveButton } from "./SaveButton";
import type { LeadTimeConfig } from "@/types/renewals";

const STANDARD_POLICY_TYPES = [
  "Business Interruption",
  "Commercial Property",
  "Commercial Motor",
  "Public Liability",
  "Professional Indemnity",
  "Home & Contents",
  "Landlord",
  "Workers Compensation",
  "Management Liability",
  "Cyber",
  "Marine Cargo",
  "Trade Credit",
];

type ConfigDraft = {
  offset_email_1: number;
  offset_email_2: number;
  offset_sms: number;
  offset_call: number;
};

type SaveState = { saving: boolean; saved: boolean };

function OffsetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 1)}
          className="w-16 bg-[#111] border border-[#2a2a2a] rounded-md px-2 py-1.5 text-[13px] text-[#f5f5f7] text-center focus:outline-none focus:border-zinc-500"
        />
        <span className="text-[12px] text-zinc-600">days</span>
      </div>
    </div>
  );
}

export function LeadTimesSection() {
  const [configs, setConfigs] = useState<LeadTimeConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ConfigDraft>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [loading, setLoading] = useState(true);
  const [addType, setAddType] = useState("");
  const [customType, setCustomType] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    fetch("/api/settings/lead-times")
      .then((r) => r.json())
      .then((data: LeadTimeConfig[]) => {
        setConfigs(data);
        const initialDrafts: Record<string, ConfigDraft> = {};
        for (const c of data) {
          initialDrafts[c.policy_type] = {
            offset_email_1: c.offset_email_1,
            offset_email_2: c.offset_email_2,
            offset_sms: c.offset_sms,
            offset_call: c.offset_call,
          };
        }
        setDrafts(initialDrafts);
      })
      .finally(() => setLoading(false));
  }, []);

  function updateDraft(policyType: string, field: keyof ConfigDraft, value: number) {
    setDrafts((prev) => ({
      ...prev,
      [policyType]: { ...prev[policyType], [field]: value },
    }));
  }

  async function handleSave(policyType: string) {
    const draft = drafts[policyType];
    if (!draft) return;

    setSaveStates((prev) => ({ ...prev, [policyType]: { saving: true, saved: false } }));

    const res = await fetch("/api/settings/lead-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy_type: policyType, ...draft }),
    });

    if (res.ok) {
      const updated: LeadTimeConfig = await res.json();
      setConfigs((prev) => prev.map((c) => (c.policy_type === policyType ? updated : c)));
      setSaveStates((prev) => ({ ...prev, [policyType]: { saving: false, saved: true } }));
      setTimeout(
        () => setSaveStates((prev) => ({ ...prev, [policyType]: { saving: false, saved: false } })),
        2000
      );
    } else {
      setSaveStates((prev) => ({ ...prev, [policyType]: { saving: false, saved: false } }));
    }
  }

  async function handleDelete(policyType: string) {
    await fetch(`/api/settings/lead-times/${encodeURIComponent(policyType)}`, { method: "DELETE" });
    setConfigs((prev) => prev.filter((c) => c.policy_type !== policyType));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[policyType];
      return next;
    });
  }

  async function handleAdd() {
    const rawType = addType === "__custom__" ? customType.trim() : addType;
    if (!rawType) {
      setAddError("Select or enter a policy type.");
      return;
    }
    const normalised = rawType.toLowerCase();
    if (configs.some((c) => c.policy_type === normalised)) {
      setAddError("A config for this policy type already exists.");
      return;
    }
    setAdding(true);
    setAddError("");

    const res = await fetch("/api/settings/lead-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy_type: rawType,
        offset_email_1: 90,
        offset_email_2: 60,
        offset_sms: 30,
        offset_call: 14,
      }),
    });

    if (res.ok) {
      const created: LeadTimeConfig = await res.json();
      setConfigs((prev) => [...prev, created].sort((a, b) => a.policy_type.localeCompare(b.policy_type)));
      setDrafts((prev) => ({
        ...prev,
        [created.policy_type]: {
          offset_email_1: created.offset_email_1,
          offset_email_2: created.offset_email_2,
          offset_sms: created.offset_sms,
          offset_call: created.offset_call,
        },
      }));
      setAddType("");
      setCustomType("");
    } else {
      const body = await res.json().catch(() => ({}));
      setAddError(body.error ?? "Failed to add policy type.");
    }
    setAdding(false);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Renewal Timing</h2>
        <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed">
          Configure how far in advance Hollis starts outreach for each line of business. Different policy
          types need different lead times — BI renewals typically start 90 days out while home insurance
          may only need 30 days.
        </p>
      </div>

      {/* Global defaults — always shown as reference */}
      <div className="rounded-md border border-[#1e1e1e] bg-[#111] px-4 py-3">
        <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
          Global defaults (used when no policy type is set)
        </p>
        <p className="text-[13px] text-zinc-400">
          First email <span className="text-zinc-300">90 days</span> ·{" "}
          Second email <span className="text-zinc-300">60 days</span> ·{" "}
          SMS <span className="text-zinc-300">30 days</span> ·{" "}
          Call script <span className="text-zinc-300">14 days</span>
        </p>
      </div>

      {/* Config cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-600 text-[13px]">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : configs.length === 0 ? (
        <p className="text-[13px] text-zinc-600">
          No custom timings set. All policies use the global defaults above.
        </p>
      ) : (
        <div className="space-y-4">
          {configs.map((cfg) => {
            const draft = drafts[cfg.policy_type] ?? {
              offset_email_1: cfg.offset_email_1,
              offset_email_2: cfg.offset_email_2,
              offset_sms: cfg.offset_sms,
              offset_call: cfg.offset_call,
            };
            const ss = saveStates[cfg.policy_type] ?? { saving: false, saved: false };
            return (
              <div
                key={cfg.policy_type}
                className="rounded-md border border-[#1e1e1e] bg-[#111] px-4 py-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-[#f5f5f7] capitalize">
                    {cfg.policy_type}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDelete(cfg.policy_type)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <OffsetInput
                    label="First email"
                    value={draft.offset_email_1}
                    onChange={(v) => updateDraft(cfg.policy_type, "offset_email_1", v)}
                  />
                  <OffsetInput
                    label="Second email"
                    value={draft.offset_email_2}
                    onChange={(v) => updateDraft(cfg.policy_type, "offset_email_2", v)}
                  />
                  <OffsetInput
                    label="SMS"
                    value={draft.offset_sms}
                    onChange={(v) => updateDraft(cfg.policy_type, "offset_sms", v)}
                  />
                  <OffsetInput
                    label="Call script"
                    value={draft.offset_call}
                    onChange={(v) => updateDraft(cfg.policy_type, "offset_call", v)}
                  />
                </div>

                <SaveButton
                  saving={ss.saving}
                  saved={ss.saved}
                  onClick={() => handleSave(cfg.policy_type)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Add new policy type */}
      <div className="space-y-3 pt-2">
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider">
          Add policy type
        </p>
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-2 flex-1">
            <select
              value={addType}
              onChange={(e) => { setAddType(e.target.value); setAddError(""); }}
              className="bg-[#111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[13px] text-[#f5f5f7] focus:outline-none focus:border-zinc-500"
            >
              <option value="">Select a policy type…</option>
              {STANDARD_POLICY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
            {addType === "__custom__" && (
              <input
                type="text"
                placeholder="e.g. Farm & Rural"
                value={customType}
                onChange={(e) => { setCustomType(e.target.value); setAddError(""); }}
                className="bg-[#111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[13px] text-[#f5f5f7] placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            )}
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#1e1e1e] hover:bg-[#252525] text-zinc-300 text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add
          </button>
        </div>
        {addError && <p className="text-[12px] text-red-400">{addError}</p>}
        <p className="text-[12px] text-zinc-600">
          New configs default to 90 / 60 / 30 / 14 days — adjust and save after adding.
        </p>
      </div>
    </div>
  );
}
