/**
 * GET /api/holder-followup/by-certificate/[certificateId]
 *
 * Returns the active (or most recent) sequence for a certificate, with its messages.
 * Returns null (204) when no sequence exists.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ certificateId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { certificateId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Prefer an active sequence; fall back to most recently created
  const { data, error } = await supabase
    .from("holder_followup_sequences")
    .select(`
      *,
      holder_followup_messages (
        id, touch_number, scheduled_for, sent_at, status, subject, body, created_at
      )
    `)
    .eq("certificate_id", certificateId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(null, { status: 200 });
  }

  return NextResponse.json(data);
}
