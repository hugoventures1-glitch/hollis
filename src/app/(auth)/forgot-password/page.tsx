"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: sbError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSubmitting(false);
    if (sbError) {
      setError(sbError.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-[#9e9e9e] leading-relaxed">
            If an account exists for <span className="text-[#FAFAFA]">{email}</span>, we&apos;ve
            sent a password reset link. Check your inbox and spam folder.
          </p>
        </div>
        <Link
          href="/login"
          className="text-sm text-[#666666] hover:text-[#FAFAFA] transition-colors"
        >
          ← Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-[#9e9e9e]">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[#c5c5cb] mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="block w-full rounded-lg border border-[#1C1C1C] bg-[#111111] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder-[#6b6b6b] transition-colors focus:border-[#555555] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full rounded-lg bg-[#FAFAFA] px-4 py-2.5 text-sm font-semibold text-[#0C0C0C] transition-colors hover:bg-[#E8E8E8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="text-[#666666] hover:text-[#FAFAFA] transition-colors"
        >
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}
