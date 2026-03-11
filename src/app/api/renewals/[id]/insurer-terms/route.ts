/**
 * GET  /api/renewals/[id]/insurer-terms  — list all insurer terms for a policy
 * POST /api/renewals/[id]/insurer-terms  — parse and save new insurer terms
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseInsurerTerms } from "@/lib/renewals/insurer-terms";
import { writeAuditLog } from "@/lib/audit/log";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("insurer_terms")
    .select("*")
    .eq("policy_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify policy ownership
  const { data: policy, error: policyErr } = await supabase
    .from("policies")
    .select("id, policy_name, premium")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (policyErr || !policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  const body = await request.json();
  const { raw_text, notes } = body as { raw_text: string; notes?: string };

  if (!raw_text?.trim()) {
    return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
  }

  // Parse via Claude Sonnet 4.5
  let parsed;
  try {
    parsed = await parseInsurerTerms(raw_text.trim(), policy.premium ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Parsing failed: ${msg}` }, { status: 500 });
  }

  // Insert into insurer_terms
  const { data: inserted, error: insertErr } = await supabase
    .from("insurer_terms")
    .insert({
      policy_id: id,
      user_id: user.id,
      insurer_name: parsed.insurer_name,
      quoted_premium: parsed.quoted_premium,
      premium_change: parsed.premium_change,
      premium_change_pct: parsed.premium_change_pct,
      payment_terms: parsed.payment_terms,
      new_exclusions: parsed.new_exclusions,
      changed_conditions: parsed.changed_conditions,
      effective_date: parsed.effective_date,
      expiry_date: parsed.expiry_date,
      raw_input_text: raw_text.trim(),
      parsed_data: parsed,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Write to audit log
  await writeAuditLog({
    supabase,
    policy_id: id,
    user_id: user.id,
    event_type: "insurer_terms_logged",
    channel: "internal",
    content_snapshot: `Insurer terms logged: ${parsed.insurer_name} — premium ${parsed.quoted_premium != null ? `$${parsed.quoted_premium.toLocaleString("en-AU")}` : "not provided"}. ${parsed.summary}`,
    metadata: {
      insurer_terms_id: inserted.id,
      insurer_name: parsed.insurer_name,
      quoted_premium: parsed.quoted_premium,
    },
    actor_type: "agent",
  });

  return NextResponse.json(inserted, { status: 201 });
}
