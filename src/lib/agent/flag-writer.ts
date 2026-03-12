/**
 * lib/agent/flag-writer.ts
 *
 * Step 4: Builds and persists renewal_flags on the policies table.
 *
 * Flags are additive — once set, they stay true until a broker explicitly
 * clears them. The flag writer merges classifier-detected flags with the
 * existing state on the policy.
 *
 * days_to_expiry is computed fresh at call time and embedded in the returned
 * flags object, but is NOT written to the JSONB column (it is always derived
 * from policies.expiration_date at runtime).
 */

import { daysUntilExpiry } from "@/types/renewals";
import type { ClassificationResult, RenewalFlags } from "@/types/agent";
import { DEFAULT_RENEWAL_FLAGS } from "@/types/agent";

/**
 * Merges classifier output with the policy's current flags.
 * Flags are sticky: once raised they stay raised.
 * premium_increase_pct is overwritten if a higher value is newly detected.
 */
export function buildFlagsFromClassification(
  current: RenewalFlags,
  classification: ClassificationResult,
  expirationDate: string
): RenewalFlags {
  const detected = new Set(classification.flags_detected);
  const intent = classification.intent;

  // active_claim: sticky, also triggered by escalation intent
  const active_claim =
    current.active_claim ||
    detected.has("active_claim") ||
    intent === "active_claim_mentioned";

  // insurer_declined: sticky, also triggered by escalation intent
  const insurer_declined =
    current.insurer_declined ||
    detected.has("insurer_declined") ||
    intent === "insurer_declined";

  // premium_increase_pct: take the larger of current vs newly detected
  const newPct = classification.premium_increase_pct;
  let premium_increase_pct: number | null = current.premium_increase_pct;
  if (newPct !== null) {
    premium_increase_pct =
      premium_increase_pct === null ? newPct : Math.max(premium_increase_pct, newPct);
  }

  // business_restructure: sticky
  const business_restructure =
    current.business_restructure ||
    detected.has("business_restructure") ||
    intent === "business_restructure";

  // third_party_contact: sticky
  const third_party_contact =
    current.third_party_contact ||
    detected.has("third_party_contact") ||
    intent === "unverified_third_party";

  // silent_client: ONLY set by the silence-detection cron — never by the classifier
  const silent_client = current.silent_client;

  return {
    active_claim,
    insurer_declined,
    premium_increase_pct,
    business_restructure,
    third_party_contact,
    silent_client,
    // days_to_expiry recomputed fresh at call time
    days_to_expiry: daysUntilExpiry(expirationDate),
  };
}

/**
 * Writes the updated flags object to policies.renewal_flags.
 * days_to_expiry is stripped before writing — it is always derived at runtime.
 */
export async function writeFlagsToPolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  policyId: string,
  flags: RenewalFlags
): Promise<void> {
  // Strip runtime-only field before persisting
  const { days_to_expiry: _omit, ...persistedFlags } = flags;
  void _omit;

  const { error } = await supabase
    .from("policies")
    .update({ renewal_flags: persistedFlags })
    .eq("id", policyId);

  if (error) {
    throw new Error(
      `[flag-writer] Failed to write renewal_flags for policy ${policyId}: ${error.message}`
    );
  }
}

/**
 * Reads the current renewal_flags from a policy and hydrates days_to_expiry.
 * Falls back to DEFAULT_RENEWAL_FLAGS if the column is null/missing.
 */
export async function getCurrentFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  policyId: string
): Promise<RenewalFlags> {
  const { data, error } = await supabase
    .from("policies")
    .select("renewal_flags, expiration_date")
    .eq("id", policyId)
    .single();

  if (error || !data) {
    throw new Error(
      `[flag-writer] Failed to fetch policy flags for ${policyId}: ${error?.message ?? "no data"}`
    );
  }

  return {
    ...DEFAULT_RENEWAL_FLAGS,
    ...(data.renewal_flags ?? {}),
    // Always recompute days_to_expiry from the source-of-truth column
    days_to_expiry: daysUntilExpiry(data.expiration_date as string),
  };
}
