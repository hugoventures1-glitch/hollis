/**
 * POST /api/renewals/health-scores/refresh
 *
 * Computes and persists health scores for all of the authenticated user's
 * active policies. Uses the client-side admin client so it can write back
 * without row-level security blocking cross-row updates.
 *
 * Returns: { updated: number, stalled: number }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeHealthScore } from "@/lib/renewals/health-score";

export async function POST() {
  // Auth — verify session via the server-side user client
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch all active policies for this user
  const { data: policies, error } = await admin
    .from("policies")
    .select("id, campaign_stage, expiration_date, last_contact_at, stalled_at, renewal_flags")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  let updated = 0;
  let stalled = 0;

  for (const policy of policies ?? []) {
    const { score, label, stalled: isStalled } = computeHealthScore(policy);

    const { error: updateError } = await admin
      .from("policies")
      .update({
        health_score:      score,
        health_label:      label,
        health_updated_at: now,
        // Preserve original stall timestamp if already stalled; clear if resolved
        stalled_at: isStalled ? (policy.stalled_at ?? now) : null,
      })
      .eq("id", policy.id);

    if (!updateError) {
      updated++;
      if (isStalled) stalled++;
    }
  }

  return NextResponse.json({ updated, stalled });
}
