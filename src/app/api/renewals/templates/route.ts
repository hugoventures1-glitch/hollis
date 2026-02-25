import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateDefaultTemplates } from "@/lib/renewals/generate";
import type { TemplateType } from "@/types/renewals";

const TEMPLATE_TYPES: TemplateType[] = ["email_90", "email_60", "sms_30", "script_14"];

// GET /api/renewals/templates — returns all 4 templates for the user
// If they don't exist yet, seeds them with defaults.
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Try to load existing templates
  const { data: existing } = await supabase
    .from("email_templates")
    .select("*")
    .eq("user_id", user.id);

  const existingMap = new Map((existing ?? []).map((t: { template_type: TemplateType }) => [t.template_type, t]));

  // Check which types are missing
  const missing = TEMPLATE_TYPES.filter(t => !existingMap.has(t));

  if (missing.length > 0) {
    // Generate defaults for a placeholder policy
    const defaults = await generateDefaultTemplates({
      client_name: "Client Name",
      policy_name: "Policy Name",
      carrier: "Carrier",
    });

    // Seed missing templates
    const toInsert = missing.map(type => ({
      user_id: user.id,
      template_type: type,
      subject: defaults[type]?.subject ?? null,
      body: defaults[type]?.body ?? "",
      is_approved: false,
    }));

    const { data: inserted } = await supabase
      .from("email_templates")
      .insert(toInsert)
      .select("*");

    (inserted ?? []).forEach((t: { template_type: TemplateType }) => existingMap.set(t.template_type, t));
  }

  const templates = TEMPLATE_TYPES.map(type => existingMap.get(type)).filter(Boolean);
  return NextResponse.json(templates);
}

// PATCH /api/renewals/templates/[type] — update a single template
// Body: { subject?, body?, is_approved? }
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { template_type, ...updates } = body;

  if (!template_type) {
    return NextResponse.json({ error: "template_type required" }, { status: 400 });
  }

  const allowedFields = ["subject", "body", "is_approved"];
  const patch: Record<string, unknown> = {};
  for (const f of allowedFields) {
    if (f in updates) patch[f] = updates[f];
  }
  if (updates.is_approved === true) {
    patch.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("email_templates")
    .update(patch)
    .eq("user_id", user.id)
    .eq("template_type", template_type)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
