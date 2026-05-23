import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("broker_email_samples")
    .select("id, subject, body, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { samples: { subject?: string; body: string }[] };
  if (!Array.isArray(body.samples) || body.samples.length === 0) {
    return NextResponse.json({ error: "samples array required" }, { status: 400 });
  }

  const rows = body.samples
    .filter((s) => s.body?.trim())
    .map((s) => ({ user_id: user.id, subject: s.subject?.trim() || null, body: s.body.trim() }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid samples provided" }, { status: 400 });
  }

  const { error } = await supabase.from("broker_email_samples").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supabase
    .from("broker_email_samples")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({ inserted: rows.length, total: count ?? 0 }, { status: 201 });
}
