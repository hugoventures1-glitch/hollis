/**
 * POST /api/actions/coi/request/[clientId]
 *
 * Creates a pre-populated COI request for a client using their most recent
 * active policy. Returns the new request ID so the caller can navigate directly
 * into the COI generation flow.
 *
 * Returns:
 *   { success: true, requestId: string }
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Fetch client (verify ownership) ──────────────────────────────────────
  const { data: clientData, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, email, phone")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();

  if (clientErr || !clientData) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // ── Fetch their most recent active policy ─────────────────────────────────
  // Match by client name since clients and policies aren't formally linked yet
  const { data: policyData } = await supabase
    .from("policies")
    .select("id, policy_name, carrier, expiration_date, coverage_data")
    .eq("user_id", user.id)
    .eq("status", "active")
    .ilike("client_name", clientData.name)
    .order("expiration_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Derive coverage types from policy coverage_data if available ──────────
  const coverageTypes: string[] = [];
  if (policyData?.coverage_data) {
    const cd = policyData.coverage_data as Record<string, unknown>;
    if (cd.gl) coverageTypes.push("general_liability");
    if (cd.auto) coverageTypes.push("auto");
    if (cd.umbrella) coverageTypes.push("umbrella");
    if (cd.wc) coverageTypes.push("workers_comp");
  }

  // ── Create COI request ────────────────────────────────────────────────────
  const { data: req, error: reqErr } = await supabase
    .from("coi_requests")
    .insert({
      agent_id: user.id,
      requester_name: clientData.name,
      requester_email: clientData.email ?? "",
      insured_name: clientData.name,
      holder_name: "To Be Determined",
      coverage_types: coverageTypes,
      status: "pending",
    })
    .select("id")
    .single();

  if (reqErr || !req) {
    return NextResponse.json(
      { error: reqErr?.message ?? "Failed to create COI request" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, requestId: req.id });
}
