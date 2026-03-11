/**
 * lib/renewals/insurer-terms.ts
 *
 * Uses Claude Sonnet 4.5 to parse raw insurer renewal terms text into
 * structured fields. Sonnet 4.5 is appropriate here — this is a structured
 * extraction task with a well-defined JSON schema.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";

const MODEL = "claude-sonnet-4-5";

export interface ParsedInsurerTerms {
  insurer_name: string;
  quoted_premium: number | null;
  premium_change: number | null;
  premium_change_pct: number | null;
  payment_terms: string | null;
  new_exclusions: string[];
  changed_conditions: string[];
  effective_date: string | null; // YYYY-MM-DD
  expiry_date: string | null;    // YYYY-MM-DD
  summary: string;
}

const SYSTEM_PROMPT = `You are an insurance document parser. Extract structured renewal terms from the raw text provided by an insurance broker.

Return ONLY valid JSON with exactly these fields — no markdown fences, no commentary:
{
  "insurer_name": "string",
  "quoted_premium": number | null,
  "premium_change": number | null,
  "premium_change_pct": number | null,
  "payment_terms": "string | null",
  "new_exclusions": ["string"],
  "changed_conditions": ["string"],
  "effective_date": "YYYY-MM-DD | null",
  "expiry_date": "YYYY-MM-DD | null",
  "summary": "2-3 sentence plain English summary of key changes"
}

Rules:
- Dollar amounts are raw numbers only (no $ signs, no commas)
- premium_change is the dollar delta from prior year (negative = decrease, positive = increase)
- premium_change_pct is the percentage (e.g. 12.5 means 12.5% increase)
- new_exclusions: list each new exclusion as a short phrase (empty array if none)
- changed_conditions: list each material condition change as a short phrase (empty array if none)
- Dates in YYYY-MM-DD format, or null if not determinable
- If the insurer name is not in the text, use "Unknown Insurer"
- If a numeric field cannot be extracted, use null`;

export async function parseInsurerTerms(
  rawText: string,
  priorPremium?: number | null
): Promise<ParsedInsurerTerms> {
  const client = getAnthropicClient();

  const userContent = priorPremium != null
    ? `Prior year premium: $${priorPremium}\n\nInsurer renewal terms:\n${rawText}`
    : `Insurer renewal terms:\n${rawText}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = response.content[0];
  if (raw.type !== "text") {
    throw new Error("Unexpected Claude response type");
  }

  const cleaned = raw.text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as ParsedInsurerTerms;

  // Ensure arrays exist even if Claude returns null
  parsed.new_exclusions = parsed.new_exclusions ?? [];
  parsed.changed_conditions = parsed.changed_conditions ?? [];

  return parsed;
}
