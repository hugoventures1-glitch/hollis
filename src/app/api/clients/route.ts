/**
 * GET  /api/clients — list all clients for the authenticated user
 * POST /api/clients — create a new client
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("clients")
    .select("*, client_coverage_profiles(*)")
    .eq("user_id", user.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const allowed = [
    "name", "email", "phone", "business_type", "industry",
    "num_employees", "annual_revenue", "owns_vehicles",
    "num_locations", "primary_state", "notes",
  ] as const;

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = { user_id: user.id };
  for (const f of allowed) {
    if (f in body) insert[f] = body[f];
  }

  const { data, error } = await supabase
    .from("clients")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
