/**
 * GET /api/policy-checks/[id]
 * Full check detail: documents + flags (ordered) + client name.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("policy_checks")
    .select(`
      *,
      clients(id, name, business_type, industry),
      policy_check_documents(*),
      policy_check_flags(*)
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sort documents by created_at, flags by sort_order
  if (Array.isArray(data.policy_check_documents)) {
    data.policy_check_documents.sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  if (Array.isArray(data.policy_check_flags)) {
    data.policy_check_flags.sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    );
  }

  return NextResponse.json(data);
}
