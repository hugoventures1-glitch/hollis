/**
 * POST /api/coi/request
 * Public endpoint — no auth required.
 * Creates a COI request from the agent's portal page, then immediately
 * attempts zero-touch auto-generation:
 *   • Finds the matching active policy for the agent by insured_name.
 *   • Runs Claude coverage check against the policy's coverage_data.
 *   • If coverage passes → creates a draft certificate and sets request
 *     status = 'ready_for_approval' so the agent can approve with one click.
 *   • If coverage fails → sets status = 'needs_review' with gap notes.
 *   • Any error in the auto-generation path is swallowed; the request
 *     remains 'pending' so the agent can handle it manually as before.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCoverage } from "@/lib/coi/check-coverage";
import type { CoverageType, CoverageSnapshot } from "@/types/coi";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    agent_id,
    requester_name,
    requester_email,
    insured_name,
    holder_name,
    holder_address,
    holder_city,
    holder_state,
    holder_zip,
    coverage_types,
    required_gl_per_occurrence,
    required_gl_aggregate,
    required_auto_combined_single,
    required_umbrella_each_occurrence,
    required_umbrella_aggregate,
    required_wc_el_each_accident,
    additional_insured_language,
    project_description,
  } = body;

  // Validate required fields
  const missing = (
    ["agent_id", "requester_name", "requester_email", "insured_name", "holder_name"] as const
  ).filter((f) => !body[f]?.toString().trim());

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify agent exists
  const { data: user } = await supabase.auth.admin.getUserById(agent_id as string);
  if (!user?.user) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("coi_requests")
    .insert({
      agent_id,
      requester_name,
      requester_email,
      insured_name,
      holder_name,
      holder_address: holder_address || null,
      holder_city: holder_city || null,
      holder_state: holder_state || null,
      holder_zip: holder_zip || null,
      coverage_types: (coverage_types as CoverageType[]) || [],
      required_gl_per_occurrence: required_gl_per_occurrence || null,
      required_gl_aggregate: required_gl_aggregate || null,
      required_auto_combined_single: required_auto_combined_single || null,
      required_umbrella_each_occurrence: required_umbrella_each_occurrence || null,
      required_umbrella_aggregate: required_umbrella_aggregate || null,
      required_wc_el_each_accident: required_wc_el_each_accident || null,
      additional_insured_language: additional_insured_language || null,
      project_description: project_description || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[coi/request] Insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requestId = data.id;

  // ── Zero-touch auto-generation ───────────────────────────────────────────
  // Wrapped entirely in try/catch — any failure falls through gracefully,
  // leaving the request in 'pending' for manual handling.
  try {
    await attemptAutoGeneration({
      supabase,
      requestId,
      agentId: agent_id as string,
      insuredName: insured_name as string,
      holderName: holder_name as string,
      holderAddress: (holder_address as string) || null,
      holderCity: (holder_city as string) || null,
      holderState: (holder_state as string) || null,
      holderZip: (holder_zip as string) || null,
      coverageTypes: (coverage_types as CoverageType[]) || [],
      required_gl_per_occurrence: (required_gl_per_occurrence as number) || null,
      required_gl_aggregate: (required_gl_aggregate as number) || null,
      required_auto_combined_single: (required_auto_combined_single as number) || null,
      required_umbrella_each_occurrence:
        (required_umbrella_each_occurrence as number) || null,
      required_umbrella_aggregate: (required_umbrella_aggregate as number) || null,
      required_wc_el_each_accident: (required_wc_el_each_accident as number) || null,
      additional_insured_language: (additional_insured_language as string) || null,
      project_description: (project_description as string) || null,
    });
  } catch (autoErr) {
    // Non-fatal — leave status as 'pending' for manual handling
    console.warn(
      `[coi/request] Auto-generation failed for request ${requestId} — agent will handle manually:`,
      autoErr instanceof Error ? autoErr.message : autoErr
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ success: true, request_id: requestId }, { status: 201 });
}

// ── Auto-generation helper ────────────────────────────────────────────────

interface AutoGenParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createAdminClient>;
  requestId: string;
  agentId: string;
  insuredName: string;
  holderName: string;
  holderAddress: string | null;
  holderCity: string | null;
  holderState: string | null;
  holderZip: string | null;
  coverageTypes: CoverageType[];
  required_gl_per_occurrence: number | null;
  required_gl_aggregate: number | null;
  required_auto_combined_single: number | null;
  required_umbrella_each_occurrence: number | null;
  required_umbrella_aggregate: number | null;
  required_wc_el_each_accident: number | null;
  additional_insured_language: string | null;
  project_description: string | null;
}

async function attemptAutoGeneration(params: AutoGenParams) {
  const {
    supabase,
    requestId,
    agentId,
    insuredName,
    holderName,
    holderAddress,
    holderCity,
    holderState,
    holderZip,
    coverageTypes,
    required_gl_per_occurrence,
    required_gl_aggregate,
    required_auto_combined_single,
    required_umbrella_each_occurrence,
    required_umbrella_aggregate,
    required_wc_el_each_accident,
    additional_insured_language,
    project_description,
  } = params;

  // 1. Find a matching active policy for this agent + insured name
  const { data: policy } = await supabase
    .from("policies")
    .select("id, policy_name, client_name, coverage_data")
    .eq("user_id", agentId)
    .eq("status", "active")
    .ilike("client_name", insuredName)
    .limit(1)
    .maybeSingle();

  if (!policy) {
    console.log(
      `[coi/auto-gen] No active policy found for insured "${insuredName}" under agent ${agentId} — skipping`
    );
    return; // Not an error — just no match; request stays 'pending'
  }

  const coverageData = policy.coverage_data as CoverageSnapshot | null;
  if (!coverageData || Object.keys(coverageData).length === 0) {
    console.log(
      `[coi/auto-gen] Policy ${policy.id} has empty coverage_data — skipping`
    );
    return;
  }

  // 2. Build requirements object from the request fields
  const requirements = {
    coverage_types: coverageTypes,
    required_gl_per_occurrence: required_gl_per_occurrence ?? null,
    required_gl_aggregate: required_gl_aggregate ?? null,
    required_auto_combined_single: required_auto_combined_single ?? null,
    required_umbrella_each_occurrence: required_umbrella_each_occurrence ?? null,
    required_umbrella_aggregate: required_umbrella_aggregate ?? null,
    required_wc_el_each_accident: required_wc_el_each_accident ?? null,
    additional_insured_language: additional_insured_language ?? null,
  };

  // 3. Run Claude coverage check
  const checkResult = await checkCoverage(coverageData, requirements);

  if (!checkResult.passed) {
    // Coverage gaps — mark needs_review with human-readable notes
    const gapNotes =
      checkResult.gaps.length > 0
        ? checkResult.gaps.join("; ")
        : checkResult.notes;

    await supabase
      .from("coi_requests")
      .update({
        status: "needs_review",
        auto_generated: false,
        coverage_check_passed: false,
        coverage_check_notes: gapNotes,
        coverage_check_result: checkResult,
      })
      .eq("id", requestId);

    console.log(
      `[coi/auto-gen] Coverage check FAILED for request ${requestId} — needs_review. Gaps: ${gapNotes}`
    );
    return;
  }

  // 4. Coverage passes — derive effective/expiration dates from the snapshot
  const allExpiry = [
    coverageData.gl?.expiration,
    coverageData.auto?.expiration,
    coverageData.umbrella?.expiration,
    coverageData.wc?.expiration,
  ].filter((d): d is string => !!d);

  const allEffective = [
    coverageData.gl?.effective,
    coverageData.auto?.effective,
    coverageData.umbrella?.effective,
    coverageData.wc?.effective,
  ].filter((d): d is string => !!d);

  const earliestEffective = [...allEffective].sort()[0] ?? null;
  const latestExpiration = [...allExpiry].sort().reverse()[0] ?? null;

  // 5. Create the draft certificate (admin client bypasses RLS)
  const { data: cert, error: certErr } = await supabase
    .from("certificates")
    .insert({
      user_id: agentId,
      request_id: requestId,
      policy_id: policy.id,
      insured_name: insuredName,
      holder_name: holderName,
      holder_address: holderAddress,
      holder_city: holderCity,
      holder_state: holderState,
      holder_zip: holderZip,
      holder_email: null,
      additional_insured_language: additional_insured_language ?? null,
      coverage_snapshot: coverageData,
      description: project_description ?? null,
      status: "draft",
      has_gap: false,
      gap_details: null,
      effective_date: earliestEffective,
      expiration_date: latestExpiration,
    })
    .select("id")
    .single();

  if (certErr || !cert) {
    throw new Error(`Certificate insert failed: ${certErr?.message ?? "unknown error"}`);
  }

  // 6. Flip the request to ready_for_approval
  await supabase
    .from("coi_requests")
    .update({
      status: "ready_for_approval",
      auto_generated: true,
      coverage_check_passed: true,
      coverage_check_notes: checkResult.notes,
      coverage_check_result: checkResult,
      certificate_id: cert.id,
    })
    .eq("id", requestId);

  console.log(
    `[coi/auto-gen] ✓ Certificate ${cert.id} auto-generated for request ${requestId} — ready_for_approval`
  );
}
