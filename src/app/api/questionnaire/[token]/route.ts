/**
 * GET  /api/questionnaire/[token]  — fetch questionnaire for client (public)
 * POST /api/questionnaire/[token]  — submit client responses (public)
 *
 * These routes are PUBLIC — no authentication required.
 * Uses the admin client (service role) for all DB operations.
 * Returns ONLY what the client needs — never exposes user_id or broker details.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseQuestionnaireResponses, QUESTIONNAIRE_QUESTIONS } from "@/lib/renewals/questionnaire";
import { writeAuditLog } from "@/lib/audit/log";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: questionnaire, error } = await supabase
    .from("renewal_questionnaires")
    .select("id, status, responded_at, expires_at, policy_id, policies(policy_name, client_name, carrier)")
    .eq("token", token)
    .single();

  if (error || !questionnaire) {
    return NextResponse.json({ error: "Questionnaire not found" }, { status: 404 });
  }

  // Safe client-facing response — no user_id, no token in response
  return NextResponse.json({
    status: questionnaire.status,
    responded_at: questionnaire.responded_at,
    expires_at: questionnaire.expires_at,
    policy_name: (questionnaire.policies as unknown as Record<string, string> | null)?.policy_name ?? null,
    client_name: (questionnaire.policies as unknown as Record<string, string> | null)?.client_name ?? null,
    carrier: (questionnaire.policies as unknown as Record<string, string> | null)?.carrier ?? null,
    questions: QUESTIONNAIRE_QUESTIONS.map(({ key, label, placeholder }) => ({ key, label, placeholder })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();

  // Look up questionnaire by token
  const { data: questionnaire, error: qErr } = await supabase
    .from("renewal_questionnaires")
    .select("id, status, expires_at, policy_id, user_id, policies(policy_name, client_name, carrier, expiration_date, premium)")
    .eq("token", token)
    .single();

  if (qErr || !questionnaire) {
    return NextResponse.json({ error: "Questionnaire not found" }, { status: 404 });
  }

  if (questionnaire.status === "responded") {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  if (new Date(questionnaire.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from("renewal_questionnaires")
      .update({ status: "expired" })
      .eq("id", questionnaire.id);
    return NextResponse.json({ error: "Questionnaire has expired" }, { status: 410 });
  }

  const body = await request.json();
  const responses = body.responses as Record<string, string>;

  if (!responses || typeof responses !== "object") {
    return NextResponse.json({ error: "responses is required" }, { status: 400 });
  }

  // Parse responses with Claude Haiku
  let aiSuggestions = null;
  try {
    const policyData = questionnaire.policies as unknown as Record<string, unknown> | null;
    if (policyData) {
      aiSuggestions = await parseQuestionnaireResponses(
        {
          id: questionnaire.policy_id,
          policy_name: String(policyData.policy_name ?? ""),
          client_name: String(policyData.client_name ?? ""),
          carrier: String(policyData.carrier ?? ""),
          expiration_date: String(policyData.expiration_date ?? ""),
          premium: policyData.premium as number | null,
          user_id: questionnaire.user_id,
          status: "active",
          campaign_stage: "questionnaire_sent",
          created_at: "",
          updated_at: "",
        },
        responses
      );
    }
  } catch (err) {
    console.error("[questionnaire/submit] Claude parsing failed:", err instanceof Error ? err.message : err);
    // Non-fatal — continue with null suggestions
  }

  // Update questionnaire record
  await supabase
    .from("renewal_questionnaires")
    .update({
      status: "responded",
      responded_at: new Date().toISOString(),
      responses,
      ai_suggestions: aiSuggestions,
    })
    .eq("id", questionnaire.id);

  // Write audit log (using admin client — passes user_id explicitly)
  const responseSnapshot = QUESTIONNAIRE_QUESTIONS
    .map((q) => `Q: ${q.label}\nA: ${responses[q.key] || "(no answer)"}`)
    .join("\n\n");

  await writeAuditLog({
    supabase,
    policy_id: questionnaire.policy_id,
    user_id: questionnaire.user_id,
    event_type: "questionnaire_responded",
    channel: "web",
    content_snapshot: responseSnapshot,
    metadata: {
      questionnaire_id: questionnaire.id,
      has_ai_suggestions: aiSuggestions !== null,
      risk_flags: (aiSuggestions as Record<string, unknown> | null)?.risk_flags ?? [],
    },
    actor_type: "system",
  });

  return NextResponse.json({ success: true });
}
