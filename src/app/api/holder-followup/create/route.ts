/**
 * POST /api/holder-followup/create
 *
 * Creates a 3-touch follow-up sequence for a certificate holder.
 * Uses Claude Haiku to draft all three emails in a single call,
 * then stores the sequence + messages (status = scheduled).
 *
 * Body: { certificate_id, holder_name, holder_email, expiry_date }
 * Returns: { sequence_id, touches_scheduled: 3 }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient } from "@/lib/anthropic/client";
import type { Certificate } from "@/types/coi";

// ── Claude prompt ─────────────────────────────────────────────

const SEQUENCE_SYSTEM_PROMPT = `You are an insurance agency assistant. Draft a 3-touch follow-up email sequence to a certificate holder (a business that received a Certificate of Insurance from our client). The COI has expired or is about to expire. Tone: professional, brief, non-threatening. Each email should be under 100 words. Return JSON: { "touches": [ { "subject": string, "body": string }, { "subject": string, "body": string }, { "subject": string, "body": string } ] } for touches at days 0, 7, and 14 after sequence start. No extra text — JSON only.`;

interface TouchDraft {
  subject: string;
  body: string;
}

async function draftSequence(
  holderName: string,
  insuredName: string,
  expiryDate: string
): Promise<TouchDraft[]> {
  const anthropic = getAnthropicClient();

  const userMessage = [
    `Certificate holder: ${holderName}`,
    `Insured (our client): ${insuredName}`,
    `COI expiry date: ${expiryDate}`,
  ].join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SEQUENCE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw =
    response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as { touches: TouchDraft[] };
  const touches = parsed.touches ?? [];

  // Ensure exactly 3 touches
  while (touches.length < 3) {
    const n = touches.length + 1;
    touches.push({
      subject: `Follow-up ${n} — Certificate of Insurance for ${insuredName}`,
      body: `Hi ${holderName},\n\nThis is a follow-up regarding the Certificate of Insurance for ${insuredName}, which expired on ${expiryDate}. Please confirm receipt of the renewed certificate at your earliest convenience.\n\nThank you.`,
    });
  }

  return touches.slice(0, 3);
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { certificate_id, holder_name, holder_email, expiry_date } = body as {
    certificate_id: string;
    holder_name: string;
    holder_email: string;
    expiry_date: string;
  };

  if (!certificate_id || !holder_name || !holder_email) {
    return NextResponse.json(
      { error: "certificate_id, holder_name, and holder_email are required" },
      { status: 400 }
    );
  }

  // Verify certificate belongs to this user and fetch insured name
  const { data: certData, error: certErr } = await supabase
    .from("certificates")
    .select("id, insured_name, expiration_date")
    .eq("id", certificate_id)
    .eq("user_id", user.id)
    .single();

  if (certErr || !certData) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  const cert = certData as Pick<Certificate, "id" | "insured_name" | "expiration_date">;
  const insuredName = cert.insured_name;
  const resolvedExpiry =
    expiry_date ||
    cert.expiration_date ||
    new Date().toISOString().slice(0, 10);

  // Check for an existing active sequence on this certificate
  const { data: existing } = await supabase
    .from("holder_followup_sequences")
    .select("id, sequence_status")
    .eq("certificate_id", certificate_id)
    .eq("user_id", user.id)
    .eq("sequence_status", "active")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An active sequence already exists for this certificate" },
      { status: 409 }
    );
  }

  // Draft all three emails with Claude
  let touches: TouchDraft[];
  try {
    touches = await draftSequence(holder_name, insuredName, resolvedExpiry);
  } catch (err) {
    console.error("[holder-followup/create] Claude draft failed:", err);
    return NextResponse.json(
      { error: "Failed to draft email sequence" },
      { status: 500 }
    );
  }

  // Insert sequence record
  const { data: seq, error: seqErr } = await supabase
    .from("holder_followup_sequences")
    .insert({
      user_id: user.id,
      certificate_id,
      holder_name,
      holder_email,
      sequence_status: "active",
    })
    .select()
    .single();

  if (seqErr || !seq) {
    return NextResponse.json({ error: seqErr?.message ?? "Failed to create sequence" }, { status: 500 });
  }

  // Schedule all three touches
  const now = new Date();
  const DELAYS_DAYS = [0, 7, 14];

  const messageInserts = touches.map((touch, i) => {
    const scheduledFor = new Date(now.getTime() + DELAYS_DAYS[i] * 86_400_000);
    return {
      sequence_id: seq.id,
      touch_number: i + 1,
      scheduled_for: scheduledFor.toISOString(),
      status: "scheduled",
      subject: touch.subject,
      body: touch.body,
    };
  });

  const { error: msgErr } = await supabase
    .from("holder_followup_messages")
    .insert(messageInserts);

  if (msgErr) {
    // Clean up the sequence if messages failed
    await supabase
      .from("holder_followup_sequences")
      .delete()
      .eq("id", seq.id);
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json({ sequence_id: seq.id, touches_scheduled: 3 });
}
