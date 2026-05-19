/**
 * POST /api/renewals/[id]/reject-script
 *
 * Broker explicitly rejects the call script touchpoint for a policy.
 *
 * Side effects:
 *   1. Sets renewal_flags.call_script_rejected = true (sticky)
 *   2. Marks any pending script_14 touchpoints as skipped
 *   3. Bumps health to critical directly (score penalty applied on next refresh)
 *   4. Creates a Tier 3 escalation in approval_queue so the broker sees it in inbox
 *   5. Writes an audit log entry
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainStandard } from "@/lib/logAction";
import { refreshPolicyHealthScore } from "@/lib/renewals/health-score";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: policyId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // ── Fetch policy (RLS enforces ownership) ─────────────────────────────────
    const { data: policy, error: policyError } = await supabase
      .from("policies")
      .select("id, policy_name, client_name, expiration_date, renewal_flags, campaign_stage")
      .eq("id", policyId)
      .eq("user_id", user.id)
      .single();

    if (policyError || !policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    // ── 1. Set call_script_rejected flag ──────────────────────────────────────
    const existingFlags = (policy.renewal_flags as Record<string, unknown>) ?? {};
    const updatedFlags = { ...existingFlags, call_script_rejected: true };

    await admin
      .from("policies")
      .update({ renewal_flags: updatedFlags })
      .eq("id", policyId);

    // ── 2. Mark pending script_14 touchpoints as skipped ──────────────────────
    await admin
      .from("campaign_touchpoints")
      .update({ status: "skipped" })
      .eq("policy_id", policyId)
      .eq("type", "script_14")
      .eq("status", "pending");

    // ── 3. Refresh health score (penalty from call_script_rejected applied) ────
    await refreshPolicyHealthScore(policyId, admin);

    // ── 4. Create Tier 3 escalation in approval_queue ─────────────────────────
    await admin
      .from("approval_queue")
      .insert({
        policy_id: policyId,
        user_id: user.id,
        signal_id: null,
        tier: 3,
        classified_intent: "call_script_rejected",
        confidence_score: 1.0,
        raw_signal_snippet: `Broker rejected the call script for ${policy.client_name} — manual intervention required.`,
        proposed_action: {
          description: `Call script rejected for ${policy.policy_name}. Review the renewal approach for ${policy.client_name} and decide next steps.`,
          action_type: "broker_change_required",
          payload: {
            policy_name: policy.policy_name,
            client_name: policy.client_name,
            rejection_reason: "call_script_rejected",
          },
        },
        status: "pending",
      });

    // ── 5. Write audit log ─────────────────────────────────────────────────────
    await writeAuditLog({
      supabase: admin,
      policy_id: policyId,
      user_id: user.id,
      event_type: "tier_3_escalated",
      channel: "internal",
      content_snapshot: `Broker rejected call script for ${policy.client_name}`,
      metadata: {
        policy_name: policy.policy_name,
        trigger: "call_script_rejected",
      },
      actor_type: "broker",
    });

    void logAction({
      broker_id: user.id,
      policy_id: policyId,
      action_type: "call_script_rejected",
      tier: "3",
      trigger_reason: `Broker rejected the call script for ${policy.client_name} — flagged and escalated to Tier 3.`,
      metadata: { policy_name: policy.policy_name },
      outcome: "sent",
      retain_until: retainStandard(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reject-script] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
