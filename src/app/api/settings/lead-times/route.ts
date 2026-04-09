import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("renewal_lead_time_configs")
    .select("*")
    .eq("user_id", user.id)
    .order("policy_type");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { policy_type, offset_email_1, offset_email_2, offset_sms, offset_call } = body;

  // Validate
  if (!policy_type || typeof policy_type !== "string" || policy_type.trim() === "") {
    return NextResponse.json({ error: "policy_type is required" }, { status: 400 });
  }
  const offsets = { offset_email_1, offset_email_2, offset_sms, offset_call };
  for (const [key, val] of Object.entries(offsets)) {
    if (!Number.isInteger(val) || val < 1 || val > 365) {
      return NextResponse.json({ error: `${key} must be an integer between 1 and 365` }, { status: 400 });
    }
  }
  if (!(offset_email_1 > offset_email_2 && offset_email_2 > offset_sms && offset_sms > offset_call)) {
    return NextResponse.json(
      { error: "Offsets must be in descending order: first email > second email > SMS > call script" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("renewal_lead_time_configs")
    .upsert(
      {
        user_id: user.id,
        policy_type: policy_type.trim().toLowerCase(),
        offset_email_1,
        offset_email_2,
        offset_sms,
        offset_call,
      },
      { onConflict: "user_id,policy_type" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
