/**
 * GET /api/hollis-actions
 * Returns all hollis_actions for the authenticated broker,
 * joined with policy_name and client_name from the policies table.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("hollis_actions")
    .select(`
      *,
      policies ( policy_name, client_name )
    `)
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
