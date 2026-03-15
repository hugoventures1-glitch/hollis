/**
 * POST /api/policy-checks/[id]/analyze
 *
 * Reads all successfully extracted documents for this check, fetches the
 * client coverage profile, runs Claude comparison, and stores flags.
 *
 * After flags are stored a second batched Haiku call assigns a suggested
 * action (action_label, action_type, draft_prompt) to every flag in one
 * round-trip.
 *
 * Idempotent — deletes and re-inserts flags on each call (safe to retry).
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import { analyzePolicyCheck } from "@/lib/policy-checker/analyze";
import { logAction, retainStandard } from "@/lib/logAction";
import type {
  ActionType,
  ClientCoverageProfile,
  ClientContext,
  ExtractedPolicyData,
  FlagConfidence,
  PolicyCheckFlag,
  SummaryVerdict,
  RawFlag,
} from "@/types/policies";

type RouteParams = { params: Promise<{ id: string }> };

// ── Action suggestion prompt ────────────────────────────────────

const ACTION_SYSTEM_PROMPT = `You are an insurance agency operations assistant. Given a list of policy coverage flags found during a policy review, you will suggest ONE concrete next action for each flag that an insurance agent should take to resolve it.

For each flag return:
- action_label: short imperative sentence (max 8 words), e.g. "Email client to request updated endorsement"
- action_type: one of: email_client | email_carrier | internal_note | request_document
- draft_prompt: a detailed instruction telling a draft-writing AI exactly what message to produce. Include: who the recipient is (client or carrier), the specific issue, what needs to be resolved, and any relevant policy details already known. This will be passed verbatim to Claude to generate the message draft.

Rules:
- action_type = email_client when the insured/client needs to take action or be informed
- action_type = email_carrier when the carrier must issue an endorsement, correct an error, or provide documentation
- action_type = request_document when a missing certificate, schedule, or form is needed (from either party)
- action_type = internal_note for advisory items that need only an internal record
- Keep action_label concise and direct — agents will see this as a chip on the flag card
- draft_prompt must be rich enough that a follow-up AI call can produce a professional, specific message without any additional context

Return a JSON array in EXACTLY the same order as the input flags array, one object per flag. No extra text.

Example output:
[
  {
    "action_label": "Email carrier to add required endorsement",
    "action_type": "email_carrier",
    "draft_prompt": "Write a professional email to the carrier requesting that they add CG 20 10 Additional Insured – Ongoing Operations endorsement to policy [POLICY_NUMBER]. The client [CLIENT_NAME] has a contractual requirement for this endorsement. Request that the endorsement be issued with a retroactive date matching the policy effective date."
  }
]`;

interface ActionSuggestion {
  action_label: string;
  action_type: ActionType;
  draft_prompt: string;
}

async function suggestFlagActions(
  flags: Pick<PolicyCheckFlag, "id" | "title" | "what_found" | "what_expected" | "why_it_matters" | "flag_type" | "severity" | "coverage_line">[],
  clientName: string,
  carrier: string | null,
): Promise<ActionSuggestion[]> {
  if (flags.length === 0) return [];

  const anthropic = getAnthropicClient();

  const flagsPayload = flags.map((f, i) => ({
    index: i,
    flag_type: f.flag_type,
    severity: f.severity,
    coverage_line: f.coverage_line,
    title: f.title,
    what_found: f.what_found,
    what_expected: f.what_expected,
    why_it_matters: f.why_it_matters,
  }));

  const userMessage = [
    `Client name: ${clientName}`,
    carrier ? `Carrier: ${carrier}` : null,
    ``,
    `Flags (${flags.length} total):`,
    JSON.stringify(flagsPayload, null, 2),
  ]
    .filter(l => l !== null)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: ACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "[]";

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();

  let suggestions: ActionSuggestion[] = [];
  try {
    suggestions = JSON.parse(cleaned) as ActionSuggestion[];
  } catch {
    console.error("[analyze/suggestFlagActions] Failed to parse suggestions:", raw);
    // Return empty suggestions — non-fatal
    return flags.map(() => ({
      action_label: "Review flag manually",
      action_type: "internal_note" as ActionType,
      draft_prompt: "",
    }));
  }

  // Ensure we have one entry per flag (pad if Claude returned fewer)
  while (suggestions.length < flags.length) {
    suggestions.push({
      action_label: "Review flag manually",
      action_type: "internal_note" as ActionType,
      draft_prompt: "",
    });
  }

  return suggestions.slice(0, flags.length);
}

// ── Route handler ───────────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id: checkId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify check belongs to this user and fetch it
  const { data: check } = await supabase
    .from("policy_checks")
    .select("id, client_id, client_business_type, client_industry")
    .eq("id", checkId)
    .eq("user_id", user.id)
    .single();

  if (!check) return NextResponse.json({ error: "Check not found" }, { status: 404 });

  // Fetch successfully extracted documents
  const { data: docs } = await supabase
    .from("policy_check_documents")
    .select("id, extracted_data, extraction_status, extracted_carrier")
    .eq("policy_check_id", checkId)
    .eq("extraction_status", "complete");

  const completedDocs = (docs ?? []).filter(d => d.extracted_data !== null);

  if (completedDocs.length === 0) {
    return NextResponse.json(
      { error: "No documents were extracted successfully. Upload and extract documents before analyzing." },
      { status: 422 }
    );
  }

  // Mark check as processing
  await supabase
    .from("policy_checks")
    .update({ overall_status: "processing" })
    .eq("id", checkId)
    .eq("user_id", user.id);

  // Fetch client + profile if a client is linked
  let profile: ClientCoverageProfile | null = null;
  let clientContext: ClientContext = {
    business_type: check.client_business_type,
    industry: check.client_industry,
    owns_vehicles: false,
    num_employees: null,
    business_activities: null,
  };
  let clientName = "the insured";

  if (check.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("*, client_coverage_profiles(*)")
      .eq("id", check.client_id)
      .eq("user_id", user.id)
      .single();

    if (client) {
      clientName = client.name ?? "the insured";
      clientContext = {
        business_type: client.business_type,
        industry: client.industry,
        owns_vehicles: client.owns_vehicles,
        num_employees: client.num_employees,
        business_activities: client.client_coverage_profiles?.[0]?.business_activities ?? null,
      };

      const profiles = client.client_coverage_profiles as ClientCoverageProfile[] | undefined;
      profile = profiles?.[0] ?? null;
    }
  }

  // Best-guess carrier from first extracted doc
  const carrier: string | null =
    (completedDocs[0]?.extracted_carrier as string | null) ?? null;

  try {
    // Run Claude comparison
    const extractedData = completedDocs.map(d => d.extracted_data as ExtractedPolicyData);
    const rawFlags: RawFlag[] = await analyzePolicyCheck(extractedData, profile, clientContext);

    // Delete any existing flags for this check (idempotent re-run)
    await supabase
      .from("policy_check_flags")
      .delete()
      .eq("policy_check_id", checkId)
      .eq("user_id", user.id);

    // Insert new flags
    let insertedFlags: PolicyCheckFlag[] = [];
    if (rawFlags.length > 0) {
      const flagInserts = rawFlags.map(f => ({
        policy_check_id: checkId,
        user_id: user.id,
        flag_type: f.flag_type,
        coverage_line: f.coverage_line ?? null,
        severity: f.severity,
        confidence: f.confidence,
        title: f.title,
        what_found: f.what_found,
        what_expected: f.what_expected,
        why_it_matters: f.why_it_matters,
        sort_order: f.sort_order,
      }));

      const { data: inserted } = await supabase
        .from("policy_check_flags")
        .insert(flagInserts)
        .select();

      insertedFlags = (inserted ?? []) as PolicyCheckFlag[];

      // ── Batched action suggestions ─────────────────────────
      if (insertedFlags.length > 0) {
        try {
          const suggestions = await suggestFlagActions(insertedFlags, clientName, carrier);

          // Bulk update each flag with its suggested action
          await Promise.all(
            insertedFlags.map((flag, i) => {
              const s = suggestions[i];
              if (!s) return Promise.resolve();
              return supabase
                .from("policy_check_flags")
                .update({
                  action_label: s.action_label,
                  action_type: s.action_type,
                  draft_prompt: s.draft_prompt,
                })
                .eq("id", flag.id)
                .eq("user_id", user.id);
            })
          );
        } catch (actionErr) {
          // Non-fatal — flags still exist, they just won't have action suggestions
          console.error("[analyze] Action suggestion call failed (non-fatal):", actionErr);
        }
      }
    }

    // Derive overall verdict and confidence
    const hasCritical = rawFlags.some(f => f.severity === "critical");
    const hasWarning  = rawFlags.some(f => f.severity === "warning");
    const hasLow      = rawFlags.some(f => f.confidence === "low");
    const hasMedium   = rawFlags.some(f => f.confidence === "medium");

    const summary_verdict: SummaryVerdict = hasCritical
      ? "critical_issues"
      : hasWarning
      ? "issues_found"
      : "all_clear";

    const overall_confidence: FlagConfidence = hasLow
      ? "low"
      : hasMedium
      ? "medium"
      : "high";

    // Snapshot the profile for training data
    const requiresReview = overall_confidence === "low";
    await supabase
      .from("policy_checks")
      .update({
        overall_status: "complete",
        summary_verdict,
        overall_confidence,
        requires_review: requiresReview,
        client_profile_snapshot: profile ?? null,
        client_business_type: clientContext.business_type,
        client_industry: clientContext.industry,
      })
      .eq("id", checkId)
      .eq("user_id", user.id);

    void logAction({
      broker_id: user.id,
      client_id: check.client_id ?? null,
      action_type: "policy_check",
      trigger_reason: `Policy coverage analysis completed for ${clientName} — ${rawFlags.length} flag${rawFlags.length !== 1 ? "s" : ""} found (verdict: ${summary_verdict}).`,
      payload: { channel: "internal" },
      metadata: {
        check_id: checkId,
        client_id: check.client_id ?? null,
        flag_count: rawFlags.length,
        critical_count: rawFlags.filter(f => f.severity === "critical").length,
        summary_verdict,
        overall_confidence,
        carrier: carrier ?? null,
        business_type: clientContext.business_type ?? null,
        industry: clientContext.industry ?? null,
      },
      outcome: "sent",
      retain_until: retainStandard(),
    });

    return NextResponse.json({
      check_id: checkId,
      summary_verdict,
      overall_confidence,
      flag_count: rawFlags.length,
      critical_count: rawFlags.filter(f => f.severity === "critical").length,
    });

  } catch (err) {
    console.error("[policy-checks/analyze] Analysis failed:", err);

    await supabase
      .from("policy_checks")
      .update({ overall_status: "failed" })
      .eq("id", checkId)
      .eq("user_id", user.id);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
