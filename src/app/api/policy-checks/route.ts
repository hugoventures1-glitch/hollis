/**
 * GET  /api/policy-checks — list all checks for the authenticated user
 * POST /api/policy-checks — create a new (pending) check shell
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("policy_checks")
    .select("*, clients(id, name, business_type, industry), policy_check_flags(severity, annotation_status)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { client_id?: string };

  // If a client_id is provided, verify it belongs to this user and pull context
  let client_business_type: string | null = null;
  let client_industry: string | null = null;

  if (body.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("id, business_type, industry")
      .eq("id", body.client_id)
      .eq("user_id", user.id)
      .single();

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    client_business_type = client.business_type;
    client_industry = client.industry;
  }

  const { data, error } = await supabase
    .from("policy_checks")
    .insert({
      user_id: user.id,
      client_id: body.client_id ?? null,
      client_business_type,
      client_industry,
      overall_status: "pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
