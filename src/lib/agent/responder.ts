/**
 * lib/agent/responder.ts
 *
 * Generates outbound reply emails for Tier 1 autonomous responses and
 * Tier 2 pre-drafted broker-review items.
 *
 * Two functions:
 *   generateQueryResponse — answers a soft_query from a client
 *   generateAckEmail      — acknowledges confirm_renewal, request_callback, document_received
 *
 * Follows the exact same pattern as lib/renewals/generate.ts:
 * same model, same JSON output constraint, same markdown-fence stripping.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { Policy } from "@/types/renewals";
import type { GenerateContext } from "@/lib/renewals/generate";

export type { GenerateContext };

const MODEL = "claude-haiku-4-5-20251001";

function premiumLine(policy: Policy): string {
  return policy.premium
    ? `- Current Premium: $${Number(policy.premium).toLocaleString()}`
    : "";
}

function standingOrdersBlock(ctx?: GenerateContext): string {
  const parts: string[] = [];
  if (ctx?.standingOrders?.trim()) {
    parts.push(`Broker standing orders (always follow these):\n${ctx.standingOrders.trim()}`);
  }
  if (ctx?.clientNotes?.trim()) {
    parts.push(`Notes on this client (factor these in):\n${ctx.clientNotes.trim()}`);
  }
  return parts.length ? `\n${parts.join("\n\n")}\n` : "";
}

/**
 * Generate a professional reply to a soft_query signal.
 * rawSignal is the verbatim client email/message text.
 */
export async function generateQueryResponse(
  rawSignal: string,
  policy: Policy,
  ctx?: GenerateContext,
): Promise<{ subject: string; body: string }> {
  const client = getAnthropicClient();

  const prompt = `You are drafting a reply on behalf of an insurance agent to a client who has a question about their policy.

Policy context:
- Client: ${policy.client_name}
- Policy: ${policy.policy_name}
- Carrier: ${policy.carrier ?? ""}
- Expiry: ${policy.expiration_date}
${premiumLine(policy)}
- Agent: ${policy.agent_name ?? ""}
- Agent email: ${policy.agent_email ?? ""}
${standingOrdersBlock(ctx)}
The client wrote:
"${rawSignal}"

Draft a professional, warm reply that:
- Addresses the client by first name
- Directly responds to their question using the policy context above
- Does not invent coverage details not present in the context — if uncertain, invite them to call
- Is 1–3 short paragraphs, plain text (no HTML)
- Ends with the agent's name and email on separate lines after two line breaks
- Follows the broker's standing orders if any are provided above

Respond with ONLY valid JSON: {"subject": "...", "body": "..."}
The body should be plain text with line breaks between paragraphs.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("[responder] Unexpected Claude response type");

  const jsonText = raw.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(jsonText) as { subject: string; body: string };
  return { subject: String(parsed.subject), body: String(parsed.body) };
}

const INTENT_TONES: Record<"confirm_renewal" | "request_callback" | "document_received", string> = {
  confirm_renewal:
    "The client has confirmed they want to proceed with renewal. " +
    "Thank them warmly, confirm you have noted their decision, and let them know " +
    "you will be in touch with next steps shortly.",
  request_callback:
    "The client has asked to be called back. Acknowledge their request, " +
    "let them know the agent will be in touch shortly, and confirm the " +
    "automated sequence has been paused while they wait.",
  document_received:
    "The client has indicated they sent a document. Acknowledge receipt warmly, " +
    "let them know you will review it and follow up, and thank them for sending it.",
};

/**
 * Generate a short acknowledgment email for terminal Tier 1 intents.
 * out_of_office and questionnaire_submitted are intentionally excluded —
 * those are log-only; no email is sent.
 */
export async function generateAckEmail(
  intent: "confirm_renewal" | "request_callback" | "document_received",
  policy: Policy,
  ctx?: GenerateContext,
): Promise<{ subject: string; body: string }> {
  const client = getAnthropicClient();

  const prompt = `You are writing a brief acknowledgment email on behalf of an insurance agent.

Policy context:
- Client: ${policy.client_name}
- Policy: ${policy.policy_name}
- Carrier: ${policy.carrier ?? ""}
- Agent: ${policy.agent_name ?? ""}
- Agent email: ${policy.agent_email ?? ""}
${standingOrdersBlock(ctx)}
Situation: ${INTENT_TONES[intent]}

Rules:
- Address the client by first name
- Keep it to 2–3 short sentences, warm and professional
- Plain text (no HTML)
- End with the agent's name and email on separate lines after two line breaks
- Do not fabricate coverage details

Respond with ONLY valid JSON: {"subject": "...", "body": "..."}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("[responder] Unexpected Claude response type");

  const jsonText = raw.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(jsonText) as { subject: string; body: string };
  return { subject: String(parsed.subject), body: String(parsed.body) };
}
