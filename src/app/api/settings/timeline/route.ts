import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateTimeline, DEFAULT_TIMELINE } from "@/types/timeline";
import type { TimelineConfig } from "@/types/timeline";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agent_profiles")
    .select("renewal_timeline")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const timeline = (data?.renewal_timeline as TimelineConfig | null) ?? DEFAULT_TIMELINE;
  return NextResponse.json({ timeline });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const timeline: TimelineConfig = body.timeline;
  if (!timeline) return NextResponse.json({ error: "Missing timeline" }, { status: 400 });

  const validationError = validateTimeline(timeline);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { error } = await supabase
    .from("agent_profiles")
    .upsert({ user_id: user.id, renewal_timeline: timeline }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
