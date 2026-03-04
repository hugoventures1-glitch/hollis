"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AgentProfile } from "@/types/settings";
import { Toggle } from "./Toggle";
import { SaveButton } from "./SaveButton";

const schema = z.object({
  notify_renewal_fired: z.boolean(),
  notify_doc_chase_fired: z.boolean(),
  notify_coi_requested: z.boolean(),
  notify_policy_gap_detected: z.boolean(),
  notify_daily_summary: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  profile: Partial<AgentProfile>;
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[#f5f5f7]">{label}</p>
        <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function NotificationsSection({ profile }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { handleSubmit, setValue, control } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      notify_renewal_fired: profile.notify_renewal_fired ?? true,
      notify_doc_chase_fired: profile.notify_doc_chase_fired ?? true,
      notify_coi_requested: profile.notify_coi_requested ?? true,
      notify_policy_gap_detected: profile.notify_policy_gap_detected ?? true,
      notify_daily_summary: profile.notify_daily_summary ?? false,
    },
  });

  const values = useWatch({ control });

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Notifications</h2>
        <p className="text-[13px] text-zinc-500 mt-1">Choose which events Hollis notifies you about.</p>
      </div>

      {/* Automation alerts */}
      <div>
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-1">Automation Alerts</p>
        <div className="divide-y divide-[#1e1e2a]">
          <ToggleRow
            label="Renewal email fired"
            description="When Hollis sends a renewal reminder to a client"
            checked={values.notify_renewal_fired ?? true}
            onChange={(v) => setValue("notify_renewal_fired", v)}
          />
          <ToggleRow
            label="Document chase fired"
            description="When Hollis sends a document follow-up"
            checked={values.notify_doc_chase_fired ?? true}
            onChange={(v) => setValue("notify_doc_chase_fired", v)}
          />
          <ToggleRow
            label="COI requested"
            description="When a new COI request comes through the portal"
            checked={values.notify_coi_requested ?? true}
            onChange={(v) => setValue("notify_coi_requested", v)}
          />
          <ToggleRow
            label="Policy gap detected"
            description="When AI detects a coverage issue in an uploaded policy"
            checked={values.notify_policy_gap_detected ?? true}
            onChange={(v) => setValue("notify_policy_gap_detected", v)}
          />
        </div>
      </div>

      {/* Summary reports */}
      <div>
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider mb-1">Summary Reports</p>
        <div className="divide-y divide-[#1e1e2a]">
          <ToggleRow
            label="Daily digest"
            description="A morning email summarising what's due and what fired overnight"
            checked={values.notify_daily_summary ?? false}
            onChange={(v) => setValue("notify_daily_summary", v)}
          />
        </div>
      </div>

      <div className="pt-2">
        <SaveButton saving={saving} saved={saved} onClick={onSave} />
      </div>
    </div>
  );
}
