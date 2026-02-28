import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { AssistantContext, AssistantMessage, AssistantAction } from "@/types/assistant";

const MODEL = "claude-haiku-4-5-20251001";

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "unknown";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Data Gathering ────────────────────────────────────────────────────────────

async function gatherContextData(
  page: AssistantContext["page"],
  userId: string
): Promise<Record<string, unknown>> {
  const admin = createAdminClient();

  if (page === "overview") {
    const [activePolicies, expiringPolicies, pendingCOIs, recentLogs] = await Promise.all([
      admin
        .from("policies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active"),
      admin
        .from("policies")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active")
        .lte("expiration_date", addDays(30))
        .gte("expiration_date", new Date().toISOString().split("T")[0]),
      admin
        .from("coi_requests")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", userId)
        .eq("status", "pending"),
      admin
        .from("send_logs")
        .select("channel, status, sent_at, recipient")
        .eq("user_id", userId)
        .order("sent_at", { ascending: false })
        .limit(5),
    ]);

    return {
      activePoliciesCount: activePolicies.count ?? 0,
      policiesExpiringIn30Days: expiringPolicies.count ?? 0,
      pendingCOIRequests: pendingCOIs.count ?? 0,
      recentActivity: (recentLogs.data ?? []).map((l) => ({
        channel: l.channel,
        status: l.status,
        recipient: l.recipient,
        sentAt: formatDate(l.sent_at),
      })),
    };
  }

  if (page === "renewals") {
    const { data } = await admin
      .from("policies")
      .select("policy_name, client_name, carrier, expiration_date, premium, campaign_stage, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("expiration_date", { ascending: true })
      .limit(20);

    return {
      policies: (data ?? []).map((p) => ({
        client: p.client_name,
        policy: p.policy_name,
        carrier: p.carrier,
        expiresOn: formatDate(p.expiration_date),
        premium: p.premium ? `$${Number(p.premium).toLocaleString()}` : null,
        stage: p.campaign_stage,
      })),
    };
  }

  if (page === "certificates") {
    const { data } = await admin
      .from("certificates")
      .select("insured_name, holder_name, status, expiration_date, has_gap, certificate_number")
      .eq("user_id", userId)
      .order("expiration_date", { ascending: true })
      .limit(20);

    return {
      certificates: (data ?? []).map((c) => ({
        insured: c.insured_name,
        holder: c.holder_name,
        status: c.status,
        expiresOn: formatDate(c.expiration_date),
        hasGap: c.has_gap,
        number: c.certificate_number,
      })),
    };
  }

  if (page === "clients") {
    const { data } = await admin
      .from("clients")
      .select("name, email, phone, business_type, industry")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .limit(20);

    return {
      clients: (data ?? []).map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
        businessType: c.business_type,
        industry: c.industry,
      })),
    };
  }

  if (page === "documents") {
    const { data } = await admin
      .from("doc_chase_requests")
      .select("client_name, document_type, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const counts = (data ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      documentRequests: (data ?? []).map((r) => ({
        client: r.client_name,
        documentType: r.document_type,
        status: r.status,
        created: formatDate(r.created_at),
      })),
      summary: counts,
    };
  }

  if (page === "policies") {
    const { data } = await admin
      .from("policy_checks")
      .select("overall_status, summary_verdict, overall_confidence, summary_note, created_at, client_business_type, client_industry")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const verdictCounts = (data ?? []).reduce<Record<string, number>>((acc, r) => {
      const k = r.summary_verdict ?? "pending";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    return {
      policyChecks: (data ?? []).map((c) => ({
        status: c.overall_status,
        verdict: c.summary_verdict,
        confidence: c.overall_confidence,
        note: c.summary_note,
        businessType: c.client_business_type,
        createdOn: formatDate(c.created_at),
      })),
      verdictSummary: verdictCounts,
    };
  }

  if (page === "outbox") {
    const [pendingDrafts, recentSent] = await Promise.all([
      admin
        .from("outbox_drafts")
        .select("subject, created_at")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("outbox_drafts")
        .select("subject, sent_at, status")
        .eq("user_id", userId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(5),
    ]);

    return {
      pendingDrafts: (pendingDrafts.data ?? []).map((d) => ({
        subject: d.subject,
        createdOn: formatDate(d.created_at),
      })),
      recentlySent: (recentSent.data ?? []).map((d) => ({
        subject: d.subject,
        sentOn: formatDate(d.sent_at),
      })),
    };
  }

  // 'other' — no pre-fetch
  return {};
}

// ── Prompt Builder ────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<AssistantContext["page"], string> = {
  overview: "Overview dashboard",
  renewals: "Renewals — active policies approaching expiration",
  certificates: "Certificates of Insurance (COIs)",
  clients: "Clients CRM",
  documents: "Document Chasing — outstanding documents from clients",
  policies: "Policy Audit — coverage checks and flag review",
  outbox: "Outbox — AI-generated email drafts awaiting review",
  other: "General",
};

function buildSystemPrompt(
  page: AssistantContext["page"],
  contextData: Record<string, unknown>
): string {
  const dataSection =
    Object.keys(contextData).length > 0
      ? `\n\nLive data from this agent's account (current page: ${PAGE_LABELS[page]}):\n${JSON.stringify(contextData, null, 2)}`
      : `\n\nNo specific data pre-loaded for this page.`;

  return `You are Hollis Assistant — an expert AI for independent insurance agents. You have access to live data from this agent's book of business and answer their questions with specific, real information.

Current page the agent is viewing: ${PAGE_LABELS[page]}${dataSection}

Instructions:
- Answer questions using the real data provided above. Reference specific names, counts, and dates.
- If data for something isn't in the provided context, say so honestly and tell the agent where to find it.
- Never expose raw database column names, internal IDs, or technical field names in your response.
- Never claim you can take actions (send emails, update records, etc.) — suggest actions instead.
- Keep responses under 120 words. Be direct, specific, and scannable — not wordy.
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

After your prose response, optionally include 0–2 genuinely useful action suggestions as JSON on a new line:
[ACTIONS: [{"label": "View Renewals", "href": "/renewals"}, {"label": "Refresh", "onClick": "refresh"}]]

Only include actions that are directly relevant to what the agent asked. If no actions are needed, omit the [ACTIONS:] line entirely. Never make up actions that don't exist in the product.

Available pages for href actions: /overview, /renewals, /certificates, /certificates/sequences, /policies, /clients, /documents, /outbox`;
}

// ── Response Parser ───────────────────────────────────────────────────────────

function parseResponse(raw: string): { reply: string; actions: AssistantAction[] } {
  const actionsMatch = raw.match(/\[ACTIONS:\s*(\[[\s\S]*?\])\s*\]?\s*$/);
  let actions: AssistantAction[] = [];
  let reply = raw.trim();

  if (actionsMatch) {
    try {
      const parsed = JSON.parse(actionsMatch[1]);
      if (Array.isArray(parsed)) {
        actions = parsed.filter(
          (a): a is AssistantAction =>
            typeof a === "object" && a !== null && typeof a.label === "string"
        );
      }
    } catch {
      // Malformed actions JSON — ignore
    }
    // Strip the [ACTIONS: ...] block from the reply
    reply = raw.slice(0, actionsMatch.index).trim();
  }

  return { reply, actions };
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let message: string;
  let context: AssistantContext;
  let history: AssistantMessage[];

  try {
    ({ message, context, history } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // ── Step 1: Gather live data ──────────────────────────────────────────────
  let contextData: Record<string, unknown> = {};
  try {
    contextData = await gatherContextData(context.page, user.id);
    // Merge any caller-supplied data (page component context)
    if (context.data) {
      contextData = { ...contextData, ...context.data };
    }
  } catch {
    // Non-fatal — Claude can still answer without data
    contextData = {};
  }

  // ── Step 2: Call Claude Haiku ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(context.page, contextData);

  // Include last 3 messages from history for conversational context
  const recentHistory = (history ?? []).slice(-3);
  const claudeMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...recentHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  let rawReply: string;
  try {
    const anthropic = getAnthropicClient();
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: claudeMessages,
    });
    rawReply = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch {
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }

  // ── Step 3: Parse and return ──────────────────────────────────────────────
  const { reply, actions } = parseResponse(rawReply);
  return NextResponse.json({ reply, actions });
}
