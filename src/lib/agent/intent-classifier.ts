/**
 * lib/agent/intent-classifier.ts
 *
 * Step 3: Classifies inbound signals using Claude structured output (tool_use).
 * Returns { intent, confidence, flags_detected[], premium_increase_pct, reasoning }.
 *
 * When recent parser_outcomes are provided (Step 8 wires this fully), they are
 * injected as few-shot examples so the classifier learns the broker's style.
 * Learning generalises on INTENT PATTERNS only — never on client-level trust.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { ClassificationResult, ParserOutcome } from "@/types/agent";
import { ALL_KNOWN_INTENTS } from "@/types/agent";

const MODEL = "claude-haiku-4-5-20251001";

// Tool schema for structured output
const CLASSIFY_TOOL = {
  name: "classify_intent",
  description: "Classify the intent and extract renewal flags from an inbound signal",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        description:
          "The single best-matching intent from the known taxonomy, or a novel label if none match",
      },
      confidence: {
        type: "number",
        description: "Confidence score between 0.000 and 1.000",
      },
      flags_detected: {
        type: "array",
        items: { type: "string" },
        description:
          "List of renewal flag names detected in the signal. Valid values: active_claim, insurer_declined, business_restructure, third_party_contact, premium_increase_pct",
      },
      premium_increase_pct: {
        type: ["number", "null"],
        description:
          "Numeric percentage if a premium increase was mentioned (e.g. 42 for 42%), otherwise null",
      },
      reasoning: {
        type: "string",
        description: "One or two sentences explaining the classification for audit purposes",
      },
    },
    // Mutable array required by Anthropic SDK types
    required: ["intent", "confidence", "flags_detected", "premium_increase_pct", "reasoning"] as string[],
  },
};

const SYSTEM_PROMPT = `You are an intent classifier for an insurance renewal management system operated by an Australian insurance broker.

Your job is to analyse inbound signals (client emails, SMS replies, third-party correspondence) and classify them into the appropriate intent, with a confidence score.

KNOWN INTENT TAXONOMY:
Autonomous intents (can be handled without broker intervention if confidence is high):
- confirm_renewal: Client confirms they want to proceed with renewal
- request_callback: Client is asking to be called back
- document_received: Client has sent or mentioned sending a document (certificate, invoice, financial statement)
- questionnaire_submitted: Client has completed or submitted the renewal questionnaire
- soft_query: Client has a general question that does not involve claims, disputes, or sensitive changes
- out_of_office: Detected auto-reply or out-of-office response — no human intent present

Escalation intents (ALWAYS require broker review regardless of confidence):
- active_claim_mentioned: Signal contains ANY mention of a claim, incident, accident, loss, or damage — even historical
- insurer_declined: Signal indicates an insurer has declined, refused, or pulled out of quoting
- premium_increase_major: Signal indicates a large premium increase (typically >20%)
- business_restructure: Signal mentions ABN change, new company, business sale, merger, acquisition, or restructure
- cancel_policy: Client explicitly wants to cancel or not renew the policy
- legal_dispute_mentioned: Signal mentions lawyers, solicitors, legal action, court, or dispute
- unverified_third_party: Signal appears to be from someone other than the primary policy contact (accountant, bookkeeper, lawyer, business partner)

DETECTABLE FLAGS:
When classifying, also check for these flags in the signal:
- active_claim: any mention of claim, incident, accident, loss (even if past)
- insurer_declined: any mention of insurer declining or not quoting
- business_restructure: any mention of business structure change, ABN change, company sale
- third_party_contact: sender appears to be someone other than the policyholder
- premium_increase_pct: if a premium amount or percentage increase is mentioned, extract the number

CONFIDENCE SCORING GUIDE:
- 0.90+: Signal is unambiguous. Single clear intent, no conflicting signals.
- 0.75–0.89: Mostly clear but some ambiguity (e.g., soft language, partial information).
- 0.60–0.74: Plausible interpretation but signal is vague or could mean multiple things.
- Below 0.60: Unclear or contradictory signal — do not classify confidently.

IMPORTANT RULES:
- If the signal contains ANY mention of a claim or incident, flag active_claim regardless of the main intent.
- third_party_contact should be flagged when the sender uses language like "on behalf of", "I'm writing for", uses a different company domain, or explicitly states they are not the policyholder.
- Do not infer intent from previous context — classify only on the signal provided.`;

function buildFewShotBlock(outcomes: ParserOutcome[]): string {
  if (outcomes.length === 0) return "";

  const examples = outcomes
    .slice(0, 10)
    .map(
      (o, i) =>
        `Example ${i + 1}:\nSignal: "${o.raw_signal.slice(0, 300)}"\nBroker confirmed intent: ${o.final_intent ?? o.classified_intent}`
    )
    .join("\n\n");

  return `\nHere are recent examples of how this broker classifies signals. Use the same judgement:\n\n${examples}\n`;
}

export async function classifyIntent(
  rawSignal: string,
  recentOutcomes: ParserOutcome[] = []
): Promise<ClassificationResult> {
  const anthropic = getAnthropicClient();
  const fewShotBlock = buildFewShotBlock(recentOutcomes);

  const userMessage = `${fewShotBlock}Classify the following inbound signal:\n\n"${rawSignal}"`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_intent" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("[intent-classifier] Claude did not return a tool_use block");
  }

  const raw = toolUse.input as {
    intent: string;
    confidence: number;
    flags_detected: string[];
    premium_increase_pct: number | null;
    reasoning: string;
  };

  // Validate and clamp
  const result: ClassificationResult = {
    intent: raw.intent ?? "unknown",
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0)),
    flags_detected: Array.isArray(raw.flags_detected) ? raw.flags_detected : [],
    premium_increase_pct: raw.premium_increase_pct ?? null,
    reasoning: raw.reasoning ?? "",
  };

  // Safety: if intent is in the escalation list, floor confidence to ensure
  // it never accidentally gets routed to Tier 1 via a confidence edge case.
  // The tier router checks ALWAYS_ESCALATE_INTENTS explicitly, but this is
  // a second layer of defence.
  const isKnown = ALL_KNOWN_INTENTS.includes(result.intent);
  if (!isKnown) {
    // Novel intent — cap confidence to keep it in Tier 2 range
    result.confidence = Math.min(result.confidence, 0.84);
  }

  return result;
}
