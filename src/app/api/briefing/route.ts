/**
 * GET  /api/briefing
 * Returns a list of BriefingItem objects for the authenticated agent's morning briefing.
 * Collects a snapshot of the book, calls Claude Haiku once, caches result in Supabase
 * (briefing_cache table, keyed by user_id + date) so it survives serverless cold starts.
 *
 * DELETE /api/briefing
 * Clears the Supabase cache row for the current user so the refresh button works.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { BriefingItem } from "@/types/briefing";

const MODEL = "claude-haiku-4-5-20251001";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Snapshot interfaces ───────────────────────────────────────────────────────

interface PolicySnap {
  id: string;
  client_name: string;
  policy_name: string | null;
  expiration_date: string;
  campaign_stage: string | null;
}

interface CertSnap {
  id: string;
  insured_name: string;
  holder_name: string;
  expiration_date: string;
}

interface TouchSnap {
  id: string;
  type: string;
  scheduled_at: string;
  policies: { id: string; client_name: string } | null;
}

interface ApprovalSnap {
  id: string;
  classified_intent: string;
  raw_signal_snippet: string;
}

interface InboundSnap {
  id: string;
  sender_name: string | null;
  source: string;
}

interface DocChaseSnap {
  id: string;
  client_name: string;
  document_type: string;
  escalation_level: string;
}

// ── Fallback items when Claude fails ──────────────────────────────────────────

function buildFallback(
  critical: PolicySnap[],
  upcoming: PolicySnap[],
  overdueTP: TouchSnap[],
  pendingCOI: number,
  expiringCerts: CertSnap[],
  pendingApprovals: ApprovalSnap[],
  unprocessedSignals: InboundSnap[],
  overdueDocChase: DocChaseSnap[],
): BriefingItem[] {
  const items: BriefingItem[] = [];

  if (pendingApprovals.length > 0) {
    items.push({
      text: `${pendingApprovals.length} action${pendingApprovals.length === 1 ? "" : "s"} waiting in your approval queue — review before acting.`,
      type: "renewal",
      id: null,
      urgency: "high",
    });
  }

  if (unprocessedSignals.length > 0) {
    const name = unprocessedSignals[0].sender_name ?? "A client";
    items.push({
      text: `${unprocessedSignals.length === 1 ? `${name} replied` : `${unprocessedSignals.length} clients replied`} in the last 48 hours — check inbound signals.`,
      type: "renewal",
      id: null,
      urgency: "high",
    });
  }

  if (critical.length === 1) {
    items.push({
      text: `${critical[0].client_name}'s policy expires in ${daysUntil(critical[0].expiration_date)} days — reach out today.`,
      type: "renewal",
      id: critical[0].id,
      urgency: "high",
    });
  } else if (critical.length > 1) {
    items.push({
      text: `${critical.length} policies are expiring within 14 days — immediate action needed.`,
      type: "renewal",
      id: critical[0].id,
      urgency: "high",
    });
  }

  if (overdueTP.length > 0) {
    const clientName = overdueTP[0].policies?.client_name ?? "a client";
    items.push({
      text: `You have ${overdueTP.length} overdue campaign touchpoint${overdueTP.length === 1 ? "" : "s"} — ${clientName} is waiting.`,
      type: "renewal",
      id: overdueTP[0].policies?.id ?? null,
      urgency: "high",
    });
  }

  if (overdueDocChase.length > 0) {
    items.push({
      text: `${overdueDocChase.length} document request${overdueDocChase.length === 1 ? "" : "s"} still outstanding — follow up today.`,
      type: "document",
      id: null,
      urgency: "normal",
    });
  }

  if (pendingCOI > 0) {
    items.push({
      text: `${pendingCOI} COI request${pendingCOI === 1 ? " is" : "s are"} pending approval.`,
      type: "coi",
      id: null,
      urgency: "normal",
    });
  }

  if (expiringCerts.length > 0) {
    items.push({
      text: `${expiringCerts.length} certificate${expiringCerts.length === 1 ? "" : "s"} expire within 30 days — review now.`,
      type: "certificate",
      id: expiringCerts[0].id,
      urgency: "normal",
    });
  }

  if (upcoming.length > 0 && items.length < 3) {
    items.push({
      text: `${upcoming.length} more polic${upcoming.length === 1 ? "y" : "ies"} renewing in the next 45 days.`,
      type: "renewal",
      id: upcoming[0].id,
      urgency: "normal",
    });
  }

  return items;
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Cache read (Supabase — survives cold starts) ──────────────────────────
  const { data: cached } = await supabase
    .from("briefing_cache")
    .select("items")
    .eq("user_id", user.id)
    .eq("cache_date", todayString())
    .single();

  if (cached) {
    return NextResponse.json(cached.items);
  }

  const today = todayString();
  const in14 = addDays(14);
  const in45 = addDays(45);
  const in30 = addDays(30);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3_600_000).toISOString();

  // ── Parallel data fetch ───────────────────────────────────────────────────

  const [
    criticalRes,
    upcomingRes,
    overdueTouchpointsRes,
    pendingCOIRes,
    expiringCertsRes,
    recentActivityRes,
    activePolicyCountRes,
    pendingApprovalsRes,
    unprocessedSignalsRes,
    overdueDocChaseRes,
  ] = await Promise.all([
    // Policies expiring within 14 days
    supabase
      .from("policies")
      .select("id, client_name, policy_name, expiration_date, campaign_stage")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("expiration_date", today)
      .lte("expiration_date", in14)
      .order("expiration_date")
      .limit(5),

    // Policies expiring in 15–45 days
    supabase
      .from("policies")
      .select("id, client_name, policy_name, expiration_date, campaign_stage")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expiration_date", in14)
      .lte("expiration_date", in45)
      .order("expiration_date")
      .limit(5),

    // Overdue campaign touchpoints (status=pending, scheduled_at <= today)
    supabase
      .from("campaign_touchpoints")
      .select("id, type, scheduled_at, policies(id, client_name)")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lte("scheduled_at", today)
      .order("scheduled_at")
      .limit(5),

    // Pending COI requests — uses agent_id per COI schema
    supabase
      .from("coi_requests")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", user.id)
      .eq("status", "pending"),

    // Certificates expiring within 30 days
    supabase
      .from("certificates")
      .select("id, insured_name, holder_name, expiration_date")
      .eq("user_id", user.id)
      .gte("expiration_date", today)
      .lte("expiration_date", in30)
      .neq("status", "expired")
      .order("expiration_date")
      .limit(5),

    // Recent send activity (last 7 days — volume signal for Claude)
    supabase
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("sent_at", sevenDaysAgo),

    // Total active policy count — determines onboarding vs all-clear
    supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active"),

    // Approval queue: pending broker decisions
    supabase
      .from("approval_queue")
      .select("id, classified_intent, raw_signal_snippet")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at")
      .limit(5),

    // Inbound signals: unprocessed client replies in the last 48 hours
    supabase
      .from("inbound_signals")
      .select("id, sender_name, source")
      .eq("user_id", user.id)
      .eq("processed", false)
      .gte("created_at", fortyEightHoursAgo)
      .order("created_at")
      .limit(5),

    // Doc chase requests still awaiting a document from the client
    supabase
      .from("doc_chase_requests")
      .select("id, client_name, document_type, escalation_level")
      .eq("user_id", user.id)
      .in("status", ["pending", "active"])
      .order("created_at")
      .limit(5),
  ]);

  const activePolicyCount = activePolicyCountRes.count ?? 0;

  // ── Onboarding: agent has no data yet ────────────────────────────────────
  if (activePolicyCount === 0) {
    const onboarding: BriefingItem[] = [
      {
        text: "Import your book of business to get started — Hollis will brief you on what needs attention each morning.",
        type: "import",
        id: null,
        urgency: "normal",
      },
    ];
    await supabase
      .from("briefing_cache")
      .upsert({ user_id: user.id, cache_date: todayString(), items: onboarding });
    return NextResponse.json(onboarding);
  }

  const critical = (criticalRes.data ?? []) as PolicySnap[];
  const upcoming = (upcomingRes.data ?? []) as PolicySnap[];
  const overdueTP = (overdueTouchpointsRes.data ?? []) as unknown as TouchSnap[];
  const pendingCOI = pendingCOIRes.count ?? 0;
  const expiringCerts = (expiringCertsRes.data ?? []) as CertSnap[];
  const recentActivity = recentActivityRes.count ?? 0;
  const pendingApprovals = (pendingApprovalsRes.data ?? []) as ApprovalSnap[];
  const unprocessedSignals = (unprocessedSignalsRes.data ?? []) as InboundSnap[];
  const overdueDocChase = (overdueDocChaseRes.data ?? []) as DocChaseSnap[];

  // ── Claude Haiku: single call to synthesise briefing ─────────────────────

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [`Today is ${todayFormatted}.`, ""];

  if (pendingApprovals.length > 0) {
    lines.push(`PENDING APPROVAL QUEUE (${pendingApprovals.length} actions awaiting broker decision):`);
    for (const a of pendingApprovals) {
      const snippet = a.raw_signal_snippet.slice(0, 80);
      lines.push(`  • intent: ${a.classified_intent} | "${snippet}" | approval_id: ${a.id}`);
    }
    lines.push("");
  }

  if (unprocessedSignals.length > 0) {
    lines.push(`UNPROCESSED CLIENT REPLIES in last 48h (${unprocessedSignals.length}):`);
    for (const s of unprocessedSignals) {
      lines.push(`  • ${s.sender_name ?? "Unknown"} via ${s.source}`);
    }
    lines.push("");
  }

  if (critical.length > 0) {
    lines.push("CRITICAL — policies expiring within 14 days:");
    for (const p of critical) {
      lines.push(
        `  • ${p.client_name} | ${p.policy_name ?? "Policy"} | expires ${fmtDate(p.expiration_date)} (${daysUntil(p.expiration_date)} days) | stage: ${p.campaign_stage ?? "unknown"} | policy_id: ${p.id}`
      );
    }
    lines.push("");
  }

  if (upcoming.length > 0) {
    lines.push(`UPCOMING — expiring in 15–45 days (${upcoming.length} total):`);
    for (const p of upcoming) {
      lines.push(
        `  • ${p.client_name} | ${p.policy_name ?? "Policy"} | in ${daysUntil(p.expiration_date)} days | stage: ${p.campaign_stage ?? "unknown"} | policy_id: ${p.id}`
      );
    }
    lines.push("");
  }

  if (overdueTP.length > 0) {
    lines.push(`OVERDUE CAMPAIGN TOUCHPOINTS (${overdueTP.length}):`);
    for (const t of overdueTP) {
      const clientName = t.policies?.client_name ?? "Unknown";
      lines.push(
        `  • ${clientName} | ${t.type} touchpoint | due ${fmtDate(t.scheduled_at)}`
      );
    }
    lines.push("");
  }

  if (overdueDocChase.length > 0) {
    lines.push(`OVERDUE DOCUMENT REQUESTS (${overdueDocChase.length} clients haven't returned documents):`);
    for (const d of overdueDocChase) {
      lines.push(
        `  • ${d.client_name} | ${d.document_type} | escalation: ${d.escalation_level}`
      );
    }
    lines.push("");
  }

  if (pendingCOI > 0) {
    lines.push(`PENDING COI REQUESTS: ${pendingCOI}`);
    lines.push("");
  }

  if (expiringCerts.length > 0) {
    lines.push(`EXPIRING CERTIFICATES within 30 days (${expiringCerts.length}):`);
    for (const c of expiringCerts) {
      lines.push(
        `  • ${c.insured_name} → ${c.holder_name} | expires ${fmtDate(c.expiration_date)} | cert_id: ${c.id}`
      );
    }
    lines.push("");
  }

  if (recentActivity > 0) {
    lines.push(`RECENT ACTIVITY: ${recentActivity} outreach messages sent in the last 7 days.`);
    lines.push("");
  }

  const dataSnapshot = lines.join("\n");

  const prompt = `You are a trusted colleague briefing an independent insurance agent at the start of their workday. Here is a snapshot of their book:

${dataSnapshot}

Write 3–5 bullet points that surface only what genuinely needs attention today. If all items are low urgency or nothing critical exists, write 1–2 items.

Rules:
1. Lead with the most critical item first — approval queue and unprocessed client replies always come first.
2. Be specific: use real client names, real day counts ("in 8 days"), real numbers.
3. Second person: "You have…", "Sarah's policy…", "Three clients…".
4. Tone: direct and warm. One sentence per item. No filler, no sign-off.
5. For renewal items, set "id" to the exact policy_id UUID from the snapshot above.
6. For certificate items, set "id" to the exact cert_id UUID from the snapshot above.
7. For COI, document, or approval queue items, set "id" to null.
8. "type" must be one of: renewal, coi, certificate, document, import.
9. "urgency" must be "high" for items that require action today (approval queue, unprocessed signals, critical expiries, overdue touchpoints). Use "normal" for informational items.
10. Approval queue and unprocessed client signals are always "high" urgency.
11. When mentioning a policy's campaign stage, interpret it plainly: "pending" means outreach hasn't started; "email_60_sent" means a 60-day email was sent; "script_14_ready" means a phone script is ready. Only mention stage if it changes the urgency assessment.

Return ONLY a valid JSON array — no markdown fences, no preamble, no explanation:
[{"text": "...", "type": "renewal", "id": "uuid-or-null", "urgency": "high"}, ...]`;

  let items: BriefingItem[];

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "[]";

    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      items = buildFallback(critical, upcoming, overdueTP, pendingCOI, expiringCerts, pendingApprovals, unprocessedSignals, overdueDocChase);
    } else {
      // Validate and sanitise each item
      items = parsed
        .filter(
          (x): x is BriefingItem =>
            typeof x === "object" &&
            x !== null &&
            typeof x.text === "string" &&
            typeof x.type === "string" &&
            ["renewal", "coi", "certificate", "document", "import"].includes(x.type)
        )
        .map((x) => ({
          text: String(x.text),
          type: x.type as BriefingItem["type"],
          id: typeof x.id === "string" ? x.id : null,
          urgency: x.urgency === "high" || x.urgency === "normal" ? x.urgency : "normal",
        }));

      if (items.length === 0) {
        items = buildFallback(critical, upcoming, overdueTP, pendingCOI, expiringCerts, pendingApprovals, unprocessedSignals, overdueDocChase);
      }
    }
  } catch (err) {
    console.error("[briefing] Claude call failed:", err);
    items = buildFallback(critical, upcoming, overdueTP, pendingCOI, expiringCerts, pendingApprovals, unprocessedSignals, overdueDocChase);
  }

  // ── Cache write (Supabase) ────────────────────────────────────────────────
  await supabase
    .from("briefing_cache")
    .upsert({ user_id: user.id, cache_date: todayString(), items });

  return NextResponse.json(items);
}

// ── DELETE handler — clear Supabase cache for current user ────────────────────

export async function DELETE(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("briefing_cache")
    .delete()
    .eq("user_id", user.id)
    .eq("cache_date", todayString());

  return NextResponse.json({ cleared: true });
}
