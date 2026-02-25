/**
 * POST /api/coi/request
 * Public endpoint — no auth required.
 * Creates a COI request from the agent's portal page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CoverageType } from "@/types/coi";

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
  const missing = (["agent_id", "requester_name", "requester_email", "insured_name", "holder_name"] as const)
    .filter(f => !body[f]?.toString().trim());

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

  return NextResponse.json({ success: true, request_id: data.id }, { status: 201 });
}
