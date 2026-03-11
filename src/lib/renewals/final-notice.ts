/**
 * lib/renewals/final-notice.ts
 *
 * Generates the 7-day final notice email using Claude Haiku.
 * Language must be explicit about the lapse date and consequence.
 * This is the last automated communication before cover ends — it is a
 * legal notice, not a soft reminder.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { Policy } from "@/types/renewals";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are writing a FINAL NOTICE renewal email on behalf of an Australian insurance broker. This is the last automated communication before the policy lapses. The language must be explicit, clear, and urgent — but remain professional.

The email MUST contain:
1. An explicit statement that cover will lapse on the exact date
2. What "lapsed" means for the client (they will be uninsured — state this plainly)
3. The single required action to prevent this from happening
4. The agent's direct phone and email for immediate contact

Rules:
- No soft language or hedging
- Use the exact expiry date from the policy data
- Body must be under 200 words
- Plain text only — no markdown
- Do NOT include a subject line in the body
- Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

export async function generateFinalNotice(
  policy: Policy,
  agentName?: string | null,
  agentEmail?: string | null,
  agentPhone?: string | null
): Promise<{ subject: string; body: string }> {
  const client = getAnthropicClient();

  const expiryFormatted = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString(
    "en-AU",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  const userContent = `
Client: ${policy.client_name}
Policy: ${policy.policy_name}
Insurer: ${policy.carrier}
Expiry Date: ${expiryFormatted} (${policy.expiration_date})
Agent name: ${agentName ?? policy.agent_name ?? "Your Broker"}
Agent email: ${agentEmail ?? policy.agent_email ?? ""}
Agent phone: ${agentPhone ?? ""}
  `.trim();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = response.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");

  const cleaned = raw.text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  return JSON.parse(cleaned) as { subject: string; body: string };
}

// Fallback template if Claude fails
export function finalNoticeFallback(
  policy: Policy,
  agentName?: string | null,
  agentEmail?: string | null
): { subject: string; body: string } {
  const expiryFormatted = new Date(policy.expiration_date + "T00:00:00").toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "long", year: "numeric" }
  );

  return {
    subject: `FINAL NOTICE: Your ${policy.policy_name} expires on ${expiryFormatted}`,
    body: `Dear ${policy.client_name},

This is a final notice regarding your ${policy.policy_name} with ${policy.carrier}.

YOUR COVER WILL LAPSE ON ${expiryFormatted.toUpperCase()}.

If no action is taken before this date, you will be uninsured. Claims made after this date will not be covered.

To prevent your cover from lapsing, please contact us immediately to confirm your renewal.

${agentName ?? "Your Broker"}
${agentEmail ?? ""}

Please call or email us today.`,
  };
}
