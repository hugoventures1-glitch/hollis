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

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Dev bulk delete
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteInput, setBulkDeleteInput] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteSuccess, setBulkDeleteSuccess] = useState(false);

  const handleBulkDelete = async () => {
    if (bulkDeleteInput !== "WIPE") return;
    setBulkDeleting(true);
    setBulkDeleteError(null);
    setBulkDeleteSuccess(false);
    const res = await fetch("/api/settings/bulk-delete", { method: "POST" });
    setBulkDeleting(false);
    if (res.ok) {
      setBulkDeleteSuccess(true);
      setBulkDeleteConfirm(false);
      setBulkDeleteInput("");
      router.refresh();
    } else {
      const data = await res.json();
      setBulkDeleteError(data.error ?? "Something went wrong.");
    }
  };

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
        <div className="rounded-lg border border-[#2a2a36] bg-[#111118] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[14px] font-medium text-[#f5f5f7]">Current plan</p>
            <p className="text-[13px] text-[#00d4aa] mt-0.5 capitalize">{planName}</p>
          </div>
          <span className="text-[12px] text-zinc-500">Billing management coming soon.</span>
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
          <div className="flex items-center gap-2 text-[13px] text-[#00d4aa]">
            <CheckCircle2 size={14} />
            Password updated successfully.
          </div>
        )}

        <SaveButton saving={pwSaving} saved={pwSaved} onClick={onChangePassword} label="Update password" />
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
                className="w-full max-w-xs px-3 py-2 rounded-md bg-[#1a1a24] border border-red-700/40 text-[14px] text-[#f5f5f7] placeholder-zinc-600 focus:outline-none focus:border-red-500/60 transition-colors"
              />
              {deleteError && <p className="text-[12px] text-red-400">{deleteError}</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={deleteInput !== "DELETE" || deleting}
                  onClick={handleDeleteAccount}
                  className="px-3 py-1.5 rounded-md bg-red-700 text-white text-[13px] font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

        {/* Dev: Bulk delete data */}
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 space-y-3 mt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-amber-500">Dev: Bulk delete all data</p>
              <p className="text-[13px] text-zinc-500 mt-0.5 leading-snug">
                Permanently deletes all policies, clients, certificates, doc chases, outbox, and imports. Your account and settings are preserved. Use this to start fresh.
              </p>
            </div>
          </div>

          {!bulkDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
              className="px-3 py-1.5 rounded-md border border-amber-700/60 text-amber-400 text-[13px] font-medium hover:bg-amber-950/40 transition-colors"
            >
              Bulk delete all data
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-zinc-400">
                Type <span className="font-mono font-bold text-amber-400">WIPE</span> to confirm.
              </p>
              <input
                type="text"
                value={bulkDeleteInput}
                onChange={(e) => setBulkDeleteInput(e.target.value)}
                placeholder="WIPE"
                className="w-full max-w-xs px-3 py-2 rounded-md bg-[#1a1a24] border border-amber-700/40 text-[14px] text-[#f5f5f7] placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 transition-colors"
              />
              {bulkDeleteError && <p className="text-[12px] text-red-400">{bulkDeleteError}</p>}
              {bulkDeleteSuccess && <p className="text-[12px] text-[#00d4aa]">All data deleted. Refresh the page.</p>}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={bulkDeleteInput !== "WIPE" || bulkDeleting}
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 rounded-md bg-amber-700 text-black text-[13px] font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkDeleting ? "Deleting…" : "Confirm bulk delete"}
                </button>
                <button
                  type="button"
                  onClick={() => { setBulkDeleteConfirm(false); setBulkDeleteInput(""); setBulkDeleteError(null); }}
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
