"use client";

import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";

interface Props {
  userId: string;
  email: string;
}

export function PostHogIdentify({ userId, email }: Props) {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog || !userId) return;
    posthog.identify(userId, { email });
  }, [posthog, userId, email]);

  return null;
}
