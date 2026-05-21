"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signUpAction } from "./actions";
import { createClient } from "@/lib/supabase/client";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormValues) => {
    setServerError(null);
    const result = await signUpAction(data);
    if (result && "error" in result) {
      setServerError(result.error);
    } else if (result && "needsConfirmation" in result) {
      setConfirmedEmail(getValues("email"));
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };

  if (confirmedEmail) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface border border-border">
          <svg
            className="h-6 w-6 text-text-primary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-text-primary">Check your email</h2>
        <p className="mt-2 text-sm text-text-secondary">
          We sent a confirmation link to{" "}
          <span className="font-medium text-text-primary">{confirmedEmail}</span>.
          Click it to activate your account.
        </p>
        <p className="mt-6 text-sm text-text-tertiary">
          Already confirmed?{" "}
          <Link
            href="/login"
            className="font-medium text-text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Start automating renewals today
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignUp}
        disabled={googleLoading || isSubmitting}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-400">
            {serverError}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-1.5">
            Full name
          </label>
          <input
            {...register("name")}
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            className="block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder-text-tertiary transition-colors focus:border-text-secondary focus:outline-none"
          />
          {errors.name && (
            <p className="mt-1.5 text-xs text-red-400">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">
            Email
          </label>
          <input
            {...register("email")}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder-text-tertiary transition-colors focus:border-text-secondary focus:outline-none"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">
            Password
          </label>
          <input
            {...register("password")}
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className="block w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text-primary placeholder-text-tertiary transition-colors focus:border-text-secondary focus:outline-none"
          />
          {errors.password ? (
            <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
          ) : (
            <p className="mt-1.5 text-xs text-text-tertiary">
              8+ characters, one uppercase, one number
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || googleLoading}
          className="w-full rounded-lg bg-text-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
