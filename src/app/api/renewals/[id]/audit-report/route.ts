/**
 * GET /api/renewals/[id]/audit-report
 *
 * Returns the full renewal audit log for a policy, chronologically ordered.
 * This is the data feed for the printable audit report (Feature 4).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch policy (ownership check)
  const { data: policy, error: policyErr } = await supabase
    .from("policies")
    .select("id, policy_name, client_name, carrier, expiration_date, campaign_stage, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (policyErr || !policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  // Fetch audit log entries
  const { data: events, error: eventsErr } = await supabase
    .from("renewal_audit_log")
    .select("*")
    .eq("policy_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 });

  return NextResponse.json({
    policy,
    events: events ?? [],
    generated_at: new Date().toISOString(),
    total_events: (events ?? []).length,
  });
}
