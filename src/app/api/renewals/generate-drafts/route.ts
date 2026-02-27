import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a professional insurance agent writing a personalized renewal outreach email to a client. Write in first person as the agent — not as an AI assistant. Be warm, clear, and professional. Never pushy or salesy. Keep the email body under 150 words. Use the client's actual name, carrier, policy type, premium, and expiration date naturally — do not use placeholder text like [NAME] or [DATE]. Return ONLY valid JSON in this exact format: {"subject": "...", "body": "..."}. The body is plain text (no HTML) with a greeting, the message, and a sign-off. No extra keys.`;

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) / 86_400_000
  );
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const in90 = addDays(90);

  // Fetch active policies within 90 days that haven't had drafts generated yet
  const { data: policies, error: fetchErr } = await supabase
    .from("policies")
    .select("id, policy_name, client_name, carrier, expiration_date, premium, campaign_stage")
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("drafts_generated", false)
    .gte("expiration_date", today)
    .lte("expiration_date", in90)
    .order("expiration_date");

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const qualifying = policies ?? [];
  if (qualifying.length === 0) {
    return NextResponse.json({ generated: 0, skipped: 0 });
  }

  const anthropic = getAnthropicClient();
  let generated = 0;
  let skipped = 0;

  for (const policy of qualifying) {
    const days = daysUntil(policy.expiration_date);
    const premiumLine = policy.premium
      ? `$${Number(policy.premium).toLocaleString()} annual premium`
      : "premium not on file";
    const stageNote =
      policy.campaign_stage === "email_90_sent"
        ? "A 90-day notice was already sent."
        : policy.campaign_stage === "email_60_sent"
        ? "A 60-day notice was already sent."
        : policy.campaign_stage === "sms_30_sent"
        ? "An SMS reminder was already sent."
        : "This is the first outreach for this renewal.";

    const userMessage =
      `Write a renewal outreach email for:\n` +
      `- Client: ${policy.client_name}\n` +
      `- Carrier: ${policy.carrier ?? "the current carrier"}\n` +
      `- Policy: ${policy.policy_name ?? "insurance policy"}\n` +
      `- Expiration: ${policy.expiration_date} (${days} days from today)\n` +
      `- Premium: ${premiumLine}\n` +
      `- Context: ${stageNote}`;

    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      const { subject, body } = JSON.parse(json) as { subject: string; body: string };

      if (!subject || !body) throw new Error("Incomplete draft from AI");

      // Store the draft
      const { error: insertErr } = await supabase.from("outbox_drafts").insert({
        user_id: user.id,
        renewal_id: policy.id,
        subject,
        body,
        status: "pending",
      });

      if (insertErr) throw new Error(insertErr.message);

      // Mark the policy so we don't draft it again this cycle
      await supabase
        .from("policies")
        .update({ drafts_generated: true })
        .eq("id", policy.id);

      generated++;
    } catch (err) {
      console.error(`[generate-drafts] Failed for ${policy.client_name}:`, err);
      skipped++;
    }
  }

  return NextResponse.json({ generated, skipped });
}
