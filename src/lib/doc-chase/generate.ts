/**
 * src/lib/doc-chase/generate.ts
 *
 * Generates a 4-touch document-chase sequence using Claude Haiku.
 * Touch 1–2: email. Touch 3: SMS if client_phone provided, else email.
 * Touch 4: phone_script (UI-only, no send).
 *
 * All AI calls for document chasing are centralised here — never inline in routes.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { TouchDraft, TouchChannel } from "@/types/doc-chase";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT_EMAIL = `You are an insurance agency assistant helping an agent chase a required document from their client. Draft a 4-touch professional email sequence. Tone progression:
- Touch 1: Warm and clear. Explain exactly what document is needed and why. Mention the specific document by name. Under 100 words.
- Touch 2: Friendly follow-up on day 5. Gently remind — note you haven't received a reply yet. Make it easy to respond. Under 90 words.
- Touch 3: More direct on day 10. Note the delay and that it is holding up their policy or coverage. Still professional, not aggressive. Under 90 words.
- Touch 4: Final notice on day 20. State clearly this is the last reminder. Explain the consequence (policy may not bind, coverage may lapse, quote may expire). Encourage immediate action. Under 100 words.

Return ONLY valid JSON — no markdown fences, no extra text:
{ "touches": [ { "subject": string, "body": string }, { "subject": string, "body": string }, { "subject": string, "body": string }, { "subject": string, "body": string } ] }

Each body must be plain text (no HTML). Include a professional sign-off with the agent name and email.`;

const SYSTEM_PROMPT_SMS_T3 = `You are an insurance agency assistant. The agent is chasing a required document from their client. Draft a single SMS reminder for touch 3. Requirements:
- Maximum 160 characters total.
- Plain text only, no emojis.
- Professional but direct — mention the document is still needed and holding up their policy.
- If urgency context is provided, reflect that urgency in the tone.
- Include agent name or "us" so they know who to reply to.`;

const SYSTEM_PROMPT_PHONE_SCRIPT = `You are an insurance agency assistant. The agent will call their client for a final follow-up about an outstanding document. Draft a concise phone call script with 3–5 bullet talking points. Requirements:
- Each point is one short sentence.
- Cover: greeting, why you're calling, the document needed, consequence if not received, next step.
- If urgency or notes context is provided, incorporate it into the talking points.
- Professional and firm but not aggressive.
- Total under 150 words.

Return ONLY valid JSON — no markdown fences, no extra text:
{ "phone_script": "• Point 1\\n• Point 2\\n• Point 3\\n..." }`;

// ── Fallback drafts ─────────────────────────────────────────────────────────

function buildFallbacks(
  clientName: string,
  documentType: string,
  agentName: string,
  agentEmail: string,
  clientPhone: string | null
): TouchDraft[] {
  const first = clientName.split(" ")[0];
  const sig = `\n\nBest regards,\n${agentName}\n${agentEmail}`;

  const touch3SMS = clientPhone
    ? `Hi ${first}, still waiting on your ${documentType} – it's holding up your policy. Please send through today. ${agentName}`
    : null;

  const touch3Email = {
    subject: `Reminder: ${documentType} required to proceed`,
    body: `Hi ${first},\n\nI'm reaching out again regarding the ${documentType} that's still outstanding. Unfortunately, without it we can't proceed with your policy. I'd appreciate you sending it through today so there's no disruption to your coverage.${sig}`,
  };

  const touch4Script = `• Introduce yourself and confirm you're speaking with the right person
• Explain you're calling about the outstanding ${documentType} needed for their policy
• Note this is your final follow-up before there may be a lapse in coverage
• Ask if they can send it today or if there's an issue you can help resolve
• Thank them and confirm next steps`;

  return [
    {
      subject: `Action required: ${documentType} needed`,
      body: `Hi ${first},\n\nI hope you're well. To move your policy forward, I need a copy of your ${documentType}. Could you please send it through at your earliest convenience? If you have any questions about what's needed, don't hesitate to reply to this email.${sig}`,
      channel: "email",
    },
    {
      subject: `Following up: ${documentType} still outstanding`,
      body: `Hi ${first},\n\nI wanted to follow up — I haven't received your ${documentType} yet. It only takes a moment to send through, and it will allow us to keep things moving without delay. Please reply to this email with the document attached.${sig}`,
      channel: "email",
    },
    touch3SMS
      ? {
          subject: "",
          body: touch3SMS.slice(0, 160),
          channel: "sms" as TouchChannel,
        }
      : {
          subject: touch3Email.subject,
          body: touch3Email.body,
          channel: "email" as TouchChannel,
        },
    {
      subject: "",
      body: "",
      channel: "phone_script",
      phone_script: touch4Script,
    },
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Drafts the 4-touch document-chase sequence. Touch 3 is SMS when client_phone
 * exists; otherwise email. Touch 4 is always a phone script (UI-only).
 *
 * daysUntilExpiry: days until linked policy expires. Used to scale urgency
 * across all 4 touches and adjust tone accordingly.
 */
