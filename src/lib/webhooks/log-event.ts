/**
 * Fire-and-forget logger for webhook gate transitions.
 * Writes to public.webhook_events using the service-role admin client.
 * Never throws — logs to console on failure so the webhook handler
 * always returns 200 to the upstream provider.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface WebhookEventInput {
  endpoint: string;
  gate: string;
  email_id?: string | null;
  sender_email?: string | null;
  policy_id?: string | null;
  user_id?: string | null;
  http_status?: number | null;
  detail?: Record<string, unknown> | null;
}

export async function logWebhookEvent(args: WebhookEventInput): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("webhook_events")
      .insert(args);
    if (error) {
      console.error("[webhook_events] insert error:", error.message);
    }
  } catch (err) {
    console.error(
      "[webhook_events] insert threw:",
      err instanceof Error ? err.message : err
    );
  }
}
