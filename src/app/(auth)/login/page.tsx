"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setStep("password");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError("Enter your password"); return; }
    setError(null);
    setLoading(true);
    const result = await loginAction({ email, password });
    if (result?.error) { setError(result.error); setLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  };

  return (
    <>
      {/* Heading */}
      <div className="mb-10">
        <h1 className="text-5xl font-bold tracking-tight text-text-primary leading-[1.1]">
          Welcome back
        </h1>
        <p className="mt-3 text-xl text-text-tertiary font-normal">
          Your renewal platform
        </p>
      </div>

      {/* Step 1: email */}
      {step === "email" && (
        <>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-surface px-6 py-3.5 text-sm font-medium text-text-primary transition-colors hover:bg-background disabled:opacity-50"
          >
            {googleLoading ? (
              <svg className="h-4 w-4 animate-spin text-text-tertiary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-tertiary">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleContinue} className="space-y-3">
            {error && (
              <p className="rounded-full bg-red-950/40 border border-red-800/50 px-5 py-2.5 text-sm text-red-400 text-center">
                {error}
              </p>
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              className="block w-full rounded-full border border-border bg-surface px-6 py-3.5 text-base text-text-primary placeholder-text-tertiary transition-colors focus:border-text-secondary focus:outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-full bg-text-primary px-6 py-3.5 text-base font-semibold text-text-inverse transition-colors hover:opacity-80"
            >
              Continue with email
            </button>
          </form>
        </>
      )}

      {/* Step 2: password */}
      {step === "password" && (
        <form onSubmit={handleSignIn} className="space-y-3">
          {error && (
            <p className="rounded-full bg-red-950/40 border border-red-800/50 px-5 py-2.5 text-sm text-red-400 text-center">
              {error}
            </p>
          )}

          {/* Email pill (read-only) */}
          <button
            type="button"
            onClick={() => { setStep("email"); setError(null); }}
            className="flex w-full items-center justify-between rounded-full border border-border bg-surface px-6 py-3.5 text-base text-text-primary transition-colors hover:bg-background"
          >
            <span>{email}</span>
            <span className="text-sm text-text-tertiary">Change</span>
          </button>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            placeholder="Password"
            className="block w-full rounded-full border border-border bg-surface px-6 py-3.5 text-base text-text-primary placeholder-text-tertiary transition-colors focus:border-text-secondary focus:outline-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-text-primary px-6 py-3.5 text-base font-semibold text-text-inverse transition-colors hover:opacity-80 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-text-primary underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
