/**
 * POST /api/policy-checks/[id]/analyze
 *
 * Reads all successfully extracted documents for this check, fetches the
 * client coverage profile, runs Claude comparison, and stores flags.
 *
 * Idempotent — deletes and re-inserts flags on each call (safe to retry).
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzePolicyCheck } from "@/lib/policy-checker/analyze";
import type {
  ClientCoverageProfile,
  ClientContext,
  ExtractedPolicyData,
  FlagConfidence,
  SummaryVerdict,
  RawFlag,
} from "@/types/policies";

type RouteParams = { params: Promise<{ id: string }> };

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
    .select("id, extracted_data, extraction_status")
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

  if (check.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("*, client_coverage_profiles(*)")
      .eq("id", check.client_id)
      .eq("user_id", user.id)
      .single();

    if (client) {
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

      await supabase.from("policy_check_flags").insert(flagInserts);
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
    await supabase
      .from("policy_checks")
      .update({
        overall_status: "complete",
        summary_verdict,
        overall_confidence,
        client_profile_snapshot: profile ?? null,
        client_business_type: clientContext.business_type,
        client_industry: clientContext.industry,
      })
      .eq("id", checkId)
      .eq("user_id", user.id);

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
