/**
 * GET /api/hollis-actions
 * Returns a cursor-paginated merged feed of hollis_actions + renewal_audit_log.
 *
 * Query params:
 *   limit   – records per page (default 50, max 200)
 *   before  – ISO cursor: return rows older than this timestamp (for infinite scroll)
 *   group   – filter tab: "all" | "renewals" | "doc_chase" | "coi" | "policy_check"
 *   search  – partial match against client_name or policy_name
 *
 * Each row carries a `source` discriminator: "action" (hollis_actions) or "event"
 * (renewal_audit_log).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Action types included per filter group
const ACTION_GROUP_TYPES: Record<string, string[]> = {
  renewals:     ["renewal_email","renewal_sms","renewal_intent_classified","renewal_stage_transition","renewal_halted","approval_queued","escalation","silence_detected"],
  doc_chase:    ["doc_chase_email","doc_chase_sms","doc_chase_escalated"],
  coi:          ["coi_generated"],
  policy_check: ["policy_check"],
};

// Audit log event types included per filter group (empty = skip audit query for that group)
const AUDIT_GROUP_TYPES: Record<string, string[]> = {
  renewals:     ["email_sent","sms_sent","questionnaire_sent","questionnaire_responded","insurer_terms_logged","submission_sent","recommendation_sent","client_confirmed","final_notice_sent","lapse_recorded","signal_received","tier_1_action","tier_2_drafted","tier_3_escalated","sequence_halted","flag_set","escalation_resolved"],
  doc_chase:    ["doc_requested","doc_received"],
  coi:          [],
  policy_check: [],
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "50", 10), 200);
  const before = searchParams.get("before") ?? null;   // ISO cursor
  const group  = searchParams.get("group")  ?? "all";
  const search = searchParams.get("search")?.trim() ?? "";

  // Fetch limit+1 from each table so we can detect hasMore
  const fetchLimit = limit + 1;

  // ── hollis_actions query ──────────────────────────────────────────────────
  let actionsQ = supabase
    .from("hollis_actions")
    .select(`*, policies(policy_name, client_name)`)
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (before) actionsQ = actionsQ.lt("created_at", before);
  if (group !== "all" && ACTION_GROUP_TYPES[group]) {
    actionsQ = actionsQ.in("action_type", ACTION_GROUP_TYPES[group]);
  }

  // ── renewal_audit_log query ───────────────────────────────────────────────
  const auditTypes = group === "all" ? null : (AUDIT_GROUP_TYPES[group] ?? []);
  const skipAudit  = auditTypes !== null && auditTypes.length === 0;

  let auditQ = supabase
    .from("renewal_audit_log")
    .select(`id, event_type, channel, content_snapshot, recipient, metadata, created_at, policy_id, policies(policy_name, client_name)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (before)    auditQ = auditQ.lt("created_at", before);
  if (auditTypes?.length) auditQ = auditQ.in("event_type", auditTypes);

  // Run both in parallel (skip audit if the group has no relevant event types)
  const [actionsRes, auditRes] = await Promise.all([
    actionsQ,
    skipAudit
      ? Promise.resolve({ data: [] as Record<string, unknown>[], error: null })
      : auditQ,
  ]);

  if (actionsRes.error) return NextResponse.json({ error: actionsRes.error.message }, { status: 500 });
  if (auditRes.error)   return NextResponse.json({ error: auditRes.error.message  }, { status: 500 });

  // ── Tag + merge + sort ────────────────────────────────────────────────────
  const actionRows = (actionsRes.data ?? []).map(r => ({ ...r, source: "action" as const }));
  const auditRows  = (auditRes.data   ?? []).map(r => ({ ...r, source: "event"  as const }));

  const merged = [...actionRows, ...auditRows].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  );

  // ── Client-side search (join columns can't be ilike'd server-side) ────────
  const filtered = search
    ? merged.filter(r => {
        const q = search.toLowerCase();
        const p = r.policies as { client_name?: string; policy_name?: string } | null;
        const client = (p?.client_name ?? "").toLowerCase();
        const policy = (p?.policy_name ?? "").toLowerCase();
        return client.includes(q) || policy.includes(q);
      })
    : merged;

  const hasMore    = filtered.length > limit;
  const page       = filtered.slice(0, limit);
  const nextCursor = page.length > 0 ? (page[page.length - 1].created_at as string) : null;

  return NextResponse.json({ data: page, hasMore, nextCursor });
}
