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
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            If an account exists for <span className="text-text-primary">{email}</span>, we&apos;ve
            sent a password reset link. Check your inbox and spam folder.
          </p>
        </div>
        <Link
          href="/login"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
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
            className="block text-sm font-medium text-text-secondary mb-1.5"
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
            className="block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder-text-tertiary transition-colors focus:border-border focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}
