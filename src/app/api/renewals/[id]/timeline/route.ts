import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateTimeline } from "@/types/timeline";
import type { TimelineConfig } from "@/types/timeline";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("policies")
    .select("custom_timeline")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    custom_timeline: data.custom_timeline ?? null,
    using_default: data.custom_timeline === null || data.custom_timeline === undefined,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const timeline: TimelineConfig | null = body.timeline ?? null;

  if (timeline !== null) {
    const validationError = validateTimeline(timeline);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { error } = await supabase
    .from("policies")
    .update({ custom_timeline: timeline })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
