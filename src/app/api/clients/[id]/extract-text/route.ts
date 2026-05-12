/**
 * POST /api/clients/[id]/extract-text
 *
 * Accepts a PDF or image file, sends it to Claude, and returns extracted plain text.
 * The extracted text is appended to the client's knowledge base by the frontend.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";

type RouteParams = { params: Promise<{ id: string }> };

const EXTRACT_PROMPT =
  "Extract all text content from this document. Return only the extracted text, preserving meaningful structure (headings, lists, paragraphs). No commentary, no formatting tags — just the text.";

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the client belongs to this user
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const mimeType = file.type;
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const anthropic = getAnthropicClient();

  let extractedText: string;

  if (mimeType === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await (anthropic.beta.messages.create as unknown as (p: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>)({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      betas: ["pdfs-2024-09-25"],
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      }],
    });
    extractedText = message.content[0]?.type === "text" ? (message.content[0].text ?? "") : "";
  } else if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)) {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
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
          { type: "text", text: EXTRACT_PROMPT },
        ],
      }],
    });
    extractedText = message.content[0]?.type === "text" ? (message.content[0].text ?? "") : "";
  } else {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF or image (JPEG, PNG, GIF, WebP)." },
      { status: 400 }
    );
  }

  return NextResponse.json({ text: extractedText.trim() });
}
