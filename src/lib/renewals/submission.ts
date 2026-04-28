/**
 * lib/renewals/submission.ts
 *
 * Generates a formal insurer submission document using Claude Sonnet 4.6.
 * This requires nuanced synthesis of multiple data sources into a professional
 * underwriter-facing document. Sonnet 4.6 is used for maximum output quality.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";

const MODEL = "claude-sonnet-4-6";

export interface SubmissionOutput {
  subject: string;
  body: string;
}

interface SubmissionParams {
  policy: {
    policy_name: string;
    client_name: string;
    carrier: string;
    expiration_date: string;
    premium?: number | null;
    coverage_data?: Record<string, unknown> | null;
  };
  client: {
    name: string;
    business_type?: string | null;
    industry?: string | null;
    num_employees?: number | null;
    annual_revenue?: number | null;
    owns_vehicles?: boolean | null;
    num_locations?: number | null;
    primary_state?: string | null;
    notes?: string | null;
  } | null;
  auditFlags: Array<{
    severity: string;
    title: string;
    what_found: string;
    why_it_matters?: string | null;
  }>;
  priorTerms: Array<{
    insurer_name: string;
    quoted_premium?: number | null;
    payment_terms?: string | null;
    new_exclusions?: string[];
    changed_conditions?: string[];
  }>;
  agentName: string;
  agentEmail: string;
  agentPhone?: string | null;
  agencyName?: string | null;
  agencyAfsl?: string | null;
}

const SYSTEM_PROMPT = `You are an experienced Australian insurance broker preparing a formal submission to an insurer for policy renewal. The submission is for an underwriter's review.

Structure the document with exactly these sections:

RISK SUMMARY
Business name, type, industry, location(s), number of employees, annual turnover, key operations. Any material changes from the prior year.

INSURANCE HISTORY
Prior carrier, prior premium, coverage lines held, any claims in the past 12 months.

COVERAGE REQUIREMENTS
What cover is being sought, at what limits, with what endorsements. Be specific.

SUPPORTING INFORMATION
Any risk flags from the policy audit. Address these directly — do not omit them.

REQUESTED TERMS
What the broker is asking the insurer to provide. Specific limits, conditions, and any special requirements.

BROKER DETAILS
Submitting broker name, agency, AFSL number (if provided), contact details.

Rules:
- Professional and factual — no marketing language
- Australian English spelling
- Include specific dollar amounts and dates where available
- If there are critical audit flags, address them directly
- Plain text only — no markdown, no HTML
- Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

export async function generateInsuranceSubmission(
  params: SubmissionParams
): Promise<SubmissionOutput> {
  const client = getAnthropicClient();
  const { policy, client: clientData, auditFlags, priorTerms, agentName, agentEmail, agentPhone, agencyName, agencyAfsl } = params;

  const clientSection = clientData
    ? [
        `Business: ${clientData.name}`,
        clientData.business_type && `Type: ${clientData.business_type}`,
        clientData.industry && `Industry: ${clientData.industry}`,
        clientData.num_employees != null && `Employees: ${clientData.num_employees}`,
        clientData.annual_revenue != null && `Annual Revenue: $${Number(clientData.annual_revenue).toLocaleString("en-AU")}`,
        clientData.owns_vehicles != null && `Owns vehicles: ${clientData.owns_vehicles ? "Yes" : "No"}`,
        clientData.num_locations != null && `Number of locations: ${clientData.num_locations}`,
        clientData.primary_state && `Primary state: ${clientData.primary_state}`,
        clientData.notes && `Additional notes: ${clientData.notes}`,
      ]
        .filter(Boolean)
        .join("\n")
    : `Business: ${policy.client_name}`;

  const auditSection = auditFlags.length > 0
    ? auditFlags
        .map((f) => `[${f.severity.toUpperCase()}] ${f.title}: ${f.what_found}${f.why_it_matters ? ` — ${f.why_it_matters}` : ""}`)
        .join("\n")
    : "No audit flags";

  const priorSection = priorTerms.length > 0
    ? priorTerms
        .map(
          (t) =>
            `${t.insurer_name}: premium ${t.quoted_premium != null ? `$${Number(t.quoted_premium).toLocaleString("en-AU")}` : "unknown"}${t.new_exclusions?.length ? `, exclusions: ${t.new_exclusions.join(", ")}` : ""}`
        )
        .join("\n")
    : "No prior terms on record";

  const userContent = `
POLICY DETAILS:
Policy: ${policy.policy_name}
Client: ${policy.client_name}
Current carrier: ${policy.carrier}
Expiry: ${policy.expiration_date}
Prior premium: ${policy.premium != null ? `$${Number(policy.premium).toLocaleString("en-AU")}` : "Not on file"}

CLIENT PROFILE:
${clientSection}

POLICY AUDIT FLAGS:
${auditSection}

PRIOR YEAR INSURER TERMS:
${priorSection}

SUBMITTING BROKER:
${agentName}
${agencyName ?? ""}
${agencyAfsl ? `AFSL: ${agencyAfsl}` : ""}
${agentEmail}
${agentPhone ?? ""}
  `.trim();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = response.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");

  const cleaned = raw.text
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  return JSON.parse(cleaned) as SubmissionOutput;
}
