/**
 * PATCH /api/renewals/[id]/insurer-terms/[termId]
 * Update is_recommended and/or notes on an insurer terms record.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; termId: string }> }
) {
  const { id, termId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.is_recommended === "boolean") updates.is_recommended = body.is_recommended;
  if (typeof body.notes === "string") updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // If setting this term as recommended, clear the flag on all others first
  if (updates.is_recommended === true) {
    await supabase
      .from("insurer_terms")
      .update({ is_recommended: false })
      .eq("policy_id", id)
      .eq("user_id", user.id);
  }

  const { data, error } = await supabase
    .from("insurer_terms")
    .update(updates)
    .eq("id", termId)
    .eq("policy_id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
