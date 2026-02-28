/**
 * src/lib/doc-chase/generate.ts
 *
 * Generates a 4-touch document-chase email sequence using Claude Haiku.
 * All AI calls for document chasing are centralised here — never inline in routes.
 *
 * Touch tone progression:
 *   Touch 1 (day 0)  — Warm and clear. Explain exactly what's needed and why.
 *   Touch 2 (day 5)  — Friendly follow-up. Gently remind; reference no reply yet.
 *   Touch 3 (day 10) — More direct. Note delay is holding up coverage.
 *   Touch 4 (day 20) — Final notice. Last reminder + consequence if not provided.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { TouchDraft } from "@/types/doc-chase";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an insurance agency assistant helping an agent chase a required document from their client. Draft a 4-touch professional email sequence. Tone progression:
- Touch 1: Warm and clear. Explain exactly what document is needed and why. Mention the specific document by name. Under 100 words.
- Touch 2: Friendly follow-up on day 5. Gently remind — note you haven't received a reply yet. Make it easy to respond. Under 90 words.
- Touch 3: More direct on day 10. Note the delay and that it is holding up their policy or coverage. Still professional, not aggressive. Under 90 words.
- Touch 4: Final notice on day 20. State clearly this is the last reminder. Explain the consequence (policy may not bind, coverage may lapse, quote may expire). Encourage immediate action. Under 100 words.

Return ONLY valid JSON — no markdown fences, no extra text:
{ "touches": [ { "subject": string, "body": string }, { "subject": string, "body": string }, { "subject": string, "body": string }, { "subject": string, "body": string } ] }

Each body must be plain text (no HTML). Include a professional sign-off with the agent name and email.`;

// ── Fallback drafts (used when Claude is unavailable) ─────────────────────────

function buildFallbacks(
  clientName: string,
  documentType: string,
  agentName: string,
  agentEmail: string
): TouchDraft[] {
  const first = clientName.split(" ")[0];
  const sig = `\n\nBest regards,\n${agentName}\n${agentEmail}`;

  return [
    {
      subject: `Action required: ${documentType} needed`,
      body: `Hi ${first},\n\nI hope you're well. To move your policy forward, I need a copy of your ${documentType}. Could you please send it through at your earliest convenience? If you have any questions about what's needed, don't hesitate to reply to this email.${sig}`,
    },
    {
      subject: `Following up: ${documentType} still outstanding`,
      body: `Hi ${first},\n\nI wanted to follow up — I haven't received your ${documentType} yet. It only takes a moment to send through, and it will allow us to keep things moving without delay. Please reply to this email with the document attached.${sig}`,
    },
    {
      subject: `Reminder: ${documentType} required to proceed`,
      body: `Hi ${first},\n\nI'm reaching out again regarding the ${documentType} that's still outstanding. Unfortunately, without it we can't proceed with your policy. I'd appreciate you sending it through today so there's no disruption to your coverage.${sig}`,
    },
    {
      subject: `Final notice: ${documentType} — please act today`,
      body: `Hi ${first},\n\nThis is my final reminder about your ${documentType}. If I don't receive it shortly, your policy may not be able to bind and your coverage could lapse. Please send it through today — if there's an issue, call me directly so we can find a solution.${sig}`,
    },
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Calls Claude Haiku to draft all 4 document-chase emails in a single request.
 * Falls back to hardcoded templates if Claude fails or returns malformed JSON.
 */
export async function draftDocumentChaseSequence(
  clientName: string,
  documentType: string,
  agentName: string,
  agentEmail: string,
  notes?: string | null
): Promise<TouchDraft[]> {
  const fallbacks = buildFallbacks(clientName, documentType, agentName, agentEmail);

  try {
    const anthropic = getAnthropicClient();

    const userMessage = [
      `Client name: ${clientName}`,
      `Document needed: ${documentType}`,
      `Agent name: ${agentName}`,
      `Agent email: ${agentEmail}`,
      notes ? `Additional context: ${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "{}";

    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as { touches: TouchDraft[] };
    const touches: TouchDraft[] = Array.isArray(parsed.touches)
      ? parsed.touches
      : [];

    // Ensure exactly 4 touches — top-up with fallbacks if Claude returned fewer
    while (touches.length < 4) {
      touches.push(fallbacks[touches.length]);
    }

    return touches.slice(0, 4);
  } catch (err) {
    console.error("[doc-chase/generate] Claude draft failed, using fallbacks:", err);
    return fallbacks;
  }
}
