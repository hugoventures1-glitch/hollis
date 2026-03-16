/**
 * lib/agent/broker-notifier.ts
 *
 * Step 6: Sends broker alert emails for Tier 3 escalations.
 *
 * Called immediately when the tier router returns Tier 3.
 * The email surfaces in the broker's inbox with full context:
 * - What the flag is and why the sequence was halted
 * - Last client touchpoint + message snippet
 * - One-click links to the policy in the Hollis dashboard
 *
 * This is NOT a client-facing email. It goes to the agent (broker) only.
 */

import { getResendClient } from "@/lib/resend/client";
import type { BrokerNotification, TierDecision } from "@/types/agent";

interface BrokerNotifierParams {
  brokerEmail: string;
  brokerName?: string;
  senderName?: string;
  policyId: string;
  decision: TierDecision;
  appUrl?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildEmailBody(
  notification: BrokerNotification,
  policyId: string,
  brokerName: string,
  appUrl: string
): { subject: string; text: string } {
  const policyUrl = `${appUrl}/renewals/${policyId}`;
  const expiryFormatted = formatDate(notification.expiry_date);
  const lastTouchFormatted = formatDate(notification.last_touchpoint_at);

  const subject = `⚠️ Action Required — ${notification.client_name} — ${notification.policy_name}`;

  const text = `Hi ${brokerName},

The renewal sequence for one of your clients has been halted and requires your immediate attention.

──────────────────────────────────────
CLIENT:       ${notification.client_name}
POLICY:       ${notification.policy_name}
EXPIRES:      ${expiryFormatted}
──────────────────────────────────────

REASON:
${notification.flag_reason}

LAST TOUCHPOINT: ${lastTouchFormatted}

CLIENT'S LAST MESSAGE:
"${notification.last_message_snippet}"

──────────────────────────────────────

To review this policy and take action, open it in Hollis:
${policyUrl}

From the policy page you can:
• Resume the renewal sequence once resolved
• Mark the case as handled
• Log a note with your resolution

This message was sent automatically by the Hollis agent system.
Do not reply to this email.

─
Hollis Renewal Intelligence`;

  return { subject, text };
}

export async function sendBrokerAlert(params: BrokerNotifierParams): Promise<void> {
  const { brokerEmail, brokerName = "there", senderName, policyId, decision, appUrl } = params;

  if (!decision.broker_notification) {
    // Not a Tier 3 decision — nothing to send
    return;
  }

  const resolvedAppUrl =
    appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://app.hollis.ai";

  const { subject, text } = buildEmailBody(
    decision.broker_notification,
    policyId,
    brokerName,
    resolvedAppUrl
  );

  const resend = getResendClient();

  const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
  const from = senderName ? `${senderName} <${baseFrom}>` : baseFrom;

  const { error } = await resend.emails.send({
    from,
    to: brokerEmail,
    subject,
    text,
  });

  if (error) {
    // Log but don't throw — a failed notification must not block the pipeline
    console.error(
      "[broker-notifier] Failed to send Tier 3 alert to",
      brokerEmail,
      error
    );
  }
}

/**
 * Fetches the broker's email and name from agent_profiles, then sends the alert.
 * Accepts the admin supabase client so it can be called from crons and API routes.
 */
export async function notifyBrokerTier3(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  policyId: string,
  decision: TierDecision
): Promise<void> {
  // Get broker contact details
  const [profileRes, userRes] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("first_name, last_name, email_from_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const profile = profileRes.data;
  const brokerName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "there"
    : "there";
  const senderName = profile?.email_from_name ?? undefined;

  const brokerEmail = userRes?.data?.user?.email;

  if (!brokerEmail) {
    console.warn("[broker-notifier] Could not resolve broker email for user", userId);
    return;
  }

  await sendBrokerAlert({
    brokerEmail,
    brokerName,
    senderName,
    policyId,
    decision,
  });
}
