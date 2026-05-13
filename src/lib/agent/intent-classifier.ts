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
      changes_requested: {
        type: "array",
        items: { type: "string" },
        description:
          "When intent is renewal_with_changes: a list of specific changes the client is requesting before they will renew (e.g. 'Update business address to 123 Main St'). Empty array for all other intents.",
      },
      document_type_needed: {
        type: ["string", "null"],
        description:
          "When intent is document_required: the specific document type needed (e.g. 'Loss Runs', 'Certificate of Currency', 'Signed ACORD 25 Form'). Null for all other intents.",
      },
      secondary_flags: {
        type: "array",
        items: { type: "string" },
        description:
          "Additional signals co-existing alongside the primary intent. Valid values: cross_sell_signal (client mentions another insurance product they need), lapse_risk (OOO return date is after policy expiry), complaint_tone (signal contains frustration or dissatisfaction). Empty array when no secondary signals detected.",
      },
      ooo_return_date: {
        type: ["string", "null"],
        description:
          "When intent is out_of_office: the return date extracted from the OOO message in ISO 8601 format (YYYY-MM-DD). Null if no return date is mentioned or intent is not out_of_office.",
      },
    },
    // Mutable array required by Anthropic SDK types
    required: ["intent", "confidence", "flags_detected", "premium_increase_pct", "reasoning", "changes_requested", "document_type_needed", "secondary_flags", "ooo_return_date"] as string[],
  },
};

