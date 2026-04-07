/**
 * Renewal Health Score
 *
 * computeHealthScore — pure function, no I/O, fully deterministic.
 * refreshPolicyHealthScore — fetches the policy from DB, computes, and writes
 *   the score back. Designed to be called from the daily cron and the refresh
 *   API route after any mutation that could change a policy's health state.
 */

import type { CampaignStage } from "@/types/renewals";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealthLabel = "healthy" | "at_risk" | "critical" | "stalled";

export interface HealthScoreResult {
  score: number;
  label: HealthLabel;
  stalled: boolean;
  stalledInQueue: boolean;
}

/** Minimal policy shape accepted by computeHealthScore. */
export interface ScoredPolicyInput {
  campaign_stage: CampaignStage | string;
  expiration_date: string; // YYYY-MM-DD
  last_contact_at?: string | null;
  renewal_flags?: Record<string, unknown> | null;
}

// ── Scoring tables ────────────────────────────────────────────────────────────

const STAGE_PTS: Record<string, number> = {
  confirmed:           40,
  complete:            40,
  recommendation_sent: 35,
  submission_sent:     30,
  script_14_ready:     30,
  questionnaire_sent:  28,
  sms_30_sent:         25,
  email_60_sent:       15,
  final_notice_sent:   10,
  email_90_sent:        5,
  lapsed:               0,
  pending:              0,
};

function expiryPoints(days: number): number {
  if (days > 90)  return 40;
  if (days > 60)  return 30;
  if (days > 30)  return 20;
  if (days >= 15) return 10;
  return 0;
}

function contactPoints(lastContactAt: string | null | undefined): number {
  if (!lastContactAt) return 0;
  const daysSince = Math.round(
    (Date.now() - new Date(lastContactAt).getTime()) / 86_400_000
  );
  if (daysSince <= 14) return 20;
  if (daysSince <= 30) return 10;
  if (daysSince <= 60) return 5;
  return 0;
}

// ── Pure computation ──────────────────────────────────────────────────────────

export function computeHealthScore(
  policy: ScoredPolicyInput
): HealthScoreResult {
  // Days until expiry (negative = already expired)
  const expiry = new Date(policy.expiration_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

  const score =
    expiryPoints(days) +
    (STAGE_PTS[policy.campaign_stage] ?? 0) +
    contactPoints(policy.last_contact_at);

  // Stalled: policy is approaching deadline but outreach has gone quiet
  const lastContact = policy.last_contact_at
    ? new Date(policy.last_contact_at)
    : null;
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 86_400_000);

  const stalled =
    score <= 50 &&
    !["complete", "confirmed", "lapsed"].includes(policy.campaign_stage) &&
    days <= 60 &&
    (lastContact === null || lastContact < twentyOneDaysAgo);

  const stalledInQueue = stalled && !!policy.renewal_flags?.silent_client;

  let label: HealthLabel;
  if (stalled) {
    label = "stalled";
  } else if (score >= 70) {
    label = "healthy";
  } else if (score >= 40) {
    label = "at_risk";
  } else {
    label = "critical";
  }

  return { score, label, stalled, stalledInQueue };
}

// ── DB write helper ───────────────────────────────────────────────────────────

/**
 * Fetches the latest policy state from DB, recomputes the health score, and
 * writes health_score / health_label / health_updated_at / stalled_at back.
 * Designed to be called after any mutation that changes campaign_stage or
 * last_contact_at (e.g. the daily cron, manual send actions).
 */
export async function refreshPolicyHealthScore(
  policyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<void> {
  const { data: policy } = await adminClient
    .from("policies")
    .select("campaign_stage, expiration_date, last_contact_at, stalled_at, renewal_flags")
    .eq("id", policyId)
    .single();

  if (!policy) return;

  const { score, label, stalled } = computeHealthScore(policy);
  const now = new Date().toISOString();

  await adminClient
    .from("policies")
    .update({
      health_score:      score,
      health_label:      label,
      health_updated_at: now,
      // Preserve original stall timestamp if already stalled; clear it if resolved
      stalled_at: stalled ? (policy.stalled_at ?? now) : null,
    })
    .eq("id", policyId);
}
