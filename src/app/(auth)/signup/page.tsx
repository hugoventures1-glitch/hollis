"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signUpAction } from "./actions";

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

  if (confirmedEmail) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FAFAFA]/[0.06] border border-[#1C1C1C]">
          <svg
            className="h-6 w-6 text-[#FAFAFA]"
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
        <h2 className="text-xl font-semibold text-[#FAFAFA]">Check your email</h2>
        <p className="mt-2 text-sm text-[#9e9e9e]">
          We sent a confirmation link to{" "}
          <span className="font-medium text-[#FAFAFA]">{confirmedEmail}</span>.
          Click it to activate your account and sign in.
        </p>
        <p className="mt-6 text-sm text-[#6b6b6b]">
          Already confirmed?{" "}
          <Link
            href="/login"
            className="font-medium text-[#FAFAFA] hover:text-[#FAFAFA] underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-[#9e9e9e]">
          Get started with Hollis today
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-400">
            {serverError}
          </div>
        )}

        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-[#c5c5cb] mb-1.5"
          >
            Full name
          </label>
          <input
            {...register("name")}
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            className="block w-full rounded-lg border border-[#1C1C1C] bg-[#111111] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder-[#6b6b6b] transition-colors focus:border-[#555555] focus:outline-none focus:ring-1 focus:ring-0"
          />
          {errors.name && (
            <p className="mt-1.5 text-xs text-red-400">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[#c5c5cb] mb-1.5"
          >
            Email
          </label>
          <input
            {...register("email")}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="block w-full rounded-lg border border-[#1C1C1C] bg-[#111111] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder-[#6b6b6b] transition-colors focus:border-[#555555] focus:outline-none focus:ring-1 focus:ring-0"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-[#c5c5cb] mb-1.5"
          >
            Password
          </label>
          <input
            {...register("password")}
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className="block w-full rounded-lg border border-[#1C1C1C] bg-[#111111] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder-[#6b6b6b] transition-colors focus:border-[#555555] focus:outline-none focus:ring-1 focus:ring-0"
          />
          {errors.password ? (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.password.message}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-[#6b6b6b]">
              At least 8 characters, one uppercase letter, and one number
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-[#FAFAFA] px-4 py-2.5 text-sm font-semibold text-[#0C0C0C] transition-colors hover:bg-[#E8E8E8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#9e9e9e]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[#FAFAFA] hover:text-[#FAFAFA] underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
