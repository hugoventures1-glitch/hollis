import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic/client";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a search assistant for an insurance agency management system. Convert the user's natural language query into a structured JSON search plan. You have access to these tables: policies (client_name, carrier, line_of_business, expiration_date, premium, campaign_stage, status), certificates (insured_name, certificate_holder, expiration_date, status), clients (name, email, phone). Return ONLY valid JSON in this format: { "tables": ["policies"], "filters": { "status": "active", "days_until_expiry_lte": 60 }, "summary": "Active policies expiring within 60 days" }`;

type TableName = "policies" | "certificates" | "clients";

interface SearchPlan {
  tables: TableName[];
  filters: Record<string, unknown>;
  summary: string;
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

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

  // ── Step 1: Ask Claude to parse the query into a search plan ──────────────
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
    // Strip markdown code fences if present
    const json = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    plan = JSON.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Failed to interpret query" },
      { status: 500 }
    );
  }

  const { tables = [], filters = {}, summary = "" } = plan;

  // ── Step 2: Execute each table query with the admin client (bypasses RLS) ──
  // We still scope every query to user.id so users only see their own data.
  const admin = createAdminClient();
  const results: Record<string, unknown>[] = [];

  for (const table of tables) {
    if (table === "policies") {
      let q = admin
        .from("policies")
        .select(
          "id, policy_name, client_name, carrier, expiration_date, premium, campaign_stage, status"
        )
        .eq("user_id", user.id);

      if (filters.status)          q = q.eq("status", String(filters.status));
      if (filters.campaign_stage)  q = q.eq("campaign_stage", String(filters.campaign_stage));
      if (filters.carrier)         q = q.ilike("carrier", `%${filters.carrier}%`);
      if (filters.client_name)     q = q.ilike("client_name", `%${filters.client_name}%`);
      if (filters.line_of_business)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (q as any).ilike("line_of_business", `%${filters.line_of_business}%`);
      if (filters.days_until_expiry_lte != null)
        q = q.lte("expiration_date", addDays(Number(filters.days_until_expiry_lte)));
      if (filters.days_until_expiry_gte != null)
        q = q.gte("expiration_date", addDays(Number(filters.days_until_expiry_gte)));
      if (filters.premium_gte != null) q = q.gte("premium", Number(filters.premium_gte));
      if (filters.premium_lte != null) q = q.lte("premium", Number(filters.premium_lte));
      if (filters.text_search)
        q = q.or(
          `client_name.ilike.%${filters.text_search}%,carrier.ilike.%${filters.text_search}%,policy_name.ilike.%${filters.text_search}%`
        );

      const { data } = await q.order("expiration_date").limit(25);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "policy" })));
    }

    if (table === "certificates") {
      let q = admin
        .from("certificates")
        .select("id, certificate_number, insured_name, holder_name, expiration_date, status")
        .eq("user_id", user.id);

      if (filters.status)       q = q.eq("status", String(filters.status));
      if (filters.insured_name) q = q.ilike("insured_name", `%${filters.insured_name}%`);
      const holderVal = filters.certificate_holder ?? filters.holder_name;
      if (holderVal)            q = q.ilike("holder_name", `%${holderVal}%`);
      if (filters.days_until_expiry_lte != null)
        q = q.lte("expiration_date", addDays(Number(filters.days_until_expiry_lte)));
      if (filters.text_search)
        q = q.or(
          `insured_name.ilike.%${filters.text_search}%,holder_name.ilike.%${filters.text_search}%`
        );

      const { data } = await q.order("expiration_date").limit(25);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "certificate" })));
    }

    if (table === "clients") {
      let q = admin
        .from("clients")
        .select("id, name, email, phone")
        .eq("user_id", user.id);

      if (filters.name)        q = q.ilike("name", `%${filters.name}%`);
      if (filters.text_search)
        q = q.or(`name.ilike.%${filters.text_search}%,email.ilike.%${filters.text_search}%`);

      const { data } = await q.order("name").limit(25);
      if (data) results.push(...data.map((r) => ({ ...r, _type: "client" })));
    }
  }

  return NextResponse.json({ results, summary });
}
