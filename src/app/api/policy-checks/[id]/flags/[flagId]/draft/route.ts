/**
 * POST /api/policy-checks/[id]/flags/[flagId]/draft
 *
 * Generates a professional message draft for the suggested action on a flag.
 * Uses Claude Haiku for fast, cost-efficient generation.
 *
 * Body: { draft_prompt, action_type, client_name, carrier? }
 * Returns: { draft: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { ActionType } from "@/types/policies";

type RouteParams = { params: Promise<{ id: string; flagId: string }> };

interface DraftBody {
  draft_prompt: string;
  action_type: ActionType;
  client_name: string;
  carrier?: string | null;
}

const DRAFT_SYSTEM_PROMPTS: Record<ActionType, string> = {
  email_client: `You are an experienced insurance agent drafting a professional email to a client about a policy issue. Write in a clear, helpful, and non-alarmist tone. The email should:
- Open with a brief context-setting sentence
- Clearly explain the issue found and why it matters
- State exactly what the client needs to do or provide
- Close with a professional sign-off placeholder: "[Your Name]"
- Be concise (150–250 words)
- Use plain English — avoid excessive jargon`,

  email_carrier: `You are an experienced insurance agent drafting a professional email to an insurance carrier requesting a policy correction, endorsement, or document. The email should:
- Open with the policy number and insured name as context
- Clearly describe what is needed and why (contractual or regulatory requirement)
- State a reasonable response deadline (use "within 5 business days" unless context suggests otherwise)
- Be direct and professional in tone
- Close with a placeholder: "[Agent Name] | [Agency Name]"
- Be concise (100–200 words)`,

  request_document: `You are an experienced insurance agent drafting a professional request for a missing insurance document or certificate. The request should:
- Identify the specific document needed
- Explain who should provide it and to whom
- Give context for why it's needed
- Request a response within a reasonable timeframe ("within 3 business days")
- Be concise and professional (100–180 words)
- Close with: "[Your Name]"`,

  internal_note: `You are an insurance agency assistant creating an internal file note documenting a policy issue and recommended next steps. The note should:
- Start with "FILE NOTE —" followed by today's context
- Describe the issue objectively
- Document what action was or should be taken
- Note any follow-up items
- Be concise (50–120 words)
- Do NOT include salutations or sign-offs (this is an internal record)`,
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: checkId, flagId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify flag belongs to this user's check
  const { data: flag } = await supabase
    .from("policy_check_flags")
    .select("id, draft_prompt, action_type")
    .eq("id", flagId)
    .eq("policy_check_id", checkId)
    .eq("user_id", user.id)
    .single();

  if (!flag) {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }

  const body: DraftBody = await request.json();
  const { draft_prompt, action_type, client_name, carrier } = body;

  if (!draft_prompt?.trim()) {
    return NextResponse.json({ error: "draft_prompt is required" }, { status: 400 });
  }

  const validActionTypes: ActionType[] = ["email_client", "email_carrier", "internal_note", "request_document"];
  if (!action_type || !validActionTypes.includes(action_type)) {
    return NextResponse.json(
      { error: `action_type must be one of: ${validActionTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const systemPrompt = DRAFT_SYSTEM_PROMPTS[action_type];

  const userMessage = [
    `Client: ${client_name ?? "the insured"}`,
    carrier ? `Carrier: ${carrier}` : null,
    ``,
    `Task: ${draft_prompt}`,
  ]
    .filter(l => l !== null)
    .join("\n");

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const draft =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[flags/draft] Claude call failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Draft generation failed" },
      { status: 500 }
    );
  }
}
