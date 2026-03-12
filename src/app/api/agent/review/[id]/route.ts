/**
 * PATCH /api/agent/review/[id]
 *
 * Step 7 + 8: Broker resolves a Tier 2 approval queue item.
 *
 * Actions:
 *   - approved: broker accepts the proposed action as-is
 *   - rejected: broker rejects, no action taken
 *   - edited:   broker modifies the intent/action before approving
 *
 * Side effects (Step 8 — learning layer):
 *   - Every resolution writes a record to parser_outcomes so the classifier
 *     learns from broker decisions via few-shot injection on the next signal.
 *   - approved/edited outcomes become few-shot examples for the next classifier call.
 *
 * Step 10 — Audit log:
 *   - Every resolution is written to renewal_audit_log.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

const RequestSchema = z.object({
  action: z.enum(["approved", "rejected", "edited"]),
  edited_intent: z.string().optional(),   // required when action = 'edited'
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

    const { action, edited_intent, notes } = parsed.data;

    if (action === "edited" && !edited_intent) {
      return NextResponse.json(
        { error: "edited_intent is required when action is 'edited'" },
        { status: 400 }
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch approval queue item (RLS enforces ownership) ───────────────────────
    const { data: queueItem, error: fetchError } = await supabase
      .from("approval_queue")
      .select("id, policy_id, user_id, signal_id, classified_intent, confidence_score, raw_signal_snippet, proposed_action, status")
      .eq("id", queueItemId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
    }

    if (queueItem.status !== "pending") {
      return NextResponse.json(
        { error: `Queue item is already ${queueItem.status}` },
        { status: 409 }
      );
    }

    const resolvedAt = new Date().toISOString();
    const finalIntent =
      action === "edited" && edited_intent
        ? edited_intent
        : (queueItem.classified_intent as string);

    // ── Update approval_queue record ─────────────────────────────────────────────
    await supabase
      .from("approval_queue")
      .update({
        status: action,
        broker_decision: {
          action,
          edited_intent: edited_intent ?? null,
          notes: notes ?? null,
        },
        resolved_at: resolvedAt,
      })
      .eq("id", queueItemId);

    // ── Step 8: Write to parser_outcomes (learning layer) ────────────────────────
    // Approved and edited outcomes become few-shot examples for the next signal.
    // Rejected outcomes are recorded but excluded from few-shot injection.
    const admin = createAdminClient();

    await supabase
      .from("parser_outcomes")
      .insert({
        renewal_id: queueItem.policy_id,
        signal_id: queueItem.signal_id,
        user_id: user.id,
        raw_signal: queueItem.raw_signal_snippet,
        classified_intent: queueItem.classified_intent,
        confidence_score: queueItem.confidence_score,
        broker_action: action,
        final_intent: finalIntent,
      });

    // ── Step 10: Write audit log ─────────────────────────────────────────────────
    const actionLabels: Record<string, string> = {
      approved: "Broker approved the proposed action",
      rejected: "Broker rejected the proposed action",
      edited: `Broker edited intent to "${finalIntent}"`,
    };

    await writeAuditLog({
      supabase: admin,
      policy_id: queueItem.policy_id as string,
      user_id: user.id,
      event_type: "tier_2_drafted",   // re-uses tier_2_drafted; metadata differentiates resolution
      channel: "internal",
      content_snapshot: queueItem.raw_signal_snippet as string,
      metadata: {
        queue_item_id: queueItemId,
        signal_id: queueItem.signal_id,
        classified_intent: queueItem.classified_intent,
        final_intent: finalIntent,
        broker_action: action,
        confidence_score: queueItem.confidence_score,
        resolution: actionLabels[action],
        notes: notes ?? null,
        resolved_at: resolvedAt,
      },
      actor_type: "agent",
    });

    return NextResponse.json({
      id: queueItemId,
      status: action,
      final_intent: finalIntent,
      resolved_at: resolvedAt,
    });
  } catch (err) {
    console.error("[agent/review] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
