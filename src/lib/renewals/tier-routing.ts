/**
 * lib/renewals/tier-routing.ts
 *
 * Tier routing decision engine for outbound renewal touchpoints.
 *
 * Two modes:
 *
 *   Learning mode  (broker has < CONFIDENCE_THRESHOLD approved send outcomes)
 *     ─ Routes ALL outbound sends to Tier 2 regardless of flags.
 *     ─ Every broker approval/rejection builds the confidence baseline.
 *     ─ Switches to autonomous mode once the threshold is crossed.
 *
 *   Autonomous mode  (>= CONFIDENCE_THRESHOLD approved outcomes)
 *     ─ Tier 1 by default — sends without broker confirmation.
 *     ─ Tier 2 only when a risk flag is detected.
 *     ─ Tier 3 hard-stops are always active in both modes.
 *
 * Auto-detected flags (written back to policies.renewal_flags):
 *   silent_client        — email sent > SILENT_DAYS ago with no client response
 *   premium_increase_pct — derived from the insurer_terms table vs current premium
 *
 * Manually-set flags (set by inbound parser or broker):
 *   active_claim, insurer_declined, business_restructure, third_party_contact
 */

import type { Policy, TouchpointType } from "@/types/renewals";
import type { RenewalFlags } from "@/types/agent";

// ── Config ────────────────────────────────────────────────────────────────────

/** Broker-approved send outcomes required before leaving learning mode. */
const CONFIDENCE_THRESHOLD = 5;

/**
 * Days after a sent email with no client response before the client is
 * automatically flagged as silent.
 */
const SILENT_DAYS = 21;

// ── Return type ───────────────────────────────────────────────────────────────

export interface TierRoutingResult {
  tier: 1 | 2 | 3;
  reason: string;
  /** Whether the broker is still in the learning phase. */
  mode: "learning" | "autonomous";
  /** Flags that were newly detected and written back to the policy this run. */
  detectedFlags: Partial<RenewalFlags>;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Determines the tier for a single outbound touchpoint.
 *
 * Side effect: writes any newly detected flags back to policies.renewal_flags
 * so subsequent cron runs don't need to re-detect them.
 */
export async function resolveTierRouting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  policy: Policy,
  _type: TouchpointType,
  _days: number,
): Promise<TierRoutingResult> {
  const flags: Partial<RenewalFlags> = policy.renewal_flags ?? {};

  // ── Tier 3 — hard stops, always active ───────────────────────────────────
  if (flags.active_claim)
    return tier(3, "Active claim on record — outbound halted pending resolution", "autonomous", {});
  if (flags.insurer_declined)
    return tier(3, "Insurer has declined cover", "autonomous", {});
  if (flags.business_restructure)
    return tier(3, "Business restructure flagged — broker must review before any send", "autonomous", {});

  // ── Auto-detect flags from policy history ─────────────────────────────────
  const detected: Partial<RenewalFlags> = {};

  if (!flags.silent_client) {
    const silent = await detectSilentClient(supabase, policy);
    if (silent) detected.silent_client = true;
  }

  if (!flags.premium_increase_pct) {
    const pct = await detectPremiumIncrease(supabase, policy);
    if (pct !== null) detected.premium_increase_pct = pct;
  }

  // Persist newly detected flags so the next cron run sees them directly
  if (Object.keys(detected).length > 0) {
    const merged = { ...flags, ...detected };
    await supabase.from("policies").update({ renewal_flags: merged }).eq("id", policy.id);
  }

  const effective = { ...flags, ...detected };

  // ── Check broker confidence level ─────────────────────────────────────────
  // Count how many outbound send decisions the broker has approved so far.
  // "send_*" intents are the ones created by this cron (e.g. "send_email_90").
  const { count: approvedCount } = await supabase
    .from("parser_outcomes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", policy.user_id)
    .eq("broker_action", "approved")
    .like("classified_intent", "send_%");

  const approved = approvedCount ?? 0;
  const isLearning = approved < CONFIDENCE_THRESHOLD;

  if (isLearning) {
    return tier(
      2,
      `Learning mode — ${approved}/${CONFIDENCE_THRESHOLD} approvals recorded. ` +
        `All sends routed for broker confirmation until the confidence baseline is established.`,
      "learning",
      detected,
    );
  }

  // ── Autonomous mode — Tier 2 only when a flag is present ─────────────────
  if (effective.silent_client)
    return tier(2, "Client has not responded after previous outreach", "autonomous", detected);

  if (effective.third_party_contact)
    return tier(2, "Reply received from a non-policy contact — verify before sending", "autonomous", detected);

  if (effective.premium_increase_pct !== null && effective.premium_increase_pct !== undefined && effective.premium_increase_pct >= 25)
    return tier(
      2,
      `Premium increase of ${effective.premium_increase_pct}% detected — broker review required before client contact`,
      "autonomous",
      detected,
    );

  return tier(1, "No flags — autonomous send", "autonomous", detected);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tier(
  t: 1 | 2 | 3,
  reason: string,
  mode: "learning" | "autonomous",
  detectedFlags: Partial<RenewalFlags>,
): TierRoutingResult {
  return { tier: t, reason, mode, detectedFlags };
}

/**
 * Detects a silent client: a send-log email exists that is older than
 * SILENT_DAYS with no subsequent client engagement event.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectSilentClient(supabase: any, policy: Policy): Promise<boolean> {
  // No previous touchpoint — can't be silent yet
  if (policy.campaign_stage === "pending") return false;

  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const { data: lastSend } = await supabase
    .from("send_logs")
    .select("sent_at")
    .eq("policy_id", policy.id)
    .eq("channel", "email")
    .gte("sent_at", cutoff)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastSend?.sent_at) return false;

  const daysSince = Math.floor(
    (Date.now() - new Date(lastSend.sent_at).getTime()) / 86_400_000,
  );
  if (daysSince < SILENT_DAYS) return false;

  // Check for any client-side engagement event after the last send
  const { data: response } = await supabase
    .from("renewal_audit_log")
    .select("id")
    .eq("policy_id", policy.id)
    .in("event_type", ["questionnaire_responded", "client_confirmed", "signal_received"])
    .gte("created_at", lastSend.sent_at)
    .limit(1)
    .maybeSingle();

  return !response;
}

/**
 * Detects a premium increase from the insurer_terms table.
 * Returns the percentage increase, or null if no terms have been logged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectPremiumIncrease(supabase: any, policy: Policy): Promise<number | null> {
  if (!policy.premium || policy.premium <= 0) return null;

  const { data: terms } = await supabase
    .from("insurer_terms")
    .select("quoted_premium")
    .eq("policy_id", policy.id)
    .not("quoted_premium", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!terms?.quoted_premium) return null;

  const pct = Math.round(
    ((terms.quoted_premium - policy.premium) / policy.premium) * 100,
  );
  return pct > 0 ? pct : null;
}
