import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profileRes, templatesRes, policiesRes, samplesRes] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("first_name, last_name, email_from_name, email_signature")
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("email_templates")
      .select("is_approved")
      .eq("user_id", user.id),

    supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),

    supabase
      .from("broker_email_samples")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const profile = profileRes.data;
  const profile_complete =
    !!profile?.first_name?.trim() && !!profile?.last_name?.trim();
  const email_configured =
    !!profile?.email_from_name?.trim() && !!profile?.email_signature?.trim();

  const templates = templatesRes.data ?? [];
  const templates_approved =
    templates.length >= 4 && templates.every((t) => t.is_approved);

  const policies_imported = (policiesRes.count ?? 0) > 0;

  const email_samples_count = samplesRes.count ?? 0;
  const email_samples_imported = email_samples_count >= 20;

  const all_complete =
    profile_complete &&
    email_configured &&
    templates_approved &&
    policies_imported &&
    email_samples_imported;

  return NextResponse.json({
    profile_complete,
    email_configured,
    templates_approved,
    policies_imported,
    email_samples_imported,
    email_samples_count,
    all_complete,
  });
}
