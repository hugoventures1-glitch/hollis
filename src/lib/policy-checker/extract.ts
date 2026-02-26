/**
 * Policy PDF Extraction — Intelligent Policy Checker
 *
 * Sends a policy PDF (as base64) to Claude using the native PDF document
 * content type and returns structured extraction data.
 *
 * NOTE: Import only from API routes running in the Node.js runtime.
 */
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { ExtractedPolicyData } from "@/types/policies";

// ── Prompts ───────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an expert insurance policy analyst with 20 years of experience reading commercial insurance policy forms across all major US carriers including Travelers, Hartford, CNA, AIG, Zurich, Chubb, Nationwide, Liberty Mutual, and hundreds of regional and specialty carriers.

Your job is to extract complete, structured data from a commercial insurance policy PDF with high accuracy, even when the formatting is inconsistent, uses abbreviations, or spans many pages.

EXTRACTION RULES:
- named_insured is the policyholder entity, NOT the agent, broker, or carrier
- If you see "Also Insured", "Additional Named Insured", or DBA variations, include them in also_insured
- Limits are always in dollars — "1,000,000" means $1,000,000
- effective_date and expiry_date must be YYYY-MM-DD format
- If a field is genuinely absent from the document, return null — do NOT invent values
- For endorsements, include the form number AND description when visible (e.g. "CG 20 10 07 04 — Additional Insured (Owners, Lessees or Contractors)")
- For exclusions, describe the specific activity or entity excluded
- If you are uncertain about a value, still include your best reading but set extraction_confidence to "low" and explain in extraction_notes
- If the document appears to be scanned (image-only with poor text), set extraction_confidence to "low" and note it

COVERAGE TYPE IDENTIFIERS:
- "gl" = Commercial General Liability (CGL)
- "auto" = Commercial Auto / Business Auto (BAP)
- "umbrella" = Umbrella or Excess Liability
- "wc" = Workers Compensation and Employers Liability
- "pl" = Professional Liability / E&O
- "cyber" = Cyber Liability / Data Breach / Technology E&O
- "other" = anything else — describe it in raw_notes`;

const EXTRACTION_USER_PROMPT = `Extract all insurance policy information from this PDF document.

Return ONLY valid JSON with no markdown fences, no explanation, matching this exact structure:

{
  "named_insured": "string or null",
  "also_insured": ["string"],
  "policy_number": "string or null",
  "carrier": "string or null",
  "effective_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "coverage_lines": [
    {
      "coverage_type": "gl|auto|umbrella|wc|pl|cyber|other",
      "policy_number": "string or null",
      "carrier": "string or null",
      "insurer_naic": "string or null",
      "effective_date": "YYYY-MM-DD or null",
      "expiry_date": "YYYY-MM-DD or null",
      "claims_made": true|false|null,
      "limits": {
        "each_occurrence": null,
        "general_aggregate": null,
        "products_comp_ops_agg": null,
        "personal_adv_injury": null,
        "damage_to_rented_premises": null,
        "med_exp": null,
        "combined_single_limit": null,
        "each_claim": null,
        "aggregate": null,
        "el_each_accident": null,
        "el_disease_policy_limit": null,
        "el_disease_each_employee": null
      },
      "deductibles": {},
      "endorsements": [],
      "exclusions": [],
      "additional_insureds": [],
      "raw_notes": "string or null"
    }
  ],
  "endorsements": [],
  "exclusions": [],
  "extraction_notes": "string or null",
  "extraction_confidence": "high|medium|low"
}`;

// ── Main function ─────────────────────────────────────────────

export async function extractPolicyFromPDF(
  base64Pdf: string
): Promise<ExtractedPolicyData> {
  const client = getAnthropicClient();

  // Use Claude's native PDF document support (beta)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = await (client.beta.messages.create as unknown as (p: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>)({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    betas: ["pdfs-2024-09-25"],
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            type: "text",
            text: EXTRACTION_USER_PROMPT,
          },
        ],
      },
    ],
  });

  const raw = message.content[0];
  if (!raw || raw.type !== "text" || !raw.text) {
    throw new Error("Claude returned unexpected response type for PDF extraction");
  }

  // Strip markdown code fences (same pattern as check-coverage.ts)
  const jsonText = raw.text
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    return JSON.parse(jsonText) as ExtractedPolicyData;
  } catch {
    throw new Error(`Claude returned invalid JSON for PDF extraction: ${jsonText.slice(0, 200)}`);
  }
}
