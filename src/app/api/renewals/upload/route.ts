import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CSVPolicyRow, TouchpointType } from "@/types/renewals";
import { touchpointScheduledDate } from "@/types/renewals";

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

  let inserted = 0;
  const errors: string[] = [];

  for (const row of policies) {
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
        status: "active",
        campaign_stage: "pending",
      })
      .select("id")
      .single();

    if (pErr || !policy) {
      errors.push(`Failed to insert ${row.client_name}: ${pErr?.message}`);
      continue;
    }

    // Create 4 touchpoints — skip any already past
    const touchpoints = TOUCHPOINT_TYPES.map((type) => {
      const scheduledAt = touchpointScheduledDate(row.expiration_date, type);
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
