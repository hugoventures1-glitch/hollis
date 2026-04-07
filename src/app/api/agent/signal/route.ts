/**
 * POST /api/agent/signal
 *
 * Manually submit an inbound signal for testing or dashboard use.
 * Automated ingestion comes from /api/webhooks/resend/inbound.
 * Both routes share the same 11-step pipeline via processInboundSignal.
 *
 * Pipeline:
 *   1. Validate input, assert policy ownership (RLS)
 *   2–11. processInboundSignal (shared with inbound email webhook)
 *
 * Returns: { signal_id, classification, flags, tier_decision }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundSignal } from "@/lib/agent/process-signal";
import type { ParserOutcome } from "@/types/agent";

const RequestSchema = z.object({
  policy_id: z.string().uuid("policy_id must be a valid UUID"),
  raw_signal: z.string().min(1, "Signal cannot be empty").max(10_000, "Signal too long"),
  sender_email: z.string().email("sender_email must be a valid email").optional(),
  sender_name: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // ── Parse + validate request body ───────────────────────────────────────────
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

    const { policy_id, raw_signal, sender_email, sender_name } = parsed.data;

    // ── Auth ─────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch policy (enforces RLS — user must own this policy) ──────────────────
    const { data: policy, error: policyError } = await supabase
      .from("policies")
      .select("id, client_name, policy_name, expiration_date, last_contact_at, renewal_flags, renewal_paused, client_email, carrier, premium, agent_name, agent_email")
      .eq("id", policy_id)
      .single();

    if (policyError || !policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    // Admin client for pipeline operations (flag writes, audit log, queue inserts)
    const admin = createAdminClient();

    // ── 3. Fetch recent broker-approved parser_outcomes for few-shot injection ───
    const { data: recentOutcomes } = await supabase
      .from("parser_outcomes")
      .select("*")
      .eq("user_id", user.id)
      .in("broker_action", ["approved", "edited"])
      .order("created_at", { ascending: false })
      .limit(10);

    // ── 4–11. Run shared signal pipeline ────────────────────────────────────────
    let result;
    try {
      result = await processInboundSignal({
        admin,
        userId: user.id,
        policyId: policy_id,
        policy,
        rawSignal: raw_signal,
        senderEmail: sender_email ?? null,
        senderName: sender_name ?? null,
        source: "manual",
        recentOutcomes: (recentOutcomes as ParserOutcome[]) ?? [],
      });
    } catch (pipelineErr) {
      console.error("[agent/signal] Pipeline error:", pipelineErr instanceof Error ? pipelineErr.message : pipelineErr);
      return NextResponse.json({ error: "Signal processing failed" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[agent/signal] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
