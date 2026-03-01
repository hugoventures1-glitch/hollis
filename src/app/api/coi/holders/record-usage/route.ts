/**
 * POST /api/coi/holders/record-usage
 * Records a holder usage event and keeps intelligence columns up to date.
 *
 * Body:
 *   holderId?     — UUID of an existing certificate_holders row
 *   holderName    — name of the holder (used for upsert-by-name if no holderId)
 *   holderAddress?
 *   holderCity?
 *   holderState?
 *   holderZip?
 *   insuredName   — the insured party for this request
 *   coverageTypes — string[] of coverage type keys
 *   agentId?      — required in portal path (no session)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  holderId: z.string().uuid().optional(),
  holderName: z.string().min(1),
  holderAddress: z.string().optional(),
  holderCity: z.string().optional(),
  holderState: z.string().optional(),
  holderZip: z.string().optional(),
  insuredName: z.string().min(1),
  coverageTypes: z.array(z.string()).default([]),
  agentId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const {
    holderId: inputHolderId,
    holderName,
    holderAddress,
    holderCity,
    holderState,
    holderZip,
    insuredName,
    coverageTypes,
    agentId: bodyAgentId,
  } = parsed.data;

  // ── Auth: session (dashboard) or agentId param (portal) ──────────────────
  let userId: string;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    userId = user.id;
  } else if (bodyAgentId) {
    const admin = createAdminClient();
    const { data: agentUser } = await admin.auth.admin.getUserById(bodyAgentId);
    if (!agentUser?.user) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    userId = bodyAgentId;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── Resolve holder ID ─────────────────────────────────────────────────────
  let holderId = inputHolderId;

  if (!holderId) {
    // Look for an existing holder by name (case-insensitive) for this agent
    const { data: existing } = await admin
      .from("certificate_holders")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", holderName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      holderId = existing.id as string;
    } else {
      // Create a brand-new holder
      const { data: inserted, error: insertErr } = await admin
        .from("certificate_holders")
        .insert({
          user_id: userId,
          name: holderName,
          address: holderAddress ?? null,
          city: holderCity ?? null,
          state: holderState ?? null,
          zip: holderZip ?? null,
          usage_count: 1,
          last_requested_at: new Date().toISOString(),
          common_coverage_types: coverageTypes.slice(0, 5),
          common_insured_names: [insuredName],
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        console.error("[holders/record-usage] Insert failed:", insertErr?.message);
        return NextResponse.json({ error: "Failed to create holder" }, { status: 500 });
      }

      holderId = inserted.id as string;

      // Record history for the new holder
      await admin.from("holder_request_history").insert({
        user_id: userId,
        holder_id: holderId,
        insured_name: insuredName,
        coverage_types: coverageTypes,
      });

      return NextResponse.json({ success: true, holder_id: holderId }, { status: 201 });
    }
  }

  // ── Update existing holder ────────────────────────────────────────────────

  // Insert history row first
  await admin.from("holder_request_history").insert({
    user_id: userId,
    holder_id: holderId,
    insured_name: insuredName,
    coverage_types: coverageTypes,
  });

  // Fetch last 20 history rows to recompute intelligence fields
  const { data: history } = await admin
    .from("holder_request_history")
    .select("insured_name, coverage_types, requested_at")
    .eq("user_id", userId)
    .eq("holder_id", holderId)
    .order("requested_at", { ascending: false })
    .limit(20);

  const rows = history ?? [];

  // common_insured_names: unique names in recency order, max 5
  const seenNames = new Set<string>();
  const recentInsuredNames: string[] = [];
  for (const row of rows) {
    const name = row.insured_name as string;
    if (!seenNames.has(name)) {
      seenNames.add(name);
      recentInsuredNames.push(name);
      if (recentInsuredNames.length === 5) break;
    }
  }

  // common_coverage_types: frequency across all history rows, top 5
  const freq: Record<string, number> = {};
  for (const row of rows) {
    for (const ct of (row.coverage_types as string[])) {
      freq[ct] = (freq[ct] ?? 0) + 1;
    }
  }
  const topCoverageTypes = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ct]) => ct);

  // Read current usage_count so we can increment it
  const { data: current } = await admin
    .from("certificate_holders")
    .select("usage_count")
    .eq("id", holderId)
    .eq("user_id", userId)
    .single();

  const currentCount = (current?.usage_count as number) ?? 0;

  const { error: updateErr } = await admin
    .from("certificate_holders")
    .update({
      usage_count: currentCount + 1,
      last_requested_at: new Date().toISOString(),
      common_insured_names: recentInsuredNames,
      common_coverage_types: topCoverageTypes,
    })
    .eq("id", holderId)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[holders/record-usage] Update failed:", updateErr.message);
    // Non-fatal — history row was already written
  }

  return NextResponse.json({ success: true, holder_id: holderId });
}
