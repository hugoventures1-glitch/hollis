/**
 * logAction — fire-and-forget logger for every automated Hollis action.
 *
 * Writes a row to hollis_actions via the service-role admin client.
 * Never throws — all errors are caught and printed to console so the
 * calling action is never blocked or broken by a logging failure.
 *
 * Usage:
 *   import { logAction, retainStandard, retainLongTerm } from "@/lib/logAction";
 *
 *   void logAction({ broker_id, policy_id, action_type: "renewal_email", ... });
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface LogActionParams {
  /** auth.users id — the broker who owns this action */
  broker_id: string;
  client_id?: string | null;
  policy_id?: string | null;
  /** See the action_type column comment in migration 026 for valid values */
  action_type: string;
  /** '1' | '2' | '3' — autonomy tier, where applicable */
  tier?: string | null;
  /** Plain-English sentence explaining exactly why this action fired */
  trigger_reason: string;
  /** Full content of what was sent or decided */
  payload?: Record<string, unknown> | null;
  /** Policy premium, carrier, days_to_expiry, confidence_score, etc. */
  metadata?: Record<string, unknown> | null;
  /** 'sent' | 'queued' | 'escalated' | 'failed' | 'halted' | 'classified' */
  outcome?: string;
  /**
   * ISO timestamp — caller decides retention based on action sensitivity.
   * Use retainStandard() (90 days) or retainLongTerm() (1 year).
   * Defaults to retainStandard() if omitted.
   */
  retain_until?: string;
}

/** 90-day retention — standard actions */
export function retainStandard(): string {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

/** 1-year retention — escalations, Tier 3 triggers, approval queue items */
export function retainLongTerm(): string {
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.from("hollis_actions").insert({
      broker_id:      params.broker_id,
      client_id:      params.client_id  ?? null,
      policy_id:      params.policy_id  ?? null,
      action_type:    params.action_type,
      tier:           params.tier       ?? null,
      trigger_reason: params.trigger_reason,
      payload:        params.payload    ?? null,
      metadata:       params.metadata   ?? null,
      outcome:        params.outcome    ?? "sent",
      retain_until:   params.retain_until ?? retainStandard(),
    });

    if (error) {
      console.error("[logAction] Insert failed:", error.message, {
        action_type: params.action_type,
        policy_id:   params.policy_id,
      });
    }
  } catch (err) {
    console.error(
      "[logAction] Unexpected error:",
      err instanceof Error ? err.message : err,
      { action_type: params.action_type }
    );
  }
}
