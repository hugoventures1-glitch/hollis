/**
 * PATCH /api/agent/escalation/[id]/resolve
 *
 * Broker resolves a Tier 3 escalation from the Hollis inbox.
 *
 * Actions:
 *   - handled:   broker acknowledges and resolves the escalation (no policy change)
 *   - resume:    broker resolves escalation AND resumes the renewal sequence
 *   - terminate: broker resolves escalation AND terminates the renewal sequence
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { logAction, retainLongTerm } from "@/lib/logAction";

const RequestSchema = z.object({
  resolution: z.enum(["handled", "resume", "terminate"]),
  notes: z.string().max(1000).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: queueItemId } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { resolution, notes } = parsed.data;

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch escalation item (RLS enforces ownership) ───────────────────────────
    const { data: queueItem, error: fetchError } = await supabase
      .from("approval_queue")
      .select(
        "id, policy_id, user_id, signal_id, classified_intent, confidence_score, raw_signal_snippet, proposed_action, status, tier"
      )
      .eq("id", queueItemId)
      .eq("user_id", user.id)
      .eq("tier", 3)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: "Escalation item not found" },
        { status: 404 }
      );
    }

    if (queueItem.status !== "pending") {
      return NextResponse.json(
        { error: `Escalation is already ${queueItem.status}` },
        { status: 409 }
      );
    }

    const resolvedAt = new Date().toISOString();
    const admin = createAdminClient();

    // ── Update approval_queue record ─────────────────────────────────────────────
    await supabase
      .from("approval_queue")
      .update({
        status: "approved",
        broker_decision: {
          action: "resolved",
          resolution,
          notes: notes ?? null,
        },
        resolved_at: resolvedAt,
      })
      .eq("id", queueItemId);

    // ── Policy side effects ──────────────────────────────────────────────────────
    if (resolution === "resume") {
      await admin
        .from("policies")
        .update({
          renewal_paused: false,
          renewal_paused_until: null,
          last_contact_at: resolvedAt.slice(0, 10),
        })
        .eq("id", queueItem.policy_id as string);
    } else if (resolution === "terminate") {
      await admin
        .from("policies")
        .update({
          renewal_paused: true,
          campaign_stage: "lapsed",
          lapsed_at: resolvedAt.slice(0, 10),
          last_contact_at: resolvedAt.slice(0, 10),
        })
        .eq("id", queueItem.policy_id as string);

      // Auto-reject any other pending queue items for this policy
      await admin
        .from("approval_queue")
        .update({ status: "rejected" })
        .eq("policy_id", queueItem.policy_id as string)
        .neq("id", queueItemId)
        .eq("status", "pending");
    }

    // ── Audit log ────────────────────────────────────────────────────────────────
    const resolutionLabels: Record<string, string> = {
      handled: "Broker marked escalation as handled",
      resume: "Broker resolved escalation and resumed renewal sequence",
      terminate: "Broker resolved escalation and terminated renewal sequence",
    };

    await writeAuditLog({
      supabase: admin,
      policy_id: queueItem.policy_id as string,
      user_id: user.id,
      event_type: "escalation_resolved",
      channel: "internal",
      content_snapshot: queueItem.raw_signal_snippet as string,
      metadata: {
        queue_item_id: queueItemId,
        signal_id: queueItem.signal_id,
        classified_intent: queueItem.classified_intent,
        broker_resolution: resolution,
        notes: notes ?? null,
        resolved_at: resolvedAt,
      },
      actor_type: "broker",
    });

    void logAction({
      broker_id: user.id,
      policy_id: queueItem.policy_id as string,
      action_type: "escalation_resolved",
      tier: "3",
      trigger_reason: resolutionLabels[resolution],
      payload: {
        resolution,
        notes: notes ?? null,
        queue_item_id: queueItemId,
      },
      metadata: {
        signal_id: queueItem.signal_id,
        classified_intent: queueItem.classified_intent,
      },
      outcome: "resolved",
      retain_until: retainLongTerm(),
    });

    return NextResponse.json({
      id: queueItemId,
      status: "resolved",
      resolution,
      resolved_at: resolvedAt,
    });
  } catch (err) {
    console.error(
      "[agent/escalation/resolve] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
