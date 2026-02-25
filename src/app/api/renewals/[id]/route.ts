import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/renewals/[id] — full policy detail with touchpoints + logs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: policy, error } = await supabase
    .from("policies")
    .select(
      `
      *,
      campaign_touchpoints ( * ),
      send_logs ( * )
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  // Sort touchpoints by scheduled_at
  policy.campaign_touchpoints?.sort(
    (a: { scheduled_at: string }, b: { scheduled_at: string }) =>
      a.scheduled_at.localeCompare(b.scheduled_at)
  );

  // Sort send_logs by sent_at desc
  policy.send_logs?.sort(
    (a: { sent_at: string }, b: { sent_at: string }) =>
      b.sent_at.localeCompare(a.sent_at)
  );

  return NextResponse.json(policy);
}

// PATCH /api/renewals/[id] — update policy status or stage
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowedFields = ["status", "campaign_stage", "last_contact_at"];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("policies")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
