/**
 * GET  /api/briefing
 * Returns a list of BriefingItem objects for the authenticated agent's morning briefing.
 * Collects a snapshot of the book, calls Claude Haiku once, caches by user+date.
 *
 * DELETE /api/briefing
 * Clears the in-memory cache for the current user so the refresh button works.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { BriefingItem } from "@/types/briefing";

const MODEL = "claude-haiku-4-5-20251001";

// ── In-memory cache ───────────────────────────────────────────────────────────
// Keyed by `${userId}-${YYYY-MM-DD}`. Date change = automatic invalidation.
// Module-level so it survives within a warm serverless instance.

const briefingCache = new Map<string, BriefingItem[]>();

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function cacheKey(userId: string): string {
  return `${userId}-${todayString()}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

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

// ── Fallback items when Claude fails ──────────────────────────────────────────

interface PolicySnap {
  id: string;
  client_name: string;
  policy_name: string | null;
  expiration_date: string;
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

function buildFallback(
  critical: PolicySnap[],
  upcoming: PolicySnap[],
  overdueTP: TouchSnap[],
  pendingCOI: number,
  expiringCerts: CertSnap[],
): BriefingItem[] {
  const items: BriefingItem[] = [];

  if (critical.length === 1) {
    items.push({
      text: `${critical[0].client_name}'s policy expires in ${daysUntil(critical[0].expiration_date)} days — reach out today.`,
      type: "renewal",
      id: critical[0].id,
    });
  } else if (critical.length > 1) {
    items.push({
      text: `${critical.length} policies are expiring within 14 days — immediate action needed.`,
      type: "renewal",
      id: critical[0].id,
    });
  }

  if (overdueTP.length > 0) {
    const clientName = overdueTP[0].policies?.client_name ?? "a client";
    items.push({
      text: `You have ${overdueTP.length} overdue campaign touchpoint${overdueTP.length === 1 ? "" : "s"} — ${clientName} is waiting.`,
      type: "renewal",
      id: overdueTP[0].policies?.id ?? null,
    });
  }

  if (pendingCOI > 0) {
    items.push({
      text: `${pendingCOI} COI request${pendingCOI === 1 ? " is" : "s are"} pending approval.`,
      type: "coi",
      id: null,
    });
  }

  if (expiringCerts.length > 0) {
    items.push({
      text: `${expiringCerts.length} certificate${expiringCerts.length === 1 ? "" : "s"} expire within 30 days — review now.`,
      type: "certificate",
      id: expiringCerts[0].id,
    });
  }

  if (upcoming.length > 0 && items.length < 3) {
    items.push({
      text: `${upcoming.length} more polic${upcoming.length === 1 ? "y" : "ies"} renewing in the next 45 days.`,
      type: "renewal",
      id: upcoming[0].id,
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

  // Cache hit
  const key = cacheKey(user.id);
  const cached = briefingCache.get(key);
  if (cached) {
    return NextResponse.json(cached);
  }

  const today = todayString();
  const in14 = addDays(14);
  const in45 = addDays(45);
  const in30 = addDays(30);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // ── Parallel data fetch ──────────────────────────────────────

  const [
    criticalRes,
    upcomingRes,
    overdueTouchpointsRes,
    pendingCOIRes,
    expiringCertsRes,
    recentActivityRes,
    activePolicyCountRes,
  ] = await Promise.all([
    // Policies expiring within 14 days
    supabase
      .from("policies")
      .select("id, client_name, policy_name, expiration_date")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("expiration_date", today)
      .lte("expiration_date", in14)
      .order("expiration_date")
      .limit(5),

    // Policies expiring in 15–45 days
    supabase
      .from("policies")
      .select("id, client_name, policy_name, expiration_date")
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
  ]);

  const activePolicyCount = activePolicyCountRes.count ?? 0;

  // ── Onboarding: agent has no data yet ────────────────────────
  if (activePolicyCount === 0) {
    const onboarding: BriefingItem[] = [
      {
        text: "Import your book of business to get started — Hollis will brief you on what needs attention each morning.",
        type: "import",
        id: null,
      },
    ];
    briefingCache.set(key, onboarding);
    return NextResponse.json(onboarding);
  }

  const critical = (criticalRes.data ?? []) as PolicySnap[];
  const upcoming = (upcomingRes.data ?? []) as PolicySnap[];
  const overdueTP = (overdueTouchpointsRes.data ?? []) as unknown as TouchSnap[];
  const pendingCOI = pendingCOIRes.count ?? 0;
  const expiringCerts = (expiringCertsRes.data ?? []) as CertSnap[];
  const recentActivity = recentActivityRes.count ?? 0;

  // ── Claude Haiku: single call to synthesise briefing ─────────

  // Build the data snapshot for the prompt
  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const lines: string[] = [`Today is ${todayFormatted}.`, ""];

  if (critical.length > 0) {
    lines.push("CRITICAL — policies expiring within 14 days:");
    for (const p of critical) {
      lines.push(
        `  • ${p.client_name} | ${p.policy_name ?? "Policy"} | expires ${fmtDate(p.expiration_date)} (${daysUntil(p.expiration_date)} days) | policy_id: ${p.id}`
      );
    }
    lines.push("");
  }

  if (upcoming.length > 0) {
    lines.push(`UPCOMING — expiring in 15–45 days (${upcoming.length} total):`);
    for (const p of upcoming) {
      lines.push(
        `  • ${p.client_name} | ${p.policy_name ?? "Policy"} | in ${daysUntil(p.expiration_date)} days | policy_id: ${p.id}`
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
1. Lead with the most critical item first (soonest expiry or most overdue).
2. Be specific: use real client names, real day counts ("in 8 days"), real numbers.
3. Second person: "You have…", "Sarah's policy…", "Three clients…".
4. Tone: direct and warm. One sentence per item. No filler, no sign-off.
5. For renewal items, set "id" to the exact policy_id UUID from the snapshot above.
6. For certificate items, set "id" to the exact cert_id UUID from the snapshot above.
7. For COI or document items, set "id" to null.
8. "type" must be one of: renewal, coi, certificate, document.

Return ONLY a valid JSON array — no markdown fences, no preamble, no explanation:
[{"text": "...", "type": "renewal", "id": "uuid-or-null"}, ...]`;

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
      items = buildFallback(critical, upcoming, overdueTP, pendingCOI, expiringCerts);
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
        }));

      if (items.length === 0) {
        items = buildFallback(critical, upcoming, overdueTP, pendingCOI, expiringCerts);
      }
    }
  } catch (err) {
    console.error("[briefing] Claude call failed:", err);
    items = buildFallback(critical, upcoming, overdueTP, pendingCOI, expiringCerts);
  }

  // Cache and return
  briefingCache.set(key, items);
  return NextResponse.json(items);
}

// ── DELETE handler — clear cache for current user ─────────────────────────────

export async function DELETE(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  briefingCache.delete(cacheKey(user.id));
  return NextResponse.json({ cleared: true });
}
