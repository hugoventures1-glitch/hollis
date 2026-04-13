/**
 * POST /api/clients/[id]/ask
 *
 * Client-scoped AI endpoint. Gathers fresh context for one client and
 * returns { reply, artifact } where artifact is a structured renderable
 * object (table | card | text | timeline) rather than plain text.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { ArtifactResponse, ClientAskResponse } from "@/types/assistant";

const MODEL = "claude-haiku-4-5-20251001";

type RouteParams = { params: Promise<{ id: string }> };

const STAGE_LABEL: Record<string, string> = {
  pending:             "Not started",
  email_90_sent:       "90d email sent",
  email_60_sent:       "60d email sent",
  sms_30_sent:         "30d SMS sent",
  script_14_ready:     "Script ready",
  questionnaire_sent:  "Questionnaire sent",
  submission_sent:     "Submitted",
  recommendation_sent: "Recommendation sent",
  final_notice_sent:   "Final notice sent",
  confirmed:           "Confirmed",
  complete:            "Complete",
  lapsed:              "Lapsed",
};

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-AU", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string): number {
  const exp = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Auth: verify client belongs to this user
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, email, phone, business_type, industry, primary_state, notes")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let message: string;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    ({ message, history = [] } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const nameFilter = `%${client.name}%`;
  const emailFilter = (client.email ?? "").trim().toLowerCase();

  // Gather fresh client context in parallel
  const [
    policiesRes,
    coiRes,
    docChaseRes,
    certsRes,
    timelineRes,
  ] = await Promise.all([
    supabase
      .from("policies")
      .select("id, policy_name, expiration_date, campaign_stage, health_label, carrier, premium, status, client_confirmed_at")
      .eq("user_id", user.id)
      .ilike("client_name", nameFilter)
      .order("expiration_date", { ascending: true })
      .limit(20),

    supabase
      .from("coi_requests")
      .select("id, holder_name, insured_name, status, created_at, certificate_id")
      .eq("user_id", user.id)
      .ilike("insured_name", nameFilter)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("doc_chase_requests")
      .select("id, document_type, status, escalation_level, created_at")
      .eq("user_id", user.id)
      .or(
        emailFilter
          ? `client_name.ilike.${nameFilter},client_email.eq.${emailFilter}`
          : `client_name.ilike.${nameFilter}`
      )
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("certificates")
      .select("id, certificate_number, holder_name, status, expiration_date, sent_at")
      .eq("user_id", user.id)
      .ilike("insured_name", nameFilter)
      .order("created_at", { ascending: false })
      .limit(20),

    // Timeline: last 20 comms
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/clients/${clientId}/timeline`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
    })
      .then((r) => r.ok ? r.json() : { items: [] })
      .catch(() => ({ items: [] })),
  ]);

  const policies  = policiesRes.data  ?? [];
  const cois      = coiRes.data       ?? [];
  const docChases = docChaseRes.data  ?? [];
  const certs     = certsRes.data     ?? [];
  const timeline  = (timelineRes.items ?? []) as Array<{
    id: string; source: string; channel: string; status: string;
    timestamp: string; subject?: string; description: string; link?: string;
  }>;

  // Build context snapshot for Claude
  const contextSummary = {
    client: {
      name: client.name,
      email: client.email ?? null,
      phone: client.phone ?? null,
      businessType: client.business_type ?? null,
      industry: client.industry ?? null,
      state: client.primary_state ?? null,
      notes: client.notes ?? null,
    },
    activePolicies: policies
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: p.id,
        name: p.policy_name,
        carrier: p.carrier ?? null,
        stage: STAGE_LABEL[p.campaign_stage ?? ""] ?? p.campaign_stage ?? "—",
        health: p.health_label ?? null,
        expiresOn: formatDate(p.expiration_date),
        daysRemaining: daysUntil(p.expiration_date),
        confirmedOn: p.client_confirmed_at ? formatDate(p.client_confirmed_at) : null,
      })),
    coiRequests: cois.map((c) => ({
      id: c.id,
      holder: c.holder_name ?? null,
      status: c.status,
      requestedOn: formatDate(c.created_at),
      certificateId: c.certificate_id ?? null,
    })),
    docChaseRequests: docChases.map((d) => ({
      id: d.id,
      documentType: d.document_type ?? null,
      status: d.status,
      escalationLevel: d.escalation_level ?? null,
      createdOn: formatDate(d.created_at),
    })),
    certificates: certs.map((c) => ({
      id: c.id,
      number: c.certificate_number ?? null,
      holder: c.holder_name ?? null,
      status: c.status,
      expires: formatDate(c.expiration_date),
      sentOn: formatDate(c.sent_at),
    })),
    recentCommunications: timeline.slice(0, 15).map((t) => ({
      description: t.description,
      channel: t.channel,
      status: t.status,
      timestamp: formatDate(t.timestamp),
      link: t.link ?? null,
    })),
  };

  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const systemPrompt = `You are Hollis, an AI assistant inside an insurance broker's book-of-business software. You are answering questions about a specific client: ${client.name}.

Today: ${today}

Client context:
${JSON.stringify(contextSummary, null, 2)}

Your job is to answer the broker's question about this client and return a structured response.

RESPONSE FORMAT — you must respond with valid JSON only, no prose outside the JSON:
{
  "reply": "One or two sentences answering the question directly. Concise, specific, no fluff.",
  "artifact": {
    "type": "table" | "card" | "text" | "timeline",
    "title": "Optional short title",
    ... type-specific fields
  }
}

ARTIFACT TYPE RULES:
- Use "table" when returning a list of similar items (COIs, certs, policies, communications). Include "columns" (array of column name strings) and "rows" (array of objects with column names as keys).
- Use "card" when summarising a single record. Include "fields" as [{label, value}].
- Use "timeline" when showing communication history. Include "items" matching the recentCommunications shape: [{description, channel, status, timestamp, link}].
- Use "text" only for general answers with no structured data. Include "content" with the answer text (may use newlines).
- Set artifact to null if the reply fully answers the question and no visual data is needed.

STYLE RULES:
- Never open with a greeting or your name.
- Keep reply to 1-2 sentences. The artifact carries the detail.
- Never use internal field names, IDs, or technical database terms in the reply text.
- Never imply you can send emails, update records, or take actions.
- If data needed is not available, say so in one sentence.`;

  const claudeMessages = [
    ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  let rawReply: string;
  try {
    const anthropic = getAnthropicClient();
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });
    rawReply = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  } catch {
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }

  // Parse structured JSON response
  let reply = "I couldn't process that request.";
  let artifact: ArtifactResponse | null = null;

  try {
    // Strip markdown code fences if Claude wraps the JSON
    const cleaned = rawReply.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.reply === "string") reply = parsed.reply;
    if (parsed.artifact && typeof parsed.artifact === "object") {
      artifact = parsed.artifact as ArtifactResponse;
    }
  } catch {
    // Fallback: treat raw reply as text artifact
    reply = rawReply.slice(0, 300);
    artifact = { type: "text", content: rawReply };
  }

  return NextResponse.json({ reply, artifact } satisfies ClientAskResponse);
}