const SYSTEM_PROMPT = `You are an intent classifier for an insurance renewal management system operated by an Australian insurance broker.

Your job is to analyse inbound signals (client emails, SMS replies, third-party correspondence) and classify them into the appropriate intent, with a confidence score.

PRIORITY DISAMBIGUATION RULES (apply in this order):

1. FORWARDED EMAIL: If the subject line starts with "Fwd:" or "FW:", or the body contains "---------- Forwarded message ----------", "Begin forwarded message:", or the FROM address in a forwarded header is the broker's own renewals address — classify as forwarded_no_intent. Do NOT reply to forwards.

2. CHURN SIGNAL: If the client states they are going with a different broker, have already arranged cover elsewhere, are not renewing, or uses phrases like "going with another broker", "found a better deal elsewhere", "won't be renewing with you", "switching brokers" — classify as declined_churn immediately. This overrides all other intent signals.

3. CONTACT CHANGE: If the client asks to update contact details, send future correspondence to a different person, or names someone else as the new contact — classify as contact_change. Phrases: "send this to Lisa", "please update your records", "new contact is", "forward to my colleague".

4. DOCUMENT RECEIVED: If the inbound signal contains any of the following — an attachment reference, a document type name (certificate, loss run, accord, invoice, financials, statement, policy documents), or phrases like "attached", "sending you", "here is", "please find" — classify as document_received, NOT confirm_renewal, even if confirmation language is also present.
   EXCEPTION: Do NOT classify as document_received when the client is merely promising to send a document in the future. Future-tense phrases like "I'll attach", "I will send", "I'll email it through", "I'll put it together", "I'll get that to you", or "I'll send it over" indicate intent to send later.

5. AMBIGUOUS ACKNOWLEDGEMENT: Polite social replies like "Thanks", "Thank you", "Got it", "OK", "Noted", "Cheers", "Will do", "Sounds good" — with NO additional intent — are NOT confirmations of renewal. Classify as ambiguous_acknowledgement. Do NOT classify as confirm_renewal.

6. CONFIRM RENEWAL: Only valid when: (1) no document is referenced, (2) no open questions, (3) completely unconditional, (4) explicit renewal intent is present (e.g. "yes please proceed", "happy to renew", "go ahead with renewal"). Degrade to soft_query, ambiguous_acknowledgement, or document_received if any of those conditions fail.

KNOWN INTENT TAXONOMY:
Autonomous intents (can be handled without broker intervention if confidence is high):
- confirm_renewal: Client explicitly and unconditionally confirms they want to proceed with renewal. No questions, no conditions, no documents referenced. Must contain clear renewal intent language — a simple "thanks" or "ok" does NOT qualify.
- request_callback: Client is asking to be called back
- document_received: Client has sent or mentioned sending a document (certificate, invoice, financial statement)
- soft_query: Client has a general question that does not involve claims, disputes, or sensitive changes
- out_of_office: Detected auto-reply or out-of-office response — no human intent present. Extract return date into ooo_return_date if mentioned.

Broker action required intents (always Tier 2 — broker must confirm before agent acts):
- renewal_with_changes: Client confirms they want to renew BUT requests specific changes first (e.g. update address, increase a coverage limit, add/remove an item). Use this whenever a renewal confirmation comes with any conditions or modification requests. Extract each change as a separate item in changes_requested.
- document_required: A specific document is needed from the client to proceed with the renewal (e.g. loss runs, certificate of currency, signed ACORD form, proof of payroll, financial statements). Use this when the broker or renewal process identifies a missing or required document. Extract the document type in document_type_needed.
- schedule_meeting: Client is requesting a face-to-face meeting, video call, or phone appointment — and is asking for the broker to send available times or schedule a session. This is distinct from request_callback (which is a simple "call me back" without scheduling intent). Use schedule_meeting when the client explicitly wants to arrange a time, discuss something in person/video, or asks the broker to send calendar availability.
- ambiguous_acknowledgement: Signal is a polite social reply ("Thanks", "Got it", "OK", "Noted", "Cheers", "Sounds good") with no clear action intent. The broker must review to determine whether this is a soft confirmation or just an acknowledgement.

Escalation intents (ALWAYS require broker review regardless of confidence):
- active_claim_mentioned: Signal contains ANY mention of a claim, incident, accident, loss, or damage — even historical
- insurer_declined: Signal indicates an insurer has declined, refused, or pulled out of quoting
- premium_increase_major: Signal indicates a large premium increase (typically >20%)
- business_restructure: Signal mentions ABN change, new company, business sale, merger, acquisition, or restructure
- cancel_policy: Client explicitly wants to cancel or not renew the policy
- legal_dispute_mentioned: Signal mentions lawyers, solicitors, legal action, court, or dispute
- unverified_third_party: Signal appears to be from someone other than the primary policy contact (accountant, bookkeeper, lawyer, business partner)
- declined_churn: Client is explicitly leaving for a different broker or has arranged cover elsewhere. Renewal sequence must be stopped and a retention task created.
- contact_change: Client is requesting that future correspondence be sent to a different person or wants to update contact details. Must be resolved before sequence continues.
- forwarded_no_intent: Email is a forward (Fwd:/FW: subject, forwarded message header detected, or broker's own address appears in a forwarded-from header). Do NOT reply to this signal.

SECONDARY FLAGS (populate secondary_flags array — these co-exist with the primary intent):
- cross_sell_signal: Client mentions needing another type of insurance product not currently on this policy (e.g. "also need home insurance", "looking for life cover", "need a public liability policy"). Add when detected alongside ANY primary intent.
- lapse_risk: OOO return date is on or after the policy expiry date — client will be unreachable when renewal action is due.
- complaint_tone: Signal contains frustration, disappointment, or dissatisfaction language, even if it is not a formal complaint.

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
- Do not infer intent from previous context — classify only on the signal provided.
- If a signal expresses willingness to renew BUT also asks a question or requests information, always classify as soft_query (not confirm_renewal). A confirmation is only valid when it is unconditional — the unanswered question means the client cannot yet be treated as confirmed.
- "Thanks", "Thank you", "Got it", "OK", "Noted", "Cheers" with no further content are NEVER confirm_renewal — always classify as ambiguous_acknowledgement.`;

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
    changes_requested?: string[];
    document_type_needed?: string | null;
    secondary_flags?: string[];
    ooo_return_date?: string | null;
  };

  // Validate and clamp
  const result: ClassificationResult = {
    intent: raw.intent ?? "unknown",
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0)),
    flags_detected: Array.isArray(raw.flags_detected) ? raw.flags_detected : [],
    premium_increase_pct: raw.premium_increase_pct ?? null,
    reasoning: raw.reasoning ?? "",
    changes_requested: Array.isArray(raw.changes_requested) && raw.changes_requested.length > 0
      ? raw.changes_requested
      : undefined,
    document_type_needed: raw.document_type_needed ?? null,
    secondary_flags: Array.isArray(raw.secondary_flags) && raw.secondary_flags.length > 0
      ? raw.secondary_flags
      : undefined,
    ooo_return_date: raw.ooo_return_date ?? null,
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
