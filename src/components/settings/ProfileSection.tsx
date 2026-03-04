"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AgentProfile } from "@/types/settings";
import { SettingsField, SettingsInput } from "./SettingsField";
import { SaveButton } from "./SaveButton";

const schema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  profile: Partial<AgentProfile>;
  userEmail: string;
}

export function ProfileSection({ profile, userEmail }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      title: profile.title ?? "",
      phone: profile.phone ?? "",
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
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Profile</h2>
        <p className="text-[13px] text-zinc-500 mt-1">Your personal information as it appears in Hollis.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SettingsField label="First name" error={errors.first_name?.message}>
          <SettingsInput {...register("first_name")} placeholder="Sarah" error={!!errors.first_name} />
        </SettingsField>
        <SettingsField label="Last name" error={errors.last_name?.message}>
          <SettingsInput {...register("last_name")} placeholder="Chen" error={!!errors.last_name} />
        </SettingsField>
      </div>

      <SettingsField label="Job title" error={errors.title?.message} hint='E.g. "Senior Insurance Broker"'>
        <SettingsInput {...register("title")} placeholder="Insurance Broker" error={!!errors.title} />
      </SettingsField>

      <SettingsField label="Phone" error={errors.phone?.message}>
        <SettingsInput {...register("phone")} placeholder="+61 4XX XXX XXX" error={!!errors.phone} />
      </SettingsField>

      <SettingsField label="Email">
        <SettingsInput value={userEmail} readOnly className="opacity-50 cursor-not-allowed" />
        <p className="text-[12px] text-zinc-500 mt-1">To change your email, contact support.</p>
      </SettingsField>

      <div className="pt-2">
        <SaveButton saving={saving} saved={saved} onClick={onSave} />
      </div>
    </div>
  );
}
