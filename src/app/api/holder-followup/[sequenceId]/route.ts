/**
 * GET  /api/holder-followup/[sequenceId]  — fetch sequence + messages
 * PATCH /api/holder-followup/[sequenceId] — cancel sequence
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ sequenceId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { sequenceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("holder_followup_sequences")
    .select(`
      *,
      holder_followup_messages (
        id, touch_number, scheduled_for, sent_at, status, subject, body, created_at
      )
    `)
    .eq("id", sequenceId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { sequenceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Only cancellation is supported via PATCH for now
  if (body.sequence_status !== "cancelled") {
    return NextResponse.json(
      { error: "Only sequence_status: cancelled is supported" },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: seq, error: seqErr } = await supabase
    .from("holder_followup_sequences")
    .select("id, sequence_status")
    .eq("id", sequenceId)
    .eq("user_id", user.id)
    .single();

  if (seqErr || !seq) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  if (seq.sequence_status !== "active") {
    return NextResponse.json(
      { error: "Only active sequences can be cancelled" },
      { status: 409 }
    );
  }

  // Cancel all pending messages first
  await supabase
    .from("holder_followup_messages")
    .update({ status: "cancelled" })
    .eq("sequence_id", sequenceId)
    .eq("status", "scheduled");

  // Cancel the sequence
  const { data: updated, error: updateErr } = await supabase
    .from("holder_followup_sequences")
    .update({ sequence_status: "cancelled" })
    .eq("id", sequenceId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to cancel" },
      { status: 500 }
    );
  }

  return NextResponse.json(updated);
}
