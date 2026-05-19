/**
 * GET /api/hollis-actions
 * Returns paginated hollis_actions for the authenticated broker.
 *
 * Query params:
 *   limit   – records per page (default 50)
 *   offset  – starting record (default 0)
 *   group   – filter tab id: "all" | "renewals" | "doc_chase" | "coi" | "policy_check"
 *   search  – partial match against policy_name or client_name
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GROUP_TYPES: Record<string, string[]> = {
  renewals:     ["renewal_email","renewal_sms","renewal_intent_classified","renewal_stage_transition","renewal_halted","approval_queued","escalation","silence_detected"],
  doc_chase:    ["doc_chase_email","doc_chase_sms","doc_chase_escalated"],
  coi:          ["coi_generated"],
  policy_check: ["policy_check"],
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "50", 10), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0",  10), 0);
  const group  = searchParams.get("group") ?? "all";
  const search = searchParams.get("search")?.trim() ?? "";

  let query = supabase
    .from("hollis_actions")
    .select(`*, policies ( policy_name, client_name )`)
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (group !== "all" && GROUP_TYPES[group]) {
    query = query.in("action_type", GROUP_TYPES[group]);
  }

  // Search by policy name — fetch a superset and let the join do the work.
  // Supabase doesn't support ilike on joined columns, so we filter client-side
  // after a tighter server fetch when search is active.
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Client-name / policy-name search (applied after fetch since join columns
  // can't be filtered server-side with ilike in Supabase PostgREST)
  const filtered = search
    ? rows.filter((a) => {
        const q = search.toLowerCase();
        const client = (a.policies?.client_name ?? "").toLowerCase();
        const policy = (a.policies?.policy_name ?? "").toLowerCase();
        return client.includes(q) || policy.includes(q);
      })
    : rows;

  // hasMore: if we got a full page back (before search filter), there may be more
  const hasMore = rows.length === limit;

  return NextResponse.json({ data: filtered, hasMore });
}
