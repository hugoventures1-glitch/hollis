/**
 * GET /api/coi
 * Returns dashboard summary: pending requests + issued certificates.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [requestsRes, certsRes] = await Promise.all([
    supabase
      .from("coi_requests")
      .select("*")
      .eq("agent_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("certificates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    requests: requestsRes.data ?? [],
    certificates: certsRes.data ?? [],
  });
}
