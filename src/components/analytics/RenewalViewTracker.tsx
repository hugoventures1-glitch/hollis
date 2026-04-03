"use client";

import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";

interface Props {
  policyId: string;
  policyName: string;
}

export function RenewalViewTracker({ policyId, policyName }: Props) {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    posthog.capture("renewal_record_viewed", { policy_id: policyId, policy_name: policyName });
  }, [posthog, policyId, policyName]);

  return null;
}
