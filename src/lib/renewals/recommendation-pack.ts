/**
 * lib/renewals/recommendation-pack.ts
 *
 * Generates the formal client-facing renewal recommendation pack using
 * Claude Sonnet 4.6. This is a high-stakes document — formal advice that
 * may be referenced in AFCA proceedings. Maximum output quality required.
 *
 * Distinct from outbox_drafts (pre-renewal reminder emails). This is the
 * formal advice document sent once insurer quotes have been received and
 * compared.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { Policy, InsurerTerms } from "@/types/renewals";

const MODEL = "claude-sonnet-4-6";

export interface RecommendationPackOutput {
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `You are a licensed insurance broker preparing a formal renewal recommendation document for a client. This document is a formal renewal recommendation prepared by a licensed Australian insurance broker. It must be precise, specific, and unambiguous.

Structure the document with exactly these sections in this order:

QUOTES RECEIVED
List each insurer quote with: insurer name, quoted premium, dollar and percentage change from prior year, key new exclusions or conditions, payment terms.

WHAT CHANGED FROM LAST YEAR
Specific material changes only. Include dollar figures where known. Do not speculate.

OUR RECOMMENDATION
A clear, explicit recommendation with the reasoning. If recommending one insurer over another, state why. Do not hedge — make a clear call.

YOUR OPTIONS
Numbered list of each available option with the key difference that matters for this client's decision.

REQUIRED ACTION AND DEADLINE
One clear instruction. State the exact expiry date. State what happens if no action is taken (cover lapses). Provide the agent's direct contact details.

Rules:
- Use the client's name throughout
- All dollar amounts must be exact figures (not ranges or approximations)
- Never use placeholder text
- Plain text only — no HTML, no markdown headers, no asterisks
- Professional Australian tone
- Sign off with the agent's full name, phone, and email
- Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

export async function generateRecommendationPack(
  policy: Policy,
  terms: InsurerTerms[],
  agentName: string,
  agentEmail: string,
  agentPhone?: string | null
): Promise<RecommendationPackOutput> {
  const client = getAnthropicClient();

  const termsText = terms
    .map((t, i) => {
      const premiumStr = t.quoted_premium != null
        ? `$${t.quoted_premium.toLocaleString("en-AU")}`
        : "Not provided";
      const changeStr = t.premium_change != null
        ? `${t.premium_change > 0 ? "+" : ""}$${Math.abs(t.premium_change).toLocaleString("en-AU")} (${t.premium_change_pct != null ? `${t.premium_change > 0 ? "+" : ""}${t.premium_change_pct.toFixed(1)}%` : "change %"})`
        : "Not available";
      const exclusions = t.new_exclusions.length > 0 ? t.new_exclusions.join("; ") : "None";
      const conditions = t.changed_conditions.length > 0 ? t.changed_conditions.join("; ") : "None";

      return [
        `Quote ${i + 1}: ${t.insurer_name}${t.is_recommended ? " (RECOMMENDED)" : ""}`,
        `  Premium: ${premiumStr}`,
        `  Change from prior year: ${changeStr}`,
        `  New exclusions: ${exclusions}`,
        `  Changed conditions: ${conditions}`,
        `  Payment terms: ${t.payment_terms ?? "Not specified"}`,
        t.notes ? `  Notes: ${t.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const priorPremium = policy.premium != null
    ? `$${Number(policy.premium).toLocaleString("en-AU")}`
    : "Not on file";

  const userContent = `
Client: ${policy.client_name}
Policy: ${policy.policy_name}
Insurer: ${policy.carrier}
Expiry Date: ${new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
Prior Year Premium: ${priorPremium}

Broker: ${agentName}
Broker Email: ${agentEmail}
${agentPhone ? `Broker Phone: ${agentPhone}` : ""}

INSURER QUOTES RECEIVED:
${termsText}
  `.trim();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = response.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");

  const cleaned = raw.text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  return JSON.parse(cleaned) as RecommendationPackOutput;
}
