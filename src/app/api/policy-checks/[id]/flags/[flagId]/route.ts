/**
 * PATCH /api/policy-checks/[id]/flags/[flagId]
 *
 * Annotate a flag: accepted | dismissed (requires reason) | escalated.
 * This is the E&O documentation endpoint — timestamps and attributing user are set server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AnnotateFlagInput } from "@/types/policies";

type RouteParams = { params: Promise<{ id: string; flagId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: checkId, flagId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: AnnotateFlagInput = await request.json();
  const { annotation_status, annotation_reason } = body;

  if (!annotation_status) {
    return NextResponse.json({ error: "annotation_status is required" }, { status: 400 });
  }

  const validStatuses = ["accepted", "dismissed", "escalated"];
  if (!validStatuses.includes(annotation_status)) {
    return NextResponse.json({ error: `annotation_status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  // Dismissal requires a reason — this is E&O documentation
  if (annotation_status === "dismissed" && !annotation_reason?.trim()) {
    return NextResponse.json(
      { error: "A dismissal reason is required. This is recorded in your E&O documentation." },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("policy_check_flags")
    .update({
      annotation_status,
      annotation_reason: annotation_reason?.trim() ?? null,
      annotated_at: new Date().toISOString(),
      annotated_by: user.id,
    })
    .eq("id", flagId)
    .eq("policy_check_id", checkId)  // scope to this check
    .eq("user_id", user.id)          // RLS double-check
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Flag not found" }, { status: 500 });
  }

  return NextResponse.json(data);
}
