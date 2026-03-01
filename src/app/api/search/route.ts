import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic/client";

const MODEL = "claude-haiku-4-5-20251001";

type TableName =
  | "policies"
  | "certificates"
  | "clients"
  | "coi_requests"
  | "doc_chase_requests"
  | "outbox_drafts";

interface SearchPlan {
  tables: TableName[];
  filters: Record<string, unknown>;
  summary: string;
}

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a search assistant for an insurance agency management system. Convert the user's natural language query into a structured JSON search plan.

Tables available:
- policies: client_name, policy_name, carrier, line_of_business, expiration_date, premium, campaign_stage, status (active/expired/cancelled)
- certificates: insured_name, holder_name, certificate_number, status (draft/sent/expired/outdated)
- clients: name, email, phone, business_type, industry, primary_state
- coi_requests: insured_name, holder_name, requester_name, status (pending/approved/rejected/sent/ready_for_approval/needs_review)
- doc_chase_requests: client_name, document_type, status (pending/active/received/cancelled)
- outbox_drafts: subject, status (pending/sent/dismissed)

Return ONLY valid JSON:
{ "tables": ["policies", "clients"], "filters": { "status": "active", "text_search": "martinez", "days_until_expiry_lte": 60 }, "summary": "Active policies expiring soon for Martinez" }

Available filter keys (all optional):
- text_search: when the query contains a name, company, or entity, always set this to that term and apply it across relevant tables so partial matches and multi-word terms work
- status: exact status value valid for the selected tables
- campaign_stage: exact stage for policies (pending/email_90_sent/email_60_sent/sms_30_sent/script_14_ready/complete)
- carrier: substring match on carrier name (policies only)
- client_name: substring match (policies, doc_chase_requests)
- insured_name: substring match (certificates, coi_requests)
- holder_name: substring match (certificates, coi_requests)
- days_until_expiry_lte: integer days from today (policies, certificates)
- days_until_expiry_gte: integer days from today (policies only)
- premium_gte, premium_lte: numeric (policies only)
- business_type, primary_state: exact (clients)
- document_type: substring (doc_chase_requests)

When the query looks like a name or company, set text_search and search multiple relevant tables.
When asking about a specific workflow (renewals, COIs, docs, outbox), include only those tables.
Always provide a short, natural-language summary.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/**
 * Build a PostgREST OR filter string that searches across multiple fields.
 * For multi-word queries, each word (≥ 2 chars) is searched independently,
 * giving partial/fuzzy matching without pg_trgm.
 *
 * e.g. "john mart" → matches "John Martinez" (hits "john" AND "mart" in OR clauses)
 */
