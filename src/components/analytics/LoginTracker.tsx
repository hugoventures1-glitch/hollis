"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";

export function LoginTracker() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog || searchParams.get("login") !== "1") return;
    posthog.capture("user_login", { method: "email" });
    // Remove ?login=1 from the URL without adding a history entry
    const params = new URLSearchParams(searchParams.toString());
    params.delete("login");
    const qs = params.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
  }, [posthog, searchParams, router]);

  return null;
}
