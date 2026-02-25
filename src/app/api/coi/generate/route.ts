/**
 * POST /api/coi/generate
 * Auth required. Runs Claude coverage check, creates certificate record.
 * Body: GenerateCOIInput
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCoverage } from "@/lib/coi/check-coverage";
import type { GenerateCOIInput } from "@/types/coi";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: GenerateCOIInput;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!input.insured_name || !input.holder_name || !input.coverage_snapshot) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Claude coverage gap check ─────────────────────────────
  let coverageCheckResult = null;
  let hasGap = false;
  let gapDetails: string[] = [];

  if (input.requirements && input.requirements.coverage_types.length > 0) {
    try {
      coverageCheckResult = await checkCoverage(
        input.coverage_snapshot,
        input.requirements
      );
      hasGap = !coverageCheckResult.passed;
      gapDetails = coverageCheckResult.gaps;
    } catch (err) {
      console.error("[coi/generate] Coverage check failed:", err);
      // Non-fatal — proceed without check
    }
  }

  // ── Derive effective/expiration dates from coverage ───────
  const allDates = [
    input.coverage_snapshot.gl?.expiration,
    input.coverage_snapshot.auto?.expiration,
    input.coverage_snapshot.umbrella?.expiration,
    input.coverage_snapshot.wc?.expiration,
  ].filter((d): d is string => !!d);

  const allEffective = [
    input.coverage_snapshot.gl?.effective,
    input.coverage_snapshot.auto?.effective,
    input.coverage_snapshot.umbrella?.effective,
    input.coverage_snapshot.wc?.effective,
  ].filter((d): d is string => !!d);

  const earliestEffective = allEffective.sort()[0] ?? null;
  const latestExpiration = allDates.sort().reverse()[0] ?? null;

  // ── Create certificate ────────────────────────────────────
  const { data: cert, error } = await supabase
    .from("certificates")
    .insert({
      user_id: user.id,
      request_id: input.request_id ?? null,
      policy_id: input.policy_id ?? null,
      insured_name: input.insured_name,
      insured_address: input.insured_address ?? null,
      producer_name: input.producer_name ?? null,
      producer_address: input.producer_address ?? null,
      producer_phone: input.producer_phone ?? null,
      producer_email: input.producer_email ?? null,
      holder_name: input.holder_name,
      holder_address: input.holder_address ?? null,
      holder_city: input.holder_city ?? null,
      holder_state: input.holder_state ?? null,
      holder_zip: input.holder_zip ?? null,
      holder_email: input.holder_email ?? null,
      additional_insured_language: input.additional_insured_language ?? null,
      coverage_snapshot: input.coverage_snapshot,
      description: input.description ?? null,
      status: "draft",
      has_gap: hasGap,
      gap_details: gapDetails.length > 0 ? gapDetails : null,
      effective_date: earliestEffective ?? null,
      expiration_date: latestExpiration ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[coi/generate] Insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Link request to certificate (if applicable) ───────────
  if (input.request_id) {
    await supabase
      .from("coi_requests")
      .update({
        certificate_id: cert.id,
        status: "approved",
        coverage_check_result: coverageCheckResult,
      })
      .eq("id", input.request_id)
      .eq("agent_id", user.id);
  }

  return NextResponse.json({
    certificate: cert,
    coverage_check: coverageCheckResult,
  });
}
