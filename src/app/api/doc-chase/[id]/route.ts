/**
 * GET  /api/doc-chase/[id]
 * Returns a single doc_chase_request with its sequence and all messages.
 *
 * PATCH /api/doc-chase/[id]
 * Updates the request status. When status is set to 'received', the Postgres
 * trigger (mark_document_received) will automatically cancel pending messages
 * and complete the sequence. The API just updates the status field.
 * Also handles 'cancelled' — cancels the active sequence and its pending messages.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PatchDocChaseBody } from "@/types/doc-chase";
import { writeAuditLog } from "@/lib/audit/log";

type RouteParams = { params: Promise<{ id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data: req, error: reqErr } = await supabase
      .from("doc_chase_requests")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });
    if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fetch sequence
    const { data: seq } = await supabase
      .from("doc_chase_sequences")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch messages
    const { data: messages } = seq
      ? await supabase
          .from("doc_chase_messages")
          .select("*")
          .eq("sequence_id", seq.id)
          .order("touch_number", { ascending: true })
      : { data: [] };

    return NextResponse.json({
      ...req,
      sequence: seq ?? null,
      messages: messages ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PatchDocChaseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { status } = body;
  const VALID_STATUSES = ["pending", "active", "received", "cancelled"];
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Verify ownership (also fetch policy_id and document_type for audit log)
    const { data: existing, error: existErr } = await supabase
      .from("doc_chase_requests")
      .select("id, status, policy_id, document_type, client_email, client_name")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Build update payload
    const updatePayload: Record<string, unknown> = { status };
    if (status === "received" && existing.status !== "received") {
      updatePayload.received_at = new Date().toISOString();
    }

    // Update the request — the Postgres trigger handles cascading cancel/complete
    // for 'received'. For 'cancelled', we need to manually cancel messages.
    const { data: updated, error: updateErr } = await supabase
      .from("doc_chase_requests")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: updateErr?.message ?? "Update failed" },
        { status: 500 }
      );
    }

    // If cancelling: cancel pending messages and the active sequence
    if (status === "cancelled") {
      const { data: seq } = await supabase
        .from("doc_chase_sequences")
        .select("id")
        .eq("request_id", id)
        .eq("sequence_status", "active")
        .maybeSingle();

      if (seq) {
        await supabase
          .from("doc_chase_messages")
          .update({ status: "cancelled" })
          .eq("sequence_id", seq.id)
          .eq("status", "scheduled");

        await supabase
          .from("doc_chase_sequences")
          .update({ sequence_status: "cancelled" })
          .eq("id", seq.id);
      }
    }

    // Write audit log when document is received and linked to a policy
    if (status === "received" && existing.status !== "received" && existing.policy_id) {
      await writeAuditLog({
        supabase,
        policy_id: existing.policy_id,
        user_id: user.id,
        event_type: "doc_received",
        channel: "internal",
        content_snapshot: `Document received: ${existing.document_type} from ${existing.client_name}`,
        metadata: {
          doc_chase_request_id: id,
          document_type: existing.document_type,
          client_name: existing.client_name,
        },
        actor_type: "agent",
      });
    }

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
