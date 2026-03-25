/**
 * Policy Coverage Analysis — Intelligent Policy Checker
 *
 * Compares extracted policy data against a client coverage profile
 * and returns an array of ranked coverage flags.
 *
 * NOTE: Import only from API routes running in the Node.js runtime.
 */
import { getAnthropicClient } from "@/lib/anthropic/client";
import type {
  ExtractedPolicyData,
  ClientCoverageProfile,
  ClientContext,
  RawFlag,
} from "@/types/policies";

// ── Prompts ───────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `You are a senior insurance coverage analyst reviewing policies for an independent insurance agency. Your job is to identify coverage issues, gaps, and discrepancies that could expose the insured to uninsured loss or create E&O risk for the agent.

You are generating a review for a licensed agent — use precise insurance terminology but always explain why an issue matters in plain English in the "why_it_matters" field.

CORE PRINCIPLES:
1. Flag with low confidence rather than miss something — a low-confidence flag that turns out to be wrong is far better than a missed critical gap
2. Named insured mismatches must always be flagged, even if they appear to be DBA variations — the agent needs to verify
3. Always check limits against every contractual minimum provided in the profile
4. Endorsement wording matters — "additional insured" without the correct additional insured endorsement on the policy wording may not satisfy a contract
5. Exclusions that conflict with the client's stated business activities must always be flagged
6. If you cannot determine whether a requirement is met due to extraction uncertainty, create a low-confidence advisory flag asking the agent to manually verify
7. Expiry dates in the past or within 30 days are always worth flagging
8. If umbrella limits are lower than the underlying GL/Auto limits, that is a critical structural issue

SEVERITY DEFINITIONS:
- critical: An E&O claim is possible, or the client has no coverage for a known exposure
- warning: Issue should be addressed before next renewal or contract execution
- advisory: Best practice recommendation or something the agent should be aware of`;

function buildAnalysisUserPrompt(
  extractedDocs: ExtractedPolicyData[],
  profile: ClientCoverageProfile | null,
  context: ClientContext
): string {
  const profileSection = profile
    ? JSON.stringify(profile, null, 2)
    : "No client profile provided. Flag obvious issues only: expired dates, missing named insured, internally inconsistent limits (e.g. umbrella lower than underlying), missing coverage dates.";

  const activitiesStr = context.business_activities?.length
    ? context.business_activities.join(", ")
    : "not specified";

  return `Review the following insurance policy data against the client profile and identify ALL coverage issues.

## EXTRACTED POLICY DATA (${extractedDocs.length} document${extractedDocs.length !== 1 ? "s" : ""})
${JSON.stringify(extractedDocs, null, 2)}

## CLIENT PROFILE
${profileSection}

## CLIENT CONTEXT
Business type: ${context.business_type ?? "unknown"}
Industry: ${context.industry ?? "unknown"}
Owns vehicles: ${context.owns_vehicles}
Number of employees: ${context.num_employees ?? "unknown"}
Business activities: ${activitiesStr}

## INSTRUCTIONS
Return ONLY a valid JSON array of flag objects. No markdown, no explanation.
If there are no issues, return an empty array: []

Each flag must have exactly these fields:
[
  {
    "flag_type": "named_insured_mismatch|limit_below_minimum|missing_coverage|missing_endorsement|excluded_activity|coverage_gap|expiry_issue|other",
    "coverage_line": "gl|auto|umbrella|wc|pl|cyber|null",
    "severity": "critical|warning|advisory",
    "confidence": "high|medium|low",
    "title": "Short label, maximum 8 words",
    "what_found": "What the policy actually says or shows",
    "what_expected": "What was required or expected based on the profile and client context",
    "why_it_matters": "Plain English: the specific E&O risk or exposure this creates",
    "sort_order": 0
  }
]

Sort flags: critical issues first (sort_order 0, 1, 2...), then warnings, then advisories.
Within each severity group, sort by: coverage_line issues before general issues.
Set sort_order to the intended display index (0-based, continuous across groups).`;
}

// ── Main function ─────────────────────────────────────────────

export async function analyzePolicyCheck(
  docs: ExtractedPolicyData[],
  profile: ClientCoverageProfile | null,
  context: ClientContext
): Promise<RawFlag[]> {
  const client = getAnthropicClient();

  const userPrompt = buildAnalysisUserPrompt(docs, profile, context);

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0];
  if (!raw || raw.type !== "text" || !raw.text) {
    throw new Error("Claude returned unexpected response type for policy analysis");
  }

  // Strip markdown code fences
  const jsonText = raw.text
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected an array of flags");
    }
    return parsed as RawFlag[];
  } catch {
    throw new Error(`Claude returned invalid JSON for policy analysis: ${jsonText.slice(0, 200)}`);
  }
}
