/**
 * POST /api/import/analyse
 *
 * Accepts parsed spreadsheet data and returns an AI-generated column mapping
 * using Claude Haiku. Used by the Full Book Import flow.
 *
 * Body: {
 *   sheetNames:  string[]
 *   headers:     string[]
 *   sampleRows:  Record<string, string>[]   (first 5 rows)
 *   totalRows:   number
 * }
 *
 * Returns: AI mapping JSON (confidence, detected_system, summary, column_mapping, ...)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert insurance data analyst specialising in Australian broking systems, particularly WinBEAT, Sunrise, Insight, and Applied Epic exports.

You will receive raw spreadsheet data extracted from an insurance broker's AMS export. Your job is to analyse the headers and sample rows and return a structured JSON mapping that identifies every recognisable insurance data field.

CRITICAL COUNTING RULE: The user message will include pre-computed counts (total_rows, unique_clients, renewals_in_next_90_days, overdue_renewals) derived from the FULL dataset by the client application. You MUST copy these numbers verbatim into your summary object. Do NOT re-estimate, re-count, or extrapolate from the 5-row sample. These are ground-truth values.

Return ONLY a valid JSON object. No explanation, no markdown, no preamble.

Return this exact structure:
{
  "confidence": "high" | "medium" | "low",
  "detected_system": "WinBEAT" | "Sunrise" | "Applied Epic" | "Insight" | "Unknown",
  "summary": {
    "total_rows": number,
    "clients_detected": number,
    "policies_detected": number,
    "renewals_in_90_days": number,
    "overdue_renewals": number
  },
  "column_mapping": {
    "client_name": "exact column header or null",
    "client_abn": "exact column header or null",
    "client_email": "exact column header or null",
    "client_phone": "exact column header or null",
    "client_address": "exact column header or null",
    "policy_number": "exact column header or null",
    "policy_type": "exact column header or null",
    "insurer": "exact column header or null",
    "premium": "exact column header or null",
    "renewal_date": "exact column header or null",
    "inception_date": "exact column header or null",
    "expiry_date": "exact column header or null",
    "sum_insured": "exact column header or null",
    "coverage_description": "exact column header or null"
  },
  "ambiguous_columns": [
    { "header": "column name", "possible_meanings": ["option1", "option2"], "recommendation": "what it probably is" }
  ],
  "warnings": ["any data quality issues noticed"],
  "unmapped_columns": ["list of column headers that couldn't be identified"]
}

Be aggressive about mapping — use your knowledge of common AMS export formats.
WinBEAT commonly uses headers like: Client, Insured, Policy No, Pol No, Class, Product, Insurer, Premium, GST, Renewal, Renewal Date, R/D, Expiry, Inception, Sum Insured, Contact, Phone, Email, ABN.
Sunrise commonly uses: ClientName, PolicyNumber, ExpiryDate, InsurerName, GrossPremium, ClassOfBusiness.
Map partial matches and abbreviated headers confidently. Only mark as ambiguous if genuinely unclear.`;

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    sheetNames: string[];
    headers: string[];
    sampleRows: Record<string, string>[];
    totalRows: number;
    uniqueClients: number | null;
    renewalsIn90Days: number | null;
    overdueRenewals: number | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    sheetNames = [],
    headers = [],
    sampleRows = [],
    totalRows = 0,
    uniqueClients = null,
    renewalsIn90Days = null,
    overdueRenewals = null,
  } = body;

  if (!headers.length) {
    return NextResponse.json({ error: "No headers provided" }, { status: 400 });
  }

  // Pre-computed ground-truth counts (derived from full dataset by the client)
  const factsBlock =
    `PRE-COMPUTED FACTS (copy verbatim into summary — do NOT re-estimate):\n` +
    `  total_rows: ${totalRows}\n` +
    `  unique_clients: ${uniqueClients ?? "unknown"}\n` +
    `  renewals_in_next_90_days: ${renewalsIn90Days ?? "unknown"}\n` +
    `  overdue_renewals: ${overdueRenewals ?? "unknown"}\n\n`;

  const userMessage =
    factsBlock +
    `Sheet names: ${JSON.stringify(sheetNames)}\n` +
    `Headers: ${JSON.stringify(headers)}\n` +
    `Sample rows (first 5 only — use PRE-COMPUTED FACTS above for all counts): ${JSON.stringify(sampleRows)}`;

  try {
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Strip any accidental markdown fences
    const jsonStr = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const mapping = JSON.parse(jsonStr);
    return NextResponse.json(mapping);
  } catch (err) {
    console.error("[import/analyse] Error:", err);
    return NextResponse.json(
      { error: "AI analysis failed — please try again" },
      { status: 500 }
    );
  }
}