function buildFuzzyOr(fields: string[], rawQuery: string): string {
  const phrase = rawQuery.trim();
  const words = phrase.split(/\s+/).filter((w) => w.length >= 2);
  // Full phrase + individual words for max coverage
  const terms = words.length > 1 ? [phrase, ...words] : [phrase];
  const conditions = new Set<string>();
  for (const field of fields) {
    for (const term of terms) {
      conditions.add(`${field}.ilike.%${term}%`);
    }
  }
  return [...conditions].join(",");
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

  let query: string;
  try {
    ({ query } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!query?.trim()) {
    return NextResponse.json({ results: [], summary: "" });
  }

  // ── Step 1: Claude parses query into a structured search plan ─────────────
  let plan: SearchPlan;
  try {
    const anthropic = getAnthropicClient();
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: query }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const json = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    plan = JSON.parse(json);
  } catch {
    return NextResponse.json({ error: "Failed to interpret query" }, { status: 500 });
  }

  const { tables = [], filters = {}, summary = "" } = plan;

  // text_search drives fuzzy matching; fall back to raw query when absent
  const textSearch = String(filters.text_search ?? "").trim();

  // ── Step 2: Run each table query with admin client (scoped to user.id) ────
  const admin = createAdminClient();
  const results: Record<string, unknown>[] = [];

  for (const table of tables) {
    // ── Policies ─────────────────────────────────────────────────────────────
    if (table === "policies") {
      let q = admin
        .from("policies")
        .select(
          "id, policy_name, client_name, carrier, expiration_date, premium, campaign_stage, status"
        )
        .eq("user_id", user.id);

      if (filters.status)         q = q.eq("status", String(filters.status));
      if (filters.campaign_stage) q = q.eq("campaign_stage", String(filters.campaign_stage));
      if (filters.carrier)        q = q.ilike("carrier", `%${filters.carrier}%`);
      if (filters.client_name)    q = q.ilike("client_name", `%${filters.client_name}%`);
      if (filters.days_until_expiry_lte != null)
        q = q.lte("expiration_date", addDays(Number(filters.days_until_expiry_lte)));
      if (filters.days_until_expiry_gte != null)
        q = q.gte("expiration_date", addDays(Number(filters.days_until_expiry_gte)));
      if (filters.premium_gte != null) q = q.gte("premium", Number(filters.premium_gte));
      if (filters.premium_lte != null) q = q.lte("premium", Number(filters.premium_lte));

      // Fuzzy text across key fields when Claude extracted a term
      if (textSearch) {
        q = q.or(buildFuzzyOr(["client_name", "policy_name", "carrier"], textSearch));
      }

      const { data } = await q.order("expiration_date").limit(15);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "policy" })));
    }

    // ── Certificates ─────────────────────────────────────────────────────────
    if (table === "certificates") {
      let q = admin
        .from("certificates")
        .select(
          "id, certificate_number, insured_name, holder_name, holder_city, holder_state, expiration_date, status, request_id"
        )
        .eq("user_id", user.id);

      if (filters.status)      q = q.eq("status", String(filters.status));
      if (filters.insured_name) q = q.ilike("insured_name", `%${filters.insured_name}%`);
      const holderVal = filters.holder_name ?? filters.certificate_holder;
      if (holderVal)           q = q.ilike("holder_name", `%${holderVal}%`);
      if (filters.days_until_expiry_lte != null)
        q = q.lte("expiration_date", addDays(Number(filters.days_until_expiry_lte)));

      if (textSearch) {
        q = q.or(
          buildFuzzyOr(["insured_name", "holder_name", "certificate_number"], textSearch)
        );
      }

      const { data } = await q.order("expiration_date").limit(15);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "certificate" })));
    }

    // ── Clients ───────────────────────────────────────────────────────────────
    if (table === "clients") {
      let q = admin
        .from("clients")
        .select("id, name, email, phone, business_type, industry, primary_state")
        .eq("user_id", user.id);

      if (filters.name)          q = q.ilike("name", `%${filters.name}%`);
      if (filters.business_type) q = q.eq("business_type", String(filters.business_type));
      if (filters.industry)      q = q.ilike("industry", `%${filters.industry}%`);
      if (filters.primary_state) q = q.eq("primary_state", String(filters.primary_state));

      if (textSearch) {
        q = q.or(buildFuzzyOr(["name", "email", "phone"], textSearch));
      }

      const { data } = await q.order("name").limit(15);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "client" })));
    }

    // ── COI Requests ──────────────────────────────────────────────────────────
    if (table === "coi_requests") {
      let q = admin
        .from("coi_requests")
        .select(
          "id, insured_name, holder_name, requester_name, requester_email, coverage_types, status, created_at, certificate_id"
        )
        .eq("agent_id", user.id);

      if (filters.status)       q = q.eq("status", String(filters.status));
      if (filters.insured_name) q = q.ilike("insured_name", `%${filters.insured_name}%`);
      if (filters.holder_name)  q = q.ilike("holder_name", `%${filters.holder_name}%`);

      if (textSearch) {
        q = q.or(
          buildFuzzyOr(["insured_name", "holder_name", "requester_name"], textSearch)
        );
      }

      const { data } = await q.order("created_at", { ascending: false }).limit(10);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "coi_request" })));
    }

    // ── Doc Chase Requests ────────────────────────────────────────────────────
    if (table === "doc_chase_requests") {
      let q = admin
        .from("doc_chase_requests")
        .select("id, client_name, client_email, document_type, status, created_at")
        .eq("user_id", user.id);

      if (filters.status)        q = q.eq("status", String(filters.status));
      if (filters.client_name)   q = q.ilike("client_name", `%${filters.client_name}%`);
      if (filters.document_type) q = q.ilike("document_type", `%${filters.document_type}%`);

      if (textSearch) {
        q = q.or(buildFuzzyOr(["client_name", "document_type"], textSearch));
      }

      const { data } = await q.order("created_at", { ascending: false }).limit(10);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "doc_chase" })));
    }

    // ── Outbox Drafts ─────────────────────────────────────────────────────────
    if (table === "outbox_drafts") {
      let q = admin
        .from("outbox_drafts")
        .select("id, subject, status, created_at, sent_at")
        .eq("user_id", user.id);

      if (filters.status) q = q.eq("status", String(filters.status));

      if (textSearch) {
        q = q.or(buildFuzzyOr(["subject"], textSearch));
      }

      const { data } = await q.order("created_at", { ascending: false }).limit(10);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "outbox_draft" })));
    }
  }

  return NextResponse.json({ results, summary });
}
