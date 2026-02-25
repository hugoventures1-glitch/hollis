/**
 * GET /api/coi/agent-info?id={agentId}
 * Public endpoint — returns basic agency info for the public portal.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("id");

  if (!agentId) {
    return NextResponse.json({ error: "Missing agent id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify user exists
  const { data: userData } = await supabase.auth.admin.getUserById(agentId);
  if (!userData?.user) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Get agency name
  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("user_id", agentId)
    .single();

  return NextResponse.json({
    agent_id: agentId,
    agency_name: agency?.name ?? "Insurance Agency",
    email: userData.user.email,
  });
}
