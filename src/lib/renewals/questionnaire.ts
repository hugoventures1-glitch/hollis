/**
 * lib/renewals/questionnaire.ts
 *
 * Standard questionnaire questions and Claude Haiku parsing of client responses.
 * Used at the 90-day mark to detect material changes to the client's risk profile.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { Policy, QuestionnaireSuggestions } from "@/types/renewals";

const MODEL = "claude-haiku-4-5-20251001";

// Standard questions sent to all clients at 90-day mark
export const QUESTIONNAIRE_QUESTIONS = [
  {
    key: "turnover_changed",
    label: "Has your annual turnover changed significantly in the past 12 months?",
    placeholder: "e.g. Yes, increased from $2M to $3.5M",
  },
  {
    key: "staff_count",
    label: "Has your number of employees changed? If so, what is your current headcount?",
    placeholder: "e.g. We now have 28 full-time staff (up from 20)",
  },
  {
    key: "locations",
    label: "Have you added or closed any business locations or premises?",
    placeholder: "e.g. We opened a new warehouse in Wetherill Park",
  },
  {
    key: "equipment",
    label: "Have you purchased or disposed of any major equipment, machinery, or vehicles?",
    placeholder: "e.g. Purchased 2 new delivery trucks for $180,000",
  },
  {
    key: "major_contracts",
    label: "Have you taken on any significant new contracts, clients, or projects?",
    placeholder: "e.g. Secured a $5M government contract starting July",
  },
  {
    key: "claims",
    label: "Have you had any insurance claims or incidents in the past 12 months?",
    placeholder: "e.g. One water damage claim, settled for $12,000",
  },
  {
    key: "additional_info",
    label: "Is there anything else that has changed in your business we should know about before your renewal?",
    placeholder: "e.g. We have started exporting to New Zealand",
  },
];

const SYSTEM_PROMPT = `You are an insurance data assistant. A client has completed a renewal questionnaire. Based on their responses, identify what has materially changed and suggest which policy fields should be updated.

Return ONLY valid JSON with this exact structure — no markdown fences:
{
  "suggested_updates": [
    {
      "field": "field_name",
      "current_value": "string or null",
      "suggested_value": "string",
      "reason": "one sentence explaining why"
    }
  ],
  "summary": "1-2 sentence summary of what changed and why it matters for coverage",
  "risk_flags": ["string"]
}

Mappable policy fields: annual_revenue, num_employees, num_locations, owns_vehicles, notes
Only suggest an update when a response clearly indicates a material change. Do not invent changes.
risk_flags should list anything that requires urgent broker attention (new high-value equipment, major revenue jump, new high-risk activities, claims history).
If nothing material has changed, return empty arrays and a summary saying so.`;

export async function parseQuestionnaireResponses(
  policy: Policy,
  responses: Record<string, string>
): Promise<QuestionnaireSuggestions> {
  const client = getAnthropicClient();

  const responseText = QUESTIONNAIRE_QUESTIONS.map((q) => {
    const answer = responses[q.key]?.trim() || "(No answer provided)";
    return `Q: ${q.label}\nA: ${answer}`;
  }).join("\n\n");

  const userContent = `
Policy: ${policy.policy_name}
Client: ${policy.client_name}
Carrier: ${policy.carrier}
Expiry: ${policy.expiration_date}
Current premium: ${policy.premium != null ? `$${Number(policy.premium).toLocaleString("en-AU")}` : "Not on file"}

Client questionnaire responses:
${responseText}
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

  const parsed = JSON.parse(cleaned) as QuestionnaireSuggestions;

  // Ensure arrays exist
  parsed.suggested_updates = parsed.suggested_updates ?? [];
  parsed.risk_flags = parsed.risk_flags ?? [];

  return parsed;
}
