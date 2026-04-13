"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useToast } from "@/components/actions/MicroToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AgentProfile } from "@/types/settings";
import { SettingsField, SettingsInput, SettingsTextarea } from "./SettingsField";
import { Toggle } from "./Toggle";
import { SaveButton } from "./SaveButton";

const schema = z.object({
  email_from_name: z.string().optional(),
  reply_to_email: z.string().email("Invalid email address").or(z.literal("")).optional(),
  cc_self_on_client_emails: z.boolean(),
  email_signature: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  profile: Partial<AgentProfile>;
}

export function EmailSection({ profile }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  const signalAddress = profile.signal_token
    ? `${profile.signal_token}@ildaexi.resend.app`
    : null;

  const handleCopySignal = async () => {
    if (!signalAddress) return;
    await navigator.clipboard.writeText(signalAddress);
    toast("Signal address copied");
  };

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email_from_name: profile.email_from_name ?? "",
      reply_to_email: profile.reply_to_email ?? "",
      cc_self_on_client_emails: profile.cc_self_on_client_emails ?? false,
      email_signature: profile.email_signature ?? "",
    },
  });

  const signature = useWatch({ control, name: "email_signature" });
  const senderName = useWatch({ control, name: "email_from_name" });
  const cc = useWatch({ control, name: "cc_self_on_client_emails" });

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
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Email &amp; Signatures</h2>
        <p className="text-[13px] text-zinc-500 mt-1">Control how your emails appear to clients.</p>
      </div>

      <SettingsField
        label="Sender Display Name"
        hint={
          senderName
            ? `Your clients will see: ${senderName} <hugo@hollisai.com.au>`
            : "The display name clients see on emails. E.g. 'Smith Insurance'"
        }
        error={errors.email_from_name?.message}
      >
        <SettingsInput
          {...register("email_from_name")}
          placeholder="Smith Insurance"
          error={!!errors.email_from_name}
        />
      </SettingsField>

      <SettingsField
        label="Reply-to email"
        hint="Replies from clients go here. Defaults to your login email if blank."
        error={errors.reply_to_email?.message}
      >
        <SettingsInput
          {...register("reply_to_email")}
          type="email"
          placeholder="sarah@pinnacleinsurance.com.au"
          error={!!errors.reply_to_email}
        />
      </SettingsField>

      {signalAddress && (
        <SettingsField
          label="Inbound signal address"
          hint="CC this address on emails you send to clients. When they reply-all, Hollis reads the response automatically."
        >
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-md bg-[#111118] border border-[#2a2a36] text-[13px] text-zinc-300 font-mono select-all truncate">
              {signalAddress}
            </code>
            <button
              type="button"
              onClick={handleCopySignal}
              className="shrink-0 px-3 py-2 rounded-md bg-[#1e1e2a] border border-[#2a2a36] text-[12px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
            >
              Copy
            </button>
          </div>
        </SettingsField>
      )}

      <div className="flex items-center justify-between py-3 border-y border-[#1e1e2a]">
        <div>
          <p className="text-[14px] font-medium text-[#f5f5f7]">CC me on all client emails</p>
          <p className="text-[12px] text-zinc-500 mt-0.5">Receive a copy of every automated email sent to your clients.</p>
        </div>
        <Toggle checked={cc} onChange={(v) => setValue("cc_self_on_client_emails", v)} />
      </div>

      <SettingsField
        label="Email signature"
        hint="Appended to the bottom of all automated renewal and document chase emails. Plain text only."
        error={errors.email_signature?.message}
      >
        <SettingsTextarea
          {...register("email_signature")}
          rows={5}
          placeholder={"Sarah Chen\nSenior Insurance Broker\nPinnacle Insurance Pty Ltd\nAFSL 000000 | ABN 12 345 678 901\nPhone: +61 4XX XXX XXX"}
          error={!!errors.email_signature}
        />
      </SettingsField>

      {/* Live signature preview */}
      <div className="rounded-lg border border-[#2a2a36] overflow-hidden">
        <div className="px-4 py-2 border-b border-[#2a2a36] bg-[#111118]">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Signature preview</p>
        </div>
        <div className="px-4 py-4 bg-[#0C0C0C] text-[13px] text-zinc-400 space-y-3 font-mono leading-relaxed">
          <p className="text-zinc-300">
            Hi Jane,<br />
            Your policy renewal is due on 1 June 2026. Please review the attached renewal notice…
          </p>
          <hr className="border-[#2a2a36]" />
          <pre className="whitespace-pre-wrap text-zinc-400 font-mono text-[13px]">
            {signature || <span className="italic text-[#6b6b6b]">Your signature will appear here.</span>}
          </pre>
        </div>
      </div>

      <div className="pt-2">
        <SaveButton saving={saving} saved={saved} onClick={onSave} />
      </div>
    </div>
  );
}
