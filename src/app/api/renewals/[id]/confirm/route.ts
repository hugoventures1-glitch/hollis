/**
 * POST /api/renewals/[id]/confirm
 *
 * Agent marks a client as confirmed — renewal is proceeding.
 * Sets campaign_stage = 'confirmed', records timestamp, writes audit log.
 * This blocks final notice automation and lapse detection from firing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch policy (ownership check + current stage)
  const { data: policy, error: policyErr } = await supabase
    .from("policies")
    .select("id, client_name, campaign_stage")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (policyErr || !policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  if (policy.campaign_stage === "confirmed") {
    return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
  }
  if (policy.campaign_stage === "lapsed") {
    return NextResponse.json({ error: "Policy has already lapsed" }, { status: 409 });
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("policies")
    .update({ campaign_stage: "confirmed", client_confirmed_at: now })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await writeAuditLog({
    supabase,
    policy_id: id,
    user_id: user.id,
    event_type: "client_confirmed",
    channel: "internal",
    content_snapshot: `Renewal confirmed for ${policy.client_name}. Prior stage: ${policy.campaign_stage}.`,
    metadata: { prior_stage: policy.campaign_stage },
    actor_type: "agent",
  });

  return NextResponse.json({ success: true, confirmed_at: now });
}
