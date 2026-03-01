/**
 * GET /api/coi/holders/search
 * Returns matching certificate_holders for autofill suggestions.
 *
 * Query params:
 *   q        — search string (min 2 chars)
 *   agentId  — required when no authenticated session (portal use)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const QuerySchema = z.object({
  q: z.string().min(2, "Query must be at least 2 characters"),
  agentId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q") ?? "",
    agentId: searchParams.get("agentId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { q, agentId } = parsed.data;

  // Determine the agent/user ID to scope the search.
  // Dashboard: authenticated session → use session user.
  // Portal: no session → agentId param required.
  let userId: string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    userId = user.id;
  } else if (agentId) {
    // Portal path — verify agent exists via admin client
    const admin = createAdminClient();
    const { data: agentUser } = await admin.auth.admin.getUserById(agentId);
    if (!agentUser?.user) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    userId = agentId;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("certificate_holders")
    .select(
      "id, name, address, city, state, zip, email, usage_count, common_coverage_types, common_insured_names"
    )
    .eq("user_id", userId)
    .ilike("name", `%${q}%`)
    .order("usage_count", { ascending: false })
    .order("last_requested_at", { ascending: false, nullsFirst: false })
    .limit(8);

  if (error) {
    console.error("[holders/search] Query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ holders: data ?? [] });
}
