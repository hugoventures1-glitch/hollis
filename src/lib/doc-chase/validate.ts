/**
 * src/lib/doc-chase/validate.ts
 *
 * Claude-powered document validator for the doc chase system.
 *
 * Given a base64-encoded file and the name of the document that was requested,
 * returns a structured verdict: pass / partial / fail / unreadable.
 *
 * - PDFs  → Claude PDF beta (native document block, betas: ["pdfs-2024-09-25"])
 * - Images → standard Claude messages.create (image content block, no beta needed)
 *
 * Never throws — on any error returns verdict: "unreadable" so callers can
 * always rely on a result object.
 */

import { getAnthropicClient } from "@/lib/anthropic/client";
import type { DocChaseValidationResult } from "@/types/doc-chase";

const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are an insurance document checker. A broker has requested a specific document from their client and the client has submitted a file. Your job is to determine whether the submitted document satisfies the request.

Return ONLY valid JSON — no markdown fences, no extra text:
{
  "verdict": "pass" | "fail" | "partial" | "unreadable",
  "summary": "one or two sentence plain-English summary of what the document is and whether it satisfies the request",
  "issues": ["specific issue 1", "specific issue 2"],
  "confidence": "high" | "medium" | "low"
}

Verdict definitions:
- pass: the document clearly matches what was requested and appears complete
- partial: the document is related but is missing key information, covers only part of the request, or appears outdated
- fail: the document does not match what was requested at all
- unreadable: the document is too blurry, corrupted, password-protected, or otherwise cannot be assessed

Only populate issues[] when verdict is fail, partial, or unreadable. For a clean pass, issues should be an empty array.
Set confidence based on how legible and clear the document is — "high" means you can clearly read all relevant fields.`;

// Supported MIME types
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const DRAFT_REPLY_SYSTEM = `You are a professional insurance broker assistant. A client submitted a document that did not fully satisfy the broker's request. Write a brief, professional follow-up email on behalf of the broker asking the client to resubmit with the specific issues resolved.

Return ONLY valid JSON — no markdown fences, no extra text:
{
  "subject": "Re: [Document request subject line]",
  "body": "Full email body text — polite, concise, under 150 words. Do not use HTML. Do not include a greeting name placeholder — the client's name will be inserted separately. Start with 'Hi [client name],' on the first line. Sign off as Hollis on behalf of the broker."
}`;

export async function generateDocChaseDraftReply(params: {
  clientName: string;
  documentType: string;
  validationSummary: string;
  validationIssues: string[];
  notes?: string | null;
}): Promise<{ subject: string; body: string }> {
  const fallback = {
    subject: `Re: ${params.documentType} — Action Required`,
    body: `Hi ${params.clientName},\n\nThank you for sending through the ${params.documentType}. Unfortunately, we weren't able to accept the document as submitted — ${params.validationSummary}\n\nCould you please resubmit with the issues resolved?\n\nThanks,\nHollis`,
  };

  try {
    const client = getAnthropicClient();

    const userText = [
      `Client name: ${params.clientName}`,
      `Requested document: ${params.documentType}`,
      params.notes ? `Broker's original request notes: ${params.notes}` : null,
      `Validation result: ${params.validationSummary}`,
      params.validationIssues.length > 0
        ? `Specific issues:\n${params.validationIssues.map((i) => `- ${i}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: DRAFT_REPLY_SYSTEM,
      messages: [{ role: "user", content: userText }],
    });

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { subject: string; body: string };
    return {
      subject: parsed.subject ?? fallback.subject,
      body: parsed.body ?? fallback.body,
    };
  } catch (err) {
    console.error("[doc-chase/validate] Draft reply generation failed:", err);
    return fallback;
  }
}

const QUERY_REPLY_SYSTEM = `You are a professional insurance broker assistant. A client has replied to a document request with a question instead of sending the document. Write a brief, helpful reply on behalf of the broker.

Return ONLY valid JSON — no markdown fences, no extra text:
{
  "subject": "Re: [document request subject line]",
  "body": "Full email body — polite, helpful, under 120 words. Do not use HTML. Start with 'Hi [first name],' on the first line. If you can answer the question from context, do so. If not, say you'll look into it and follow up shortly. Sign off as Hollis on behalf of the broker."
}`;

export async function generateDocChaseQueryResponse(params: {
  clientName: string;
  documentType: string;
  rawSignal: string;
  notes?: string | null;
}): Promise<{ subject: string; body: string }> {
  const fallback = {
    subject: `Re: ${params.documentType}`,
    body: `Hi ${params.clientName.split(" ")[0]},\n\nThank you for your message. I'll look into this and get back to you shortly.\n\nThanks,\nHollis`,
  };

  try {
    const client = getAnthropicClient();

    const userText = [
      `Client name: ${params.clientName}`,
      `Requested document: ${params.documentType}`,
      params.notes ? `Broker's original request notes: ${params.notes}` : null,
      `Client's message: ${params.rawSignal}`,
    ]
      .filter(Boolean)
      .join("\n");

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: QUERY_REPLY_SYSTEM,
      messages: [{ role: "user", content: userText }],
    });

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { subject: string; body: string };
    return {
      subject: parsed.subject ?? fallback.subject,
      body: parsed.body ?? fallback.body,
    };
  } catch (err) {
    console.error("[doc-chase/validate] Query response generation failed:", err);
    return fallback;
  }
}

export async function validateDocumentForChase(
  base64: string,
  mimeType: string,
  documentType: string,
  notes?: string | null
): Promise<DocChaseValidationResult> {
  const fallback: DocChaseValidationResult = {
    verdict: "unreadable",
    summary: "Could not process the document — please try again or upload a clearer copy.",
    issues: ["Document could not be read by the validation engine"],
    confidence: "low",
  };

  try {
    const client = getAnthropicClient();

    const userText = [
      `Requested document: ${documentType}`,
      notes ? `Additional context from the broker: ${notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    let rawText: string;

    if (mimeType === "application/pdf") {
      // PDF path — use Claude PDF beta
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = await (client.beta.messages.create as unknown as (p: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>)({
        model: MODEL,
        max_tokens: 1024,
        betas: ["pdfs-2024-09-25"],
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      });
      rawText = message.content[0]?.type === "text" ? (message.content[0].text ?? "") : "";
    } else if (SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      // Image path — standard messages.create (no beta needed)
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: base64,
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      });
      rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    } else {
      return {
        verdict: "unreadable",
        summary: `Unsupported file type: ${mimeType}. Please upload a PDF or image.`,
        issues: [`File type ${mimeType} is not supported`],
        confidence: "high",
      };
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as DocChaseValidationResult;

    // Normalise
    return {
      verdict: parsed.verdict ?? "unreadable",
      summary: parsed.summary ?? "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      confidence: parsed.confidence ?? "low",
    };
  } catch (err) {
    console.error("[doc-chase/validate] Claude validation failed:", err);
    return fallback;
  }
}