export async function draftDocumentChaseSequence(
  clientName: string,
  documentType: string,
  agentName: string,
  agentEmail: string,
  notes?: string | null,
  clientPhone?: string | null,
  daysUntilExpiry?: number | null
): Promise<TouchDraft[]> {
  const fallbacks = buildFallbacks(
    clientName,
    documentType,
    agentName,
    agentEmail,
    clientPhone?.trim() || null
  );

  const useSmsForTouch3 = !!(clientPhone?.trim());

  // Build urgency string that's appended to every Claude call
  const urgencyLine = daysUntilExpiry !== null && daysUntilExpiry !== undefined
    ? daysUntilExpiry <= 7
      ? `URGENCY: Policy expires in ${daysUntilExpiry} day(s) — treat as critical. All touches must convey genuine urgency without being rude.`
      : daysUntilExpiry <= 14
        ? `URGENCY: Policy expires in ${daysUntilExpiry} days — time-sensitive. Escalate tone progressively across touches.`
        : daysUntilExpiry <= 30
          ? `Context: Policy expires in ${daysUntilExpiry} days. Mention the timeline to create appropriate urgency.`
          : `Context: Policy expires in ${daysUntilExpiry} days. Tone can be professional and measured.`
    : null;

  try {
    const anthropic = getAnthropicClient();

    // 1. Draft touches 1, 2, and (optionally) 3 as emails
    const userMessage = [
      `Client name: ${clientName}`,
      `Document needed: ${documentType}`,
      `Agent name: ${agentName}`,
      `Agent email: ${agentEmail}`,
      notes ? `Additional context: ${notes}` : "",
      urgencyLine ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    const emailResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT_EMAIL,
      messages: [{ role: "user", content: userMessage }],
    });

    const emailRaw =
      emailResponse.content[0].type === "text"
        ? emailResponse.content[0].text
        : "{}";
    const emailCleaned = emailRaw
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const emailParsed = JSON.parse(emailCleaned) as {
      touches: Array<{ subject: string; body: string }>;
    };
    const emailTouches = Array.isArray(emailParsed.touches)
      ? emailParsed.touches
      : [];

    // 2. If touch 3 is SMS, draft it separately
    let touch3Body = "";
    if (useSmsForTouch3) {
      const smsContext = [
        `Client: ${clientName}. Document: ${documentType}. Agent: ${agentName}.`,
        notes ? `Context: ${notes}` : "",
        urgencyLine ?? "",
      ].filter(Boolean).join(" ");

      const smsResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT_SMS_T3,
        messages: [{ role: "user", content: smsContext }],
      });
      const smsRaw =
        smsResponse.content[0].type === "text"
          ? smsResponse.content[0].text
          : "";
      touch3Body = smsRaw.trim().slice(0, 160);
      if (!touch3Body) touch3Body = fallbacks[2].body;
    }

    // 3. Draft touch 4 phone script
    const scriptContext = [
      `Client: ${clientName}. Document: ${documentType}. Agent: ${agentName}.`,
      notes ? `Additional context: ${notes}` : "",
      urgencyLine ?? "",
    ].filter(Boolean).join(" ");

    const scriptResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT_PHONE_SCRIPT,
      messages: [{ role: "user", content: scriptContext }],
    });
    const scriptRaw =
      scriptResponse.content[0].type === "text"
        ? scriptResponse.content[0].text
        : "{}";
    const scriptCleaned = scriptRaw
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    let phoneScript = fallbacks[3].phone_script ?? "";
    try {
      const scriptParsed = JSON.parse(scriptCleaned) as {
        phone_script?: string;
      };
      if (scriptParsed.phone_script)
        phoneScript = scriptParsed.phone_script.trim();
    } catch {
      // use fallback
    }

    // Build final touches
    const touches: TouchDraft[] = [];

    // Touch 1
    touches.push({
      subject: emailTouches[0]?.subject ?? fallbacks[0].subject,
      body: emailTouches[0]?.body ?? fallbacks[0].body,
      channel: "email",
    });

    // Touch 2
    touches.push({
      subject: emailTouches[1]?.subject ?? fallbacks[1].subject,
      body: emailTouches[1]?.body ?? fallbacks[1].body,
      channel: "email",
    });

    // Touch 3
    if (useSmsForTouch3) {
      touches.push({
        subject: "",
        body: touch3Body,
        channel: "sms",
      });
    } else {
      touches.push({
        subject: emailTouches[2]?.subject ?? fallbacks[2].subject,
        body: emailTouches[2]?.body ?? fallbacks[2].body,
        channel: "email",
      });
    }

    // Touch 4
    touches.push({
      subject: "",
      body: "",
      channel: "phone_script",
      phone_script: phoneScript,
    });

    return touches.slice(0, 4);
  } catch (err) {
    console.error("[doc-chase/generate] Claude draft failed, using fallbacks:", err);
    return fallbacks;
  }
}
