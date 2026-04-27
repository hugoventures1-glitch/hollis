/**
 * POST /api/import/identify-sheet
 *
 * Accepts all sheet names and first 3 rows of each sheet from an Excel file.
 * Uses Claude Haiku to semantically identify which sheet is the policy schedule.
 *
 * Body: {
 *   sheetNames:   string[]
 *   sheetSamples: Record<string, string[][]>  // sheet name → first 3 rows
 * }
 *
 * Returns: { sheetName: string | null, confidence: number, reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";

const SYSTEM_PROMPT = `You are analysing an Australian insurance broker's Excel export.

Your task: identify which sheet contains the policy schedule — a list of active insurance policies with columns like client name, policy type, insurer, premium, and renewal/expiry date.

Reject sheets that are: activity logs, audit trails, correspondence history, renewal event logs, summary dashboards, or any sheet without per-policy rows.

Return ONLY valid JSON — no explanation, no markdown:
{
  "sheetName": "exact sheet name from the input, or null if none qualifies",
  "confidence": 0.0 to 1.0,
  "reason": "one sentence explaining your choice or why none qualified"
}`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    sheetNames: string[];
    sheetSamples: Record<string, string[][]>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sheetNames = [], sheetSamples = {} } = body;

  if (!sheetNames.length) {
    return NextResponse.json({ error: "No sheet names provided" }, { status: 400 });
  }

  // Build a readable description of each sheet
  const sheetDescriptions = sheetNames
    .map((name) => {
      const rows = sheetSamples[name] ?? [];
      const rowText = rows
        .map((row, i) => `  Row ${i + 1}: ${JSON.stringify(row)}`)
        .join("\n");
      return `Sheet: "${name}"\n${rowText || "  (empty)"}`;
    })
    .join("\n\n");

  const userMessage = `Excel file sheets:\n\n${sheetDescriptions}`;

  try {
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const jsonStr = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const result = JSON.parse(jsonStr) as {
      sheetName: string | null;
      confidence: number;
      reason: string;
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[import/identify-sheet] Error:", err);
    return NextResponse.json(
      { error: "Sheet identification failed — please try again" },
      { status: 500 }
    );
  }
}
