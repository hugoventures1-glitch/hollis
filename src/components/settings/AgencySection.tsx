"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AgentProfile } from "@/types/settings";
import { SettingsField, SettingsInput } from "./SettingsField";
import { SaveButton } from "./SaveButton";

const schema = z.object({
  agency_name: z.string().optional(),
  agency_address: z.string().optional(),
  agency_phone: z.string().optional(),
  agency_website: z.string().optional(),
  agency_abn: z.string().optional(),
  agency_afsl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  profile: Partial<AgentProfile>;
}

export function AgencySection({ profile }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      agency_name: profile.agency_name ?? "",
      agency_address: profile.agency_address ?? "",
      agency_phone: profile.agency_phone ?? "",
      agency_website: profile.agency_website ?? "",
      agency_abn: profile.agency_abn ?? "",
      agency_afsl: profile.agency_afsl ?? "",
    },
  });

  const onSave = handleSubmit(async (values) => {
    setSaving(true);
    await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Agency</h2>
        <p className="text-[13px] text-zinc-500 mt-1">Your agency details as they appear on COIs and client emails.</p>
      </div>

      <SettingsField label="Agency name" error={errors.agency_name?.message}>
        <SettingsInput {...register("agency_name")} placeholder="Pinnacle Insurance Pty Ltd" error={!!errors.agency_name} />
      </SettingsField>

      <SettingsField label="Street address" error={errors.agency_address?.message}>
        <SettingsInput {...register("agency_address")} placeholder="Level 5, 123 Collins St, Melbourne VIC 3000" error={!!errors.agency_address} />
      </SettingsField>

      <SettingsField label="Phone" error={errors.agency_phone?.message}>
        <SettingsInput {...register("agency_phone")} placeholder="+61 3 XXXX XXXX" error={!!errors.agency_phone} />
      </SettingsField>

      <SettingsField label="Website" error={errors.agency_website?.message}>
        <SettingsInput {...register("agency_website")} placeholder="https://pinnacleinsurance.com.au" error={!!errors.agency_website} />
      </SettingsField>

      <div className="grid grid-cols-2 gap-4">
        <SettingsField label="ABN" hint="XX XXX XXX XXX" error={errors.agency_abn?.message}>
          <SettingsInput {...register("agency_abn")} placeholder="12 345 678 901" error={!!errors.agency_abn} />
        </SettingsField>
        <SettingsField label="AFSL Number" hint="Australian Financial Services Licence" error={errors.agency_afsl?.message}>
          <SettingsInput {...register("agency_afsl")} placeholder="000000" error={!!errors.agency_afsl} />
          <p className="text-[11px] text-amber-500/80 mt-1">Required for formal documents including submissions and recommendation packs.</p>
        </SettingsField>
      </div>

      <p className="text-[12px] text-zinc-500 leading-relaxed">
        This information appears on COIs and automated emails sent to your clients.
      </p>

      <div className="pt-2">
        <SaveButton saving={saving} saved={saved} onClick={onSave} />
      </div>
    </div>
  );
}
