"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { loginAction } from "./actions";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    const result = await loginAction(data);
    if (result?.error) {
      setServerError(result.error);
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#f5f5f7]">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-[#8a8b91]">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <div className="rounded-lg bg-red-950/40 border border-red-800/50 px-4 py-3 text-sm text-red-400">
            {serverError}
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
            {...register("email")}
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="block w-full rounded-lg border border-[#2e2e3a] bg-[#111118] px-3.5 py-2.5 text-sm text-[#f5f5f7] placeholder-[#505057] transition-colors focus:border-[#00d4aa]/50 focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/20"
          />
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
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
            autoComplete="current-password"
            placeholder="••••••••"
            className="block w-full rounded-lg border border-[#2e2e3a] bg-[#111118] px-3.5 py-2.5 text-sm text-[#f5f5f7] placeholder-[#505057] transition-colors focus:border-[#00d4aa]/50 focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/20"
          />
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-[#00d4aa] px-4 py-2.5 text-sm font-semibold text-[#0d0d12] transition-colors hover:bg-[#00c49b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[#8a8b91]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-[#00d4aa] hover:text-[#00e6b8] underline-offset-4 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </>
  );
}
