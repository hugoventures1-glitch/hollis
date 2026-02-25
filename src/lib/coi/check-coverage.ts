import { getAnthropicClient } from "@/lib/anthropic/client";
import type { CoverageSnapshot, CoverageCheckResult } from "@/types/coi";

interface Requirements {
  coverage_types: string[];
  required_gl_per_occurrence?: number | null;
  required_gl_aggregate?: number | null;
  required_auto_combined_single?: number | null;
  required_umbrella_each_occurrence?: number | null;
  required_umbrella_aggregate?: number | null;
  required_wc_el_each_accident?: number | null;
  additional_insured_language?: string | null;
}

function fmt(n: number | null | undefined) {
  return n ? `$${n.toLocaleString()}` : "none specified";
}

export async function checkCoverage(
  coverage: CoverageSnapshot,
  requirements: Requirements
): Promise<CoverageCheckResult> {
  const client = getAnthropicClient();

  const coverageSummary = [
    coverage.gl?.enabled &&
      `GL (${coverage.gl.claims_made ? "Claims-Made" : "Occurrence"}): ` +
        `Each Occurrence ${fmt(coverage.gl.each_occurrence)}, ` +
        `General Aggregate ${fmt(coverage.gl.general_aggregate)}, ` +
        `Products Agg ${fmt(coverage.gl.products_comp_ops_agg)}`,
    coverage.auto?.enabled &&
      `Auto (${[
        coverage.auto.any_auto && "Any Auto",
        coverage.auto.owned_autos_only && "Owned",
        coverage.auto.hired_autos_only && "Hired",
        coverage.auto.non_owned_autos_only && "Non-Owned",
      ]
        .filter(Boolean)
        .join(", ")}): CSL ${fmt(coverage.auto.combined_single_limit)}`,
    coverage.umbrella?.enabled &&
      `${coverage.umbrella.is_umbrella ? "Umbrella" : "Excess"}: ` +
        `Each Occurrence ${fmt(coverage.umbrella.each_occurrence)}, ` +
        `Aggregate ${fmt(coverage.umbrella.aggregate)}`,
    coverage.wc?.enabled &&
      `Workers Comp: EL Each Accident ${fmt(coverage.wc.el_each_accident)}, ` +
        `Disease Policy ${fmt(coverage.wc.el_disease_policy_limit)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const requirementsSummary = [
    requirements.coverage_types.length > 0 &&
      `Required types: ${requirements.coverage_types.join(", ")}`,
    requirements.required_gl_per_occurrence &&
      `GL Per Occurrence minimum: ${fmt(requirements.required_gl_per_occurrence)}`,
    requirements.required_gl_aggregate &&
      `GL General Aggregate minimum: ${fmt(requirements.required_gl_aggregate)}`,
    requirements.required_auto_combined_single &&
      `Auto CSL minimum: ${fmt(requirements.required_auto_combined_single)}`,
    requirements.required_umbrella_each_occurrence &&
      `Umbrella Each Occurrence minimum: ${fmt(requirements.required_umbrella_each_occurrence)}`,
    requirements.required_umbrella_aggregate &&
      `Umbrella Aggregate minimum: ${fmt(requirements.required_umbrella_aggregate)}`,
    requirements.required_wc_el_each_accident &&
      `WC EL Each Accident minimum: ${fmt(requirements.required_wc_el_each_accident)}`,
    requirements.additional_insured_language &&
      `Additional insured language: ${requirements.additional_insured_language}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are an insurance coverage compliance expert reviewing a Certificate of Insurance.

COVERAGE PROVIDED:
${coverageSummary || "No coverage data provided"}

REQUIREMENTS:
${requirementsSummary || "No specific requirements"}

Check if the provided coverage satisfies all requirements. Look for:
1. Missing required coverage types
2. Limits below minimum requirements
3. Coverage types enabled but with null/missing limits
4. Policies with no effective/expiration dates set
5. Any other compliance issues

Respond ONLY with valid JSON:
{
  "passed": boolean,
  "gaps": ["concise gap description", ...],
  "notes": "one-sentence overall assessment"
}`;

  const message = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");

  const jsonText = raw.text
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  return JSON.parse(jsonText) as CoverageCheckResult;
}
