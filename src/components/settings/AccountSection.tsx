"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SettingsField, SettingsInput } from "./SettingsField";
import { SaveButton } from "./SaveButton";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const passwordSchema = z
  .object({
    new_password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

interface Props {
  planName: string;
}

export function AccountSection({ planName }: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Password
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  const onChangePassword = handleSubmit(async ({ new_password }) => {
    setPwSaving(true);
    setPwError(null);
    const { error } = await supabase.auth.updateUser({ password: new_password });
    setPwSaving(false);
    if (error) {
      setPwError(error.message);
    } else {
      setPwSaved(true);
      reset();
      setTimeout(() => setPwSaved(false), 3000);
    }
  });

  // Reset data
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const handleResetData = async () => {
    if (resetInput !== "RESET") return;
    setResetting(true);
    setResetError(null);
    const res = await fetch("/api/settings/bulk-delete", { method: "POST" });
    if (res.ok) {
      setResetDone(true);
      setResetConfirm(false);
      setResetInput("");
      setResetting(false);
      setTimeout(() => {
        setResetDone(false);
        router.push("/renewals");
      }, 1800);
    } else {
      const { error } = await res.json();
      setResetError(error ?? "Something went wrong.");
      setResetting(false);
    }
  };

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (deleteInput !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch("/api/settings/delete-account", { method: "POST" });
    if (res.ok) {
      await supabase.auth.signOut();
      router.push("/login");
    } else {
      const { error } = await res.json();
      setDeleteError(error ?? "Something went wrong.");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[18px] font-semibold text-[#f5f5f7]">Account</h2>
        <p className="text-[13px] text-zinc-500 mt-1">Manage your plan, password, and account data.</p>
      </div>

      {/* Plan & Billing */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider">Plan &amp; Billing</p>
        <div className="rounded-lg border border-[#1C1C1C] bg-[#111111] px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-[#888888]">Current plan</p>
              <p className="text-[16px] font-semibold text-[#FAFAFA] mt-0.5 capitalize">{planName}</p>
            </div>
            <span
              className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{ background: "#0d2b1e", color: "#00d4aa", border: "1px solid #00d4aa33" }}
            >
              Active
            </span>
          </div>
          <div className="pt-1" style={{ borderTop: "1px solid #1C1C1C" }}>
            <a
              href="mailto:support@hollis.ai?subject=Billing enquiry"
              className="text-[13px] transition-colors"
              style={{ color: "#666666" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#FAFAFA")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#666666")}
            >
              Contact us to change or cancel your plan →
            </a>
          </div>
        </div>
      </div>

      <hr className="border-[#1e1e2a]" />

      {/* Change password */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider">Change Password</p>

        <SettingsField label="New password" error={errors.new_password?.message}>
          <SettingsInput
            {...register("new_password")}
            type="password"
            placeholder="Min. 8 characters"
            error={!!errors.new_password}
          />
        </SettingsField>

        <SettingsField label="Confirm new password" error={errors.confirm_password?.message}>
          <SettingsInput
            {...register("confirm_password")}
            type="password"
            placeholder="Repeat password"
            error={!!errors.confirm_password}
          />
        </SettingsField>

        {pwError && (
          <p className="text-[13px] text-red-400">{pwError}</p>
        )}
        {pwSaved && (
          <div className="flex items-center gap-2 text-[13px] text-[#FAFAFA]">
            <CheckCircle2 size={14} />
            Password updated successfully.
          </div>
        )}

        <SaveButton saving={pwSaving} saved={pwSaved} onClick={onChangePassword} label="Update password" />
      </div>

      <hr className="border-[#1e1e2a]" />

      {/* Dev tool — Reset account data */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider">Developer</p>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "#1a1200", color: "#F59E0B", border: "1px solid #F59E0B33" }}
          >
            Dev only
          </span>
        </div>
        <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "#F59E0B22", background: "rgba(245,158,11,0.04)" }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
            <div>
              <p className="text-[14px] font-semibold" style={{ color: "#F59E0B" }}>Reset account data</p>
              <p className="text-[13px] text-zinc-500 mt-0.5 leading-snug">
                Wipes all policies, renewals, clients, and activity. Keeps your account, profile, and settings intact — use this to start fresh as a new user.
              </p>
            </div>
          </div>

          {resetDone ? (
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "#F59E0B" }}>
              <CheckCircle2 size={14} />
              All data cleared — redirecting…
            </div>
          ) : !resetConfirm ? (
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors"
              style={{ border: "1px solid #F59E0B55", color: "#F59E0B", background: "transparent" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,0.08)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              Reset all data
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-zinc-400">
                Type <span className="font-mono font-bold" style={{ color: "#F59E0B" }}>RESET</span> to confirm.
              </p>
              <input
                type="text"
                value={resetInput}
                onChange={(e) => setResetInput(e.target.value)}
                placeholder="RESET"
                className="w-full max-w-xs px-3 py-2 rounded-md bg-[#111111] text-[14px] text-[#f5f5f7] placeholder-[#6b6b6b] focus:outline-none transition-colors"
                style={{ border: "1px solid #F59E0B33" }}
                onFocus={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "#F59E0B88")}
                onBlur={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "#F59E0B33")}
              />
              {resetError && <p className="text-[12px] text-red-400">{resetError}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={resetInput !== "RESET" || resetting}
                  onClick={handleResetData}
                  className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#F59E0B", color: "#0C0C0C" }}
                >
                  {resetting ? "Resetting…" : "Confirm reset"}
                </button>
                <button
                  type="button"
                  onClick={() => { setResetConfirm(false); setResetInput(""); }}
                  className="px-3 py-1.5 rounded-md text-zinc-400 text-[13px] hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <hr className="border-[#1e1e2a]" />

      {/* Danger zone */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold text-[#505057] uppercase tracking-wider">Danger Zone</p>
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-red-400">Delete account</p>
              <p className="text-[13px] text-zinc-500 mt-0.5 leading-snug">
                Permanently deletes your account and all associated data. This action cannot be undone.
              </p>
            </div>
          </div>

          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="px-3 py-1.5 rounded-md border border-red-700/60 text-red-400 text-[13px] font-medium hover:bg-red-950/40 transition-colors"
            >
              Delete Account
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-zinc-400">
                Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm.
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder="DELETE"
                className="w-full max-w-xs px-3 py-2 rounded-md bg-[#111111] border border-red-700/40 text-[14px] text-[#f5f5f7] placeholder-[#6b6b6b] focus:outline-none focus:border-red-500/60 transition-colors"
              />
              {deleteError && <p className="text-[12px] text-red-400">{deleteError}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleteInput !== "DELETE" || deleting}
                  onClick={handleDeleteAccount}
                  className="px-3 py-1.5 rounded-md bg-red-700 text-[#0C0C0C] text-[13px] font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirm(false); setDeleteInput(""); }}
                  className="px-3 py-1.5 rounded-md text-zinc-400 text-[13px] hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
