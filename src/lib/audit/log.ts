/**
 * lib/audit/log.ts
 *
 * Centralised writer for renewal_audit_log.
 *
 * Every renewal workflow action — sent messages, questionnaire events,
 * insurer terms, doc chase events, confirmation, lapse — calls this function.
 * Never write to renewal_audit_log directly in route handlers or crons.
 *
 * Design principles:
 * - NEVER throws. Audit failure must not block the primary action.
 * - Accepts either the admin client (service role, for cron jobs) or
 *   the user client (for agent-triggered actions). Caller decides which.
 * - Logs errors to console only.
 */

import type { AuditEventType } from "@/types/renewals";

interface WriteAuditLogParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  policy_id: string;
  user_id: string;
  event_type: AuditEventType;
  channel?: "email" | "sms" | "internal" | "web" | null;
  recipient?: string | null;
  content_snapshot?: string | null;
  metadata?: Record<string, unknown>;
  actor_type?: "system" | "agent";
}

export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const {
    supabase,
    policy_id,
    user_id,
    event_type,
    channel = null,
    recipient = null,
    content_snapshot = null,
    metadata = {},
    actor_type = "system",
  } = params;

  try {
    const { error } = await supabase.from("renewal_audit_log").insert({
      policy_id,
      user_id,
      event_type,
      channel,
      recipient,
      content_snapshot,
      metadata,
      actor_type,
    });

    if (error) {
      console.error("[audit/log] Insert failed:", error.message, {
        policy_id,
        event_type,
        actor_type,
      });
    }
  } catch (err) {
    // Absolute last-resort catch — never let audit throw into the caller
    console.error("[audit/log] Unexpected error:", err instanceof Error ? err.message : err);
  }
}
