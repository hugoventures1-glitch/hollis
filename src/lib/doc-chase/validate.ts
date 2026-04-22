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
