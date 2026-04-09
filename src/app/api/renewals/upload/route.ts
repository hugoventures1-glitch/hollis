import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CSVPolicyRow, TouchpointType, LeadTimeConfig } from "@/types/renewals";
import { touchpointScheduledDate, resolveLeadTimes } from "@/types/renewals";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let policies: CSVPolicyRow[];
  try {
    const body = await request.json();
    policies = body.policies;
    if (!Array.isArray(policies) || policies.length === 0) {
      return NextResponse.json(
        { error: "No policies provided" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate required fields (only client_name and expiration_date are required)
  for (const [i, p] of policies.entries()) {
    const missing = (
      ["client_name", "expiration_date"] as const
    ).filter((f) => !p[f]?.toString().trim());

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Row ${i + 1} missing: ${missing.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const TOUCHPOINT_TYPES: TouchpointType[] = [
    "email_90",
    "email_60",
    "sms_30",
    "script_14",
  ];

  // Load this broker's lead time configs once — used to compute correct scheduled_at per policy type
  const { data: leadTimeRows } = await supabase
    .from("renewal_lead_time_configs")
    .select("*")
    .eq("user_id", user.id);

  const leadTimeMap = new Map<string, LeadTimeConfig>(
    (leadTimeRows ?? []).map((c: LeadTimeConfig) => [c.policy_type.toLowerCase(), c])
  );

  let inserted = 0;
  const errors: string[] = [];

  for (const row of policies) {
    const policyType = row.policy_type?.trim().toLowerCase() || null;

    // Insert policy
    const { data: policy, error: pErr } = await supabase
      .from("policies")
      .insert({
        user_id: user.id,
        policy_name: row.policy_name?.trim() || null,
        client_name: row.client_name.trim(),
        client_email: row.client_email?.trim().toLowerCase() || null,
        client_phone: row.client_phone?.trim() || null,
        expiration_date: row.expiration_date,
        carrier: row.carrier?.trim() || null,
        premium: row.premium ?? null,
        policy_type: policyType,
        status: "active",
        campaign_stage: "pending",
      })
      .select("id")
      .single();

    if (pErr || !policy) {
      errors.push(`Failed to insert ${row.client_name}: ${pErr?.message}`);
      continue;
    }

    // Create 4 touchpoints using the configured lead times for this policy type
    const lt = resolveLeadTimes(policyType, leadTimeMap);
    const touchpoints = TOUCHPOINT_TYPES.map((type) => {
      const scheduledAt = touchpointScheduledDate(row.expiration_date, type, lt);
      return {
        policy_id: policy.id,
        user_id: user.id,
        type,
        status: scheduledAt < today ? "skipped" : "pending",
        scheduled_at: scheduledAt,
      };
    });

    const { error: tErr } = await supabase
      .from("campaign_touchpoints")
      .insert(touchpoints);

    if (tErr) {
      errors.push(
        `Touchpoints for ${row.client_name} failed: ${tErr.message}`
      );
    }

    inserted++;
  }

  return NextResponse.json({
    inserted,
    errors,
    message: `${inserted} of ${policies.length} policies imported successfully`,
  });
}
