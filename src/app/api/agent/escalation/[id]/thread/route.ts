/**
 * GET /api/agent/escalation/[id]/thread
 *
 * Returns the most recent outbound message (campaign touchpoint or Tier 1 reply)
 * sent to the client for the policy linked to a Tier 3 escalation queue item.
 * This gives the broker context on what Hollis previously sent before the
 * client reply that triggered the escalation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: queueItemId } = await params;

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch queue item (RLS enforces ownership) ───────────────────────────────
    const { data: queueItem, error: fetchError } = await supabase
      .from("approval_queue")
      .select("id, policy_id, user_id, signal_id, tier")
      .eq("id", queueItemId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json(
        { error: "Queue item not found" },
        { status: 404 }
      );
    }

    const policyId = queueItem.policy_id as string;
    const admin = createAdminClient();

    // ── Fetch outbound history + inbound signal in parallel ──────────────────────
    const [
      { data: touchpoints },
      { data: autoReplies },
    ] = await Promise.all([
      admin
        .from("campaign_touchpoints")
        .select("subject, content, sent_at, type")
        .eq("policy_id", policyId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1),
      admin
        .from("hollis_actions")
        .select("payload, created_at")
        .eq("policy_id", policyId)
        .in("action_type", [
          "tier1_reply_sent",
          "tier1_ack_sent_confirm_renewal",
          "tier1_ack_sent_request_callback",
          "tier1_ack_sent_document_received",
        ])
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // ── Pick the most recent outbound message ──────────────────────────────────
    type OutboundMessage = {
      kind: "touchpoint" | "auto_reply";
      subject: string | null;
      body: string;
      sent_at: string;
      type?: string;
    };

    let previousOutbound: OutboundMessage | null = null;

    const touchpoint = touchpoints?.[0];
    const autoReply = autoReplies?.[0];

    if (touchpoint && autoReply) {
      const touchpointDate = touchpoint.sent_at ? new Date(touchpoint.sent_at as string).getTime() : 0;
      const autoReplyDate = autoReply.created_at ? new Date(autoReply.created_at as string).getTime() : 0;

      if (touchpointDate >= autoReplyDate) {
        previousOutbound = {
          kind: "touchpoint",
          subject: (touchpoint.subject as string) ?? null,
          body: (touchpoint.content as string) ?? "",
          sent_at: touchpoint.sent_at as string,
          type: touchpoint.type as string | undefined,
        };
      } else {
        const p = (autoReply.payload as { subject?: string; body?: string } | null) ?? {};
        previousOutbound = {
          kind: "auto_reply",
          subject: p.subject ?? null,
          body: p.body ?? "",
          sent_at: autoReply.created_at as string,
        };
      }
    } else if (touchpoint) {
      previousOutbound = {
        kind: "touchpoint",
        subject: (touchpoint.subject as string) ?? null,
        body: (touchpoint.content as string) ?? "",
        sent_at: touchpoint.sent_at as string,
        type: touchpoint.type as string | undefined,
      };
    } else if (autoReply) {
      const p = (autoReply.payload as { subject?: string; body?: string } | null) ?? {};
      previousOutbound = {
        kind: "auto_reply",
        subject: p.subject ?? null,
        body: p.body ?? "",
        sent_at: autoReply.created_at as string,
      };
    }

    return NextResponse.json({
      previousOutbound,
    });
  } catch (err) {
    console.error(
      "[escalation/thread] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
