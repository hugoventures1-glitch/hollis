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
import { TemplatesSection } from "./TemplatesSection";

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
        <h2 className="text-[18px] font-semibold text-text-primary">Email &amp; Signatures</h2>
        <p className="text-[13px] text-text-tertiary mt-1">Control how your emails appear to clients.</p>
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
            <code className="flex-1 px-3 py-2 rounded-md bg-surface border border-border text-[13px] text-text-secondary font-mono select-all truncate">
              {signalAddress}
            </code>
            <button
              type="button"
              onClick={handleCopySignal}
              className="shrink-0 px-3 py-2 rounded-md bg-surface-raised border border-border text-[12px] text-text-secondary hover:text-text-primary hover:border-text-tertiary transition-colors cursor-pointer"
            >
              Copy
            </button>
          </div>
        </SettingsField>
      )}

      <div className="flex items-center justify-between py-3 border-y border-border">
        <div>
          <p className="text-[14px] font-medium text-text-primary">CC me on all client emails</p>
          <p className="text-[12px] text-text-tertiary mt-0.5">Receive a copy of every automated email sent to your clients.</p>
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
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-surface">
          <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Signature preview</p>
        </div>
        <div className="px-4 py-4 bg-background text-[13px] text-text-secondary space-y-3 font-mono leading-relaxed">
          <p className="text-text-primary">
            Hi Jane,<br />
            Your policy renewal is due on 1 June 2026. Please review the attached renewal notice…
          </p>
          <hr className="border-border" />
          <pre className="whitespace-pre-wrap text-text-secondary font-mono text-[13px]">
            {signature || <span className="italic text-text-tertiary">Your signature will appear here.</span>}
          </pre>
        </div>
      </div>

      <div className="pt-2">
        <SaveButton saving={saving} saved={saved} onClick={onSave} />
      </div>

      <div className="border-t border-border my-8" />

      <TemplatesSection />
    </div>
  );
}
