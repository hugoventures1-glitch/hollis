import { getAnthropicClient } from "@/lib/anthropic/client";
import type { Policy } from "@/types/renewals";

const MODEL = "claude-haiku-4-5-20251001";

function premiumLine(policy: Policy) {
  return policy.premium
    ? `Current Premium: $${Number(policy.premium).toLocaleString()}`
    : "";
}

// ── 90-day / 60-day email ────────────────────────────────────

export async function generateRenewalEmail(
  policy: Policy,
  type: "email_90" | "email_60"
): Promise<{ subject: string; body: string }> {
  const client = getAnthropicClient();
  const days = type === "email_90" ? "90" : "60";
  const tone =
    type === "email_90"
      ? "warm and proactive — starting the conversation early so the client doesn't feel rushed"
      : "a friendly follow-up, gently noting you haven't heard back and stressing the narrowing window";

  const prompt = `You are writing on behalf of an insurance agent. Generate a professional renewal reminder email.

Policy details:
- Client: ${policy.client_name}
- Policy: ${policy.policy_name}
- Carrier: ${policy.carrier}
- Expiry: ${policy.expiration_date} (${days} days away)
${premiumLine(policy)}
- Agent name: ${policy.agent_name ?? ""}
- Agent email: ${policy.agent_email ?? ""}

Tone: ${tone}

Rules:
- Address the client by first name
- Reference the specific policy and carrier naturally
- 2–3 short paragraphs, conversational but professional
- Clear single call-to-action (reply to this email or call the agent)
- No generic filler — make it feel personal
- End the email with a real signature using the Agent name and Agent email above. Two line breaks, then the agent's name, then the agent's email on the next line. No placeholders like [Your Name] or [Contact Information].

Respond with ONLY valid JSON: {"subject": "...", "body": "..."}
The body should be plain text (no HTML), with line breaks between paragraphs.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");

  // Strip markdown code fences if present
  const jsonText = raw.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(jsonText);
  return { subject: String(parsed.subject), body: String(parsed.body) };
}

// ── 30-day SMS ───────────────────────────────────────────────

export async function generateSMSMessage(policy: Policy): Promise<string> {
  const client = getAnthropicClient();

  const prompt = `Write a brief SMS renewal reminder from an insurance agent to their client. Keep it under 160 characters, friendly and urgent.

Client: ${policy.client_name}
Policy: ${policy.policy_name}
Expiry: ${policy.expiration_date} (30 days away)

Respond with ONLY the SMS text. No quotes, no explanation.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");
  return raw.text.trim().slice(0, 160);
}

// ── 14-day call script ───────────────────────────────────────

export async function generateCallScript(policy: Policy): Promise<string> {
  const client = getAnthropicClient();

  const prompt = `Generate a concise call script for an insurance agent calling a client about an urgent policy renewal.

Policy details:
- Client: ${policy.client_name}
- Policy: ${policy.policy_name}
- Carrier: ${policy.carrier}
- Expiry: ${policy.expiration_date} (14 days away — URGENT)
${premiumLine(policy)}

Structure the script with these sections:
OPENING — personalized greeting, state purpose
KEY POINTS — 2–3 bullets on urgency and what happens if it lapses
OBJECTION HANDLERS — price concern, "need to think about it", "already looking elsewhere"
CLOSE — specific next step (schedule a call, confirm renewal details)

Plain text. Conversational. Agent should sound confident, not pushy.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0];
  if (raw.type !== "text") throw new Error("Unexpected Claude response type");
  return raw.text.trim();
}

// ── Default templates (pre-approval placeholders) ────────────

export async function generateDefaultTemplates(policy: {
  client_name: string;
  policy_name: string;
  carrier: string;
}): Promise<Record<string, { subject?: string; body: string }>> {
  return {
    email_90: {
      subject: `Your ${policy.policy_name} renews in 90 days — let's get ahead of it`,
      body: `Hi {{client_first_name}},\n\nJust a heads-up that your {{policy_name}} with {{carrier}} is coming up for renewal in 90 days. Now is a great time to review your coverage and make sure everything still fits your needs.\n\nI'd love to connect and walk you through your options. Reply to this email or give me a call — whichever works best for you.\n\nTalk soon,\n{{agent_name}}`,
    },
    email_60: {
      subject: `Following up — ${policy.policy_name} renews in 60 days`,
      body: `Hi {{client_first_name}},\n\nI wanted to follow up on my earlier note about your {{policy_name}} renewal. We're now 60 days out and I want to make sure we have plenty of time to get everything sorted.\n\nPlease reply or call me at your earliest convenience so we can review your options together.\n\nBest,\n{{agent_name}}`,
    },
    sms_30: {
      body: `Hi {{client_first_name}}, your {{policy_name}} expires in 30 days. Call us to renew. {{agency_name}}`,
    },
    script_14: {
      body: `OPENING\nHi, may I speak with {{client_name}}? ... Hi {{client_first_name}}, this is {{agent_name}} from {{agency_name}}. I'm calling about your {{policy_name}} that expires in 14 days.\n\nKEY POINTS\n- Without renewal, coverage lapses and you're unprotected\n- We can lock in your rate today\n- Takes about 10 minutes to confirm\n\nOBJECTION HANDLERS\n"Too expensive" → Let me see if we can find a better rate with a different carrier\n"Need to think" → Totally understand — can we schedule 15 minutes this week?\n"Looking elsewhere" → Happy to compete — what are they quoting you?\n\nCLOSE\nCan we confirm your details right now and get this wrapped up today?`,
    },
  };
}
