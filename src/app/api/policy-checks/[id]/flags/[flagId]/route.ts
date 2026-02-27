/**
 * PATCH /api/policy-checks/[id]/flags/[flagId]
 *
 * Two separate update flows on the same endpoint:
 *
 * 1. E&O annotation (existing):  { annotation_status, annotation_reason? }
 *    → accepted | dismissed (requires reason) | escalated
 *    → timestamps + attributed user stored for E&O documentation
 *
 * 2. Resolution workflow (new):  { resolution_status }
 *    → open | actioned | dismissed
 *    → lightweight — no reason required, separate from E&O annotation
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AnnotateFlagInput, ResolutionStatus } from "@/types/policies";

type RouteParams = { params: Promise<{ id: string; flagId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: checkId, flagId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: AnnotateFlagInput & { resolution_status?: ResolutionStatus } =
    await request.json();

  // ── Resolution workflow branch ────────────────────────────────
  if ("resolution_status" in body) {
    const validResolutions: ResolutionStatus[] = ["open", "actioned", "dismissed"];
    if (!body.resolution_status || !validResolutions.includes(body.resolution_status)) {
      return NextResponse.json(
        { error: `resolution_status must be one of: ${validResolutions.join(", ")}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("policy_check_flags")
      .update({ resolution_status: body.resolution_status })
      .eq("id", flagId)
      .eq("policy_check_id", checkId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Flag not found" }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  // ── E&O annotation branch (original) ─────────────────────────
  const { annotation_status, annotation_reason } = body;

  if (!annotation_status) {
    return NextResponse.json(
      { error: "annotation_status or resolution_status is required" },
      { status: 400 }
    );
  }

  const validStatuses = ["accepted", "dismissed", "escalated"];
  if (!validStatuses.includes(annotation_status)) {
    return NextResponse.json(
      { error: `annotation_status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
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
