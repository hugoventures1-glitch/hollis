/**
 * GET /api/clients/[id]/profile — fetch coverage profile (or null)
 * PUT /api/clients/[id]/profile — upsert coverage profile
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the client belongs to the user first
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("client_coverage_profiles")
    .select("*")
    .eq("client_id", id)
    .eq("user_id", user.id)
    .single();

  return NextResponse.json(profile ?? null);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the client belongs to the user
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  const allowed = [
    "expected_named_insured",
    "req_gl", "req_gl_each_occurrence", "req_gl_general_aggregate", "req_gl_products_agg",
    "req_auto", "req_auto_csl",
    "req_umbrella", "req_umbrella_each_occurrence", "req_umbrella_aggregate",
    "req_wc", "req_wc_el_each_accident",
    "req_pl", "req_pl_each_claim", "req_pl_aggregate",
    "req_cyber", "req_cyber_each_claim", "req_cyber_aggregate",
    "additional_insured_required", "waiver_of_subrogation", "primary_noncontributory",
    "contractual_notes", "business_activities",
  ] as const;

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    client_id: id,
  };

  for (const f of allowed) {
    if (f in body) upsertData[f] = body[f];
  }

  const { data, error } = await supabase
    .from("client_coverage_profiles")
    .upsert(upsertData, { onConflict: "client_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
