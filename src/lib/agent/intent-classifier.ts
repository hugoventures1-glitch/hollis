/**
 * lib/agent/intent-classifier.ts
 *
 * Classifier v2 — native structured outputs via output_config JSON schema.
 *
 * Architecture:
 *   1. Primary model: Haiku (fast, cheap, handles ~95% of replies)
 *   2. Cascade: if confidence < 0.85 → re-run on Sonnet (accuracy on edge cases)
 *   3. Output: JSON schema compiled into the model's token grammar — no prompt-
 *      based JSON, no parse errors, no malformed output.
 *
 * The schema intentionally keeps flags_detected and premium_increase_pct from
 * v1 so the flag-writer's escalation path (active_claim → Tier 3) remains intact
 * even though those signals are no longer primary intents.
 *
 * When recent parser_outcomes are provided they are injected as few-shot examples
 * so the classifier learns the broker's classification style over time.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { ClassificationResult, ParserOutcome } from "@/types/agent";
import { ALL_KNOWN_INTENTS } from "@/types/agent";

const HAIKU_MODEL  = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6-20250514";

// ── JSON schema for structured output ────────────────────────────────────────
// Compiled into the model's token grammar via output_config — the model
// physically cannot return output that violates this shape.

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    primary_intent: {
      type: "string",
      enum: [
        // v2 canonical intents
        "confirmed",
        "declined_churn",
        "coverage_question",
        "price_objection",
        "material_change_disclosed",
        "contact_change",
        "out_of_office",
        "forwarded_no_intent",
        "ambiguous_acknowledgement",
        "prior_comms_reference",
        "request_callback",
        "document_received",
        "document_required",
        "unclassified",
      ],
    },
    secondary_flags: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "material_change_disclosed",
          "coverage_question",
          "price_concern",
          "cross_sell_signal",
          "contact_change",
          "prior_comms_reference",
          "lapse_risk",
          "complaint_tone",
        ],
      },
    },
    // Kept from v1 so the flag-writer's escalation path stays intact.
    // active_claim, insurer_declined, business_restructure in here trigger
    // Tier 3 via the flag hard-stops in tier-router even without a matching
    // primary intent.
    flags_detected: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "active_claim",
          "insurer_declined",
          "business_restructure",
          "third_party_contact",
          "premium_increase_pct",
        ],
      },
    },
    premium_increase_pct: {
      type: ["number", "null"],
    },
    confidence: {
      type: "number",
    },
    ooo_return_date: {
      type: ["string", "null"],
    },
    ooo_alt_contact: {
      type: ["string", "null"],
    },
    extracted_context: {
      type: "string",
    },
    reasoning: {
      type: "string",
    },
    // Kept from v1 for backward compat with document_required handler
    document_type_needed: {
      type: ["string", "null"],
    },
    // Kept from v1 for backward compat with material_change_disclosed handler
    changes_requested: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "primary_intent",
    "secondary_flags",
    "flags_detected",
    "premium_increase_pct",
    "confidence",
    "ooo_return_date",
    "ooo_alt_contact",
    "extracted_context",
    "reasoning",
    "document_type_needed",
    "changes_requested",
  ],
  additionalProperties: false,
} as const;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the reply classifier for Hollis, an AI renewal automation system for Australian commercial insurance brokers.

Your job is to analyse an inbound client email reply and classify the client's intent. You return only structured JSON — no prose, no preamble.

---

CLASSIFICATION RULES

**confirmed**
The client explicitly agrees to renew, proceed, or continue the policy. The word must be there or clearly implied.
✓ "yes go ahead" / "please renew" / "all good, proceed" / "renew it"
✗ "thanks" / "ok" / "cheers" / "noted" / "received" — these are NOT confirmation

**declined_churn**
The client declines renewal or signals they are moving to another broker.
✓ "going with a different broker" / "no thanks" / "not renewing" / "cancelling" / "found someone else"
This is NOT a business_change. It is a retention emergency.

**coverage_question**
The client asks a specific question about what their policy covers, how it works, or has a general query before committing. Also use when a client confirms renewal BUT also asks a question — the open question prevents treating them as confirmed.

**price_objection**
The client expresses concern about premium cost or requests a requote. Extract any dollar figures mentioned in extracted_context.

**material_change_disclosed**
The client discloses a change to their business (headcount, revenue, new activities, new locations, new vehicles, equipment).
Note: This often appears alongside confirmed. Use secondary_flags for compound replies where confirmed is still primary.

**contact_change**
The client asks you to redirect communications to a different person.
✓ "send this to Lisa" / "contact X instead" / "she handles insurance now"

**out_of_office**
An automated OOO reply. Extract return date and alternative contact if present. Always populate ooo_return_date and ooo_alt_contact fields.

**forwarded_no_intent**
The email body contains a forwarded message pattern — the client forwarded your email to a third party. There is no renewal intent from the original recipient.
Detection patterns: "---------- Forwarded message", "Begin forwarded message:", subject starting with Fwd: or FW:, or "From: renewals@hollisai.com.au" appearing mid-body.
CRITICAL: Never classify this as confirmed or as any other intent. Return forwarded_no_intent immediately.

**ambiguous_acknowledgement**
The client replied but expressed no clear renewal intent. Single words like "thanks", "ok", "cheers", "noted", "received" with no other content.

**prior_comms_reference**
The client references a prior conversation or email that is not visible in this thread ("as I mentioned", "the email I sent last week", "did you get that").

**request_callback**
The client is asking to be called back. Simple callback request — not a scheduled meeting.

**document_received**
Client has sent or mentioned sending a document (certificate, invoice, financials, statement, loss run). Also classify as document_received when an attachment is referenced. EXCEPTION: Do NOT classify as document_received for future-tense promises ("I'll send it", "I'll attach it").

**document_required**
A specific document is needed from the client to proceed with the renewal. Use this when the broker or renewal process identifies a missing document. Populate document_type_needed with the specific document type.

**unclassified**
Use only if none of the above categories apply. Set confidence below 0.6.

---

SECONDARY FLAGS

After determining primary_intent, check for these secondary signals. A reply can have a confirmed primary intent AND secondary flags. Report all that apply.

- material_change_disclosed: client mentions business changes alongside their primary intent
- coverage_question: client asks a coverage question alongside their primary intent
- price_concern: client expresses cost concern without it being the primary intent
- cross_sell_signal: client mentions another policy type or renewal coming up
- contact_change: client mentions a contact change alongside their primary intent
- prior_comms_reference: client references a prior email alongside their primary intent
- lapse_risk: set this if primary_intent is out_of_office AND the policy expiry date would fall before the ooo_return_date (only set if expiry date is explicitly mentioned in the signal)
- complaint_tone: signal contains frustration, disappointment, or dissatisfaction language

---

FLAGS DETECTED

Also check for these escalation signals in the signal body. These are separate from primary_intent and trigger automatic escalation in the tier routing system.

- active_claim: any mention of a claim, incident, accident, loss, damage (even if past)
- insurer_declined: any mention of an insurer declining or refusing to quote
- business_restructure: any mention of ABN change, company sale, merger, acquisition, or major restructure
- third_party_contact: sender appears to be someone other than the policyholder (uses "on behalf of", different company domain, states they are not the policyholder)
- premium_increase_pct: if a premium percentage increase is mentioned (also populate premium_increase_pct field with the number)

---

CONFIDENCE

Return a float from 0.0 to 1.0.
- 0.95+ : unambiguous, single clear intent
- 0.85–0.94 : clear primary intent, minor ambiguity
- 0.70–0.84 : probable intent, some ambiguity
- below 0.70 : genuinely unclear — err toward ambiguous_acknowledgement or unclassified

---

EXTRACTED CONTEXT

Always populate extracted_context with the key facts a broker would need to act:
- Dollar figures mentioned
- Names of people mentioned
- Business changes described
- Dates mentioned
- Other policy types mentioned
Quote the client's exact words where relevant. Keep it under 100 words.

---

FEW-SHOT EXAMPLES

Input: "Yep all good, go ahead."
Output: { "primary_intent": "confirmed", "secondary_flags": [], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.97, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Client explicitly confirmed renewal.", "reasoning": "Unambiguous confirmation of intent to proceed.", "document_type_needed": null, "changes_requested": [] }

Input: "Thanks"
Output: { "primary_intent": "ambiguous_acknowledgement", "secondary_flags": [], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.92, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Single-word reply with no renewal intent.", "reasoning": "Acknowledgement only. No confirmation of intent to renew.", "document_type_needed": null, "changes_requested": [] }

Input: "Renew it but I've taken on 2 new apprentices since last year so you might need to update the headcount. Also we're now doing some solar panel work — not sure if that changes anything."
Output: { "primary_intent": "confirmed", "secondary_flags": ["material_change_disclosed"], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.91, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Client confirmed renewal. Disclosed: 2 new apprentices (headcount change), new solar panel installation work (potential coverage impact).", "reasoning": "Clear confirmation in first clause. Two material business changes disclosed that require broker verification before binding.", "document_type_needed": null, "changes_requested": ["Update headcount — 2 new apprentices", "New activity: solar panel installation work"] }

Input: "No thanks, we've decided to go with a different broker."
Output: { "primary_intent": "declined_churn", "secondary_flags": [], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.99, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Client explicitly declining. Moving to a different broker.", "reasoning": "Unambiguous churn signal. Not a business change — this is a retention emergency.", "document_type_needed": null, "changes_requested": [] }

Input: "Hi Mum, can you have a look at this and let me know what you think before I say yes\n---------- Forwarded message ----------\nFrom: renewals@hollisai.com.au"
Output: { "primary_intent": "forwarded_no_intent", "secondary_flags": [], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.99, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Client forwarded the renewal email to a third party (addressed as Mum). No renewal intent expressed by the original recipient.", "reasoning": "Forward pattern detected. Email is not addressed to Hollis — it is a private message from the client to another person. Do not reply.", "document_type_needed": null, "changes_requested": [] }

Input: "I'm on leave until 14 June. For urgent matters please contact james@karenokafor.com.au"
Output: { "primary_intent": "out_of_office", "secondary_flags": [], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.97, "ooo_return_date": "2026-06-14", "ooo_alt_contact": "james@karenokafor.com.au", "extracted_context": "Client on leave until 14 June. Alternative contact: james@karenokafor.com.au", "reasoning": "Standard OOO reply. Return date and alternative contact extracted.", "document_type_needed": null, "changes_requested": [] }

Input: "All good. By the way, is there any way to bundle this with our workers comp? We've got that up for renewal in September too."
Output: { "primary_intent": "confirmed", "secondary_flags": ["cross_sell_signal"], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.93, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Client confirmed renewal. Also mentioned workers comp policy due for renewal in September — asked about bundling.", "reasoning": "Clear confirmation. Cross-sell signal: workers comp, September renewal. Capture for broker opportunity task.", "document_type_needed": null, "changes_requested": [] }

Input: "Can you send this to Lisa? She handles all our insurance now."
Output: { "primary_intent": "contact_change", "secondary_flags": [], "flags_detected": [], "premium_increase_pct": null, "confidence": 0.96, "ooo_return_date": null, "ooo_alt_contact": null, "extracted_context": "Client requests communications be redirected to Lisa. She now handles their insurance.", "reasoning": "Contact routing request. No renewal intent expressed. Broker must update contact record before continuing.", "document_type_needed": null, "changes_requested": [] }`;

// ── Few-shot injection ────────────────────────────────────────────────────────

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

// ── Core classifier (single model run) ───────────────────────────────────────

interface RawClassification {
  primary_intent: string;
  secondary_flags: string[];
  flags_detected: string[];
  premium_increase_pct: number | null;
  confidence: number;
  ooo_return_date: string | null;
  ooo_alt_contact: string | null;
  extracted_context: string;
  reasoning: string;
  document_type_needed: string | null;
  changes_requested: string[];
}

async function runClassifier(
  model: string,
  userMessage: string
): Promise<RawClassification> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    betas: ["structured-outputs-2025-12-15"],
    output_config: {
      format: {
        type: "json_schema",
        schema: CLASSIFICATION_SCHEMA as Record<string, unknown>,
      },
    },
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[intent-classifier] No text block in structured output response");
  }

  return JSON.parse(textBlock.text) as RawClassification;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function classifyIntent(
  rawSignal: string,
  recentOutcomes: ParserOutcome[] = []
): Promise<ClassificationResult> {
  const fewShotBlock = buildFewShotBlock(recentOutcomes);
  const userMessage = `${fewShotBlock}Classify the following inbound signal:\n\n"${rawSignal}"`;

  // Step 1: run Haiku
  let raw = await runClassifier(HAIKU_MODEL, userMessage);

  // Step 2: cascade to Sonnet if confidence is below threshold
  if (raw.confidence < 0.85) {
    try {
      raw = await runClassifier(SONNET_MODEL, userMessage);
    } catch (cascadeErr) {
      // Sonnet failed — log and proceed with Haiku result
      console.warn(
        "[intent-classifier] Sonnet cascade failed, using Haiku result:",
        cascadeErr instanceof Error ? cascadeErr.message : cascadeErr
      );
    }
  }

  // Map primary_intent → intent (internal field name kept for backward compat)
  const intent = raw.primary_intent ?? "unclassified";
  const confidence = Math.max(0, Math.min(1, raw.confidence ?? 0));

  // Safety cap: novel intents (not in known taxonomy) stay in Tier 2 range
  const isKnown = ALL_KNOWN_INTENTS.includes(intent);
  const clampedConfidence = isKnown ? confidence : Math.min(confidence, 0.84);

  return {
    intent,
    confidence: clampedConfidence,
    flags_detected: Array.isArray(raw.flags_detected) ? raw.flags_detected : [],
    premium_increase_pct: raw.premium_increase_pct ?? null,
    reasoning: raw.reasoning ?? "",
    extracted_context: raw.extracted_context ?? null,
    ooo_alt_contact: raw.ooo_alt_contact ?? null,
    ooo_return_date: raw.ooo_return_date ?? null,
    secondary_flags:
      Array.isArray(raw.secondary_flags) && raw.secondary_flags.length > 0
        ? raw.secondary_flags
        : undefined,
    changes_requested:
      Array.isArray(raw.changes_requested) && raw.changes_requested.length > 0
        ? raw.changes_requested
        : undefined,
    document_type_needed: raw.document_type_needed ?? null,
  };
}
