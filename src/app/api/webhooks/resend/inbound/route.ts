/**
 * POST /api/webhooks/resend/inbound
 *
 * Receives Resend inbound email webhooks, matches the sender to a policy
 * via client_email lookup, and feeds the body into the existing signal
 * classification pipeline.
 *
 * This endpoint makes the agent's inbound half functional in production —
 * client replies, confirmations, OOO auto-replies, and queries are all
 * automatically classified and routed without broker intervention.
 *
 * Protected by RESEND_INBOUND_WEBHOOK_SECRET (set in Resend dashboard → Inbound).
 * IMPORTANT: Always returns 200 — returning 4xx causes Resend to retry indefinitely.
 *
 * Policy lookup: matches sender's from address against policies.client_email,
 * filtering out confirmed/lapsed policies, ordered by soonest-expiring first.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundSignal } from "@/lib/agent/process-signal";
import type { ParserOutcome } from "@/types/agent";

// ── Resend inbound email payload ───────────────────────────────────────────────
// Shape based on Resend's email.received webhook event.
// Verify against Resend dashboard once inbound is configured.
interface ResendInboundPayload {
  type: string; // "email.received"
  created_at: string;
  data: {
    email_id?: string;
    from: string; // RFC 2822: "Display Name <email@domain>" or "email@domain"
    to: string[];
    subject: string;
    text: string | null;
    html?: string | null;
    headers?: Record<string, string>;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse an RFC 2822 from header into a normalised email + optional display name.
 * Examples:
 *   "John Smith <john@acme.com>"  → { email: "john@acme.com", name: "John Smith" }
 *   '"Smith, John" <j@acme.com>'  → { email: "j@acme.com", name: "Smith, John" }
 *   "john@acme.com"               → { email: "john@acme.com", name: null }
 */
function parseFromHeader(from: string): { email: string; name: string | null } {
  const angleMatch = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^"|"$/g, ""); // strip surrounding quotes
    return {
      email: angleMatch[2].trim().toLowerCase(),
      name: rawName.length > 0 ? rawName : null,
    };
  }
  return { email: from.trim().toLowerCase(), name: null };
}

// Patterns that mark the start of quoted reply text — everything after the first
// match is stripped to reduce noise fed to Claude.
const QUOTE_MARKERS: RegExp[] = [
  /\n\nOn [^\n]+\n?[^\n]*wrote:/i, // Gmail / Apple Mail: "On Jan 1, John wrote:" (may span 2 lines)
  /\n\n-{3,}/, // --- separator
  /\n_{3,}/, // ___ separator
  /^>+\s/m, // > quoted lines
  /\n\nFrom:\s/i, // Outlook-style "From: ..."
  /\n\nSent:\s/i, // Outlook-style "Sent: ..."
];

/**
 * Strip quoted reply text from an email body.
 * Falls back to the original text if stripping would return an empty string.
 */
function stripQuotedReply(text: string): string {
  // Normalise Windows line endings first
  const normalised = text.replace(/\r\n/g, "\n");
  let stripped = normalised;

  for (const marker of QUOTE_MARKERS) {
    const match = stripped.search(marker);
    if (match !== -1) {
      stripped = stripped.slice(0, match).trimEnd();
    }
  }

  return stripped.length > 0 ? stripped : normalised;
}

/**
 * Minimal HTML → plain text fallback.
 * Used only when the email has no text/plain part.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Webhook handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Must read raw body before JSON parsing — required for HMAC verification
  const rawBody = await request.text();

  // ── Signature verification ─────────────────────────────────────────────────
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

  if (webhookSecret) {
    const sig = request.headers.get("svix-signature") ?? "";
    const ts = request.headers.get("svix-timestamp") ?? "";

    if (!sig || !ts) {
      // Missing headers — could be misconfiguration, not a replay attack
      console.error("[webhook/resend/inbound] Missing svix-signature/svix-timestamp headers");
      return NextResponse.json({ ok: true }); // always 200 — do not trigger Resend retries
    }

    // Svix secrets are base64-encoded and prefixed with "whsec_"
    const secretBytes = Buffer.from(webhookSecret.replace(/^whsec_/, ""), "base64");
    const toSign = `${ts}.${rawBody}`;
    const expectedBytes = crypto.createHmac("sha256", secretBytes).update(toSign).digest();

    // Svix signatures are base64-encoded after the "v1," prefix
    const valid = sig.split(" ").some((s) => {
      if (!s.startsWith("v1,")) return false;
      try {
        const sigBytes = Buffer.from(s.slice(3), "base64");
        return sigBytes.length === expectedBytes.length &&
          crypto.timingSafeEqual(sigBytes, expectedBytes);
      } catch {
        return false;
      }
    });

    if (!valid) {
      console.error("[webhook/resend/inbound] Invalid HMAC signature — ignoring payload");
      return NextResponse.json({ ok: true }); // always 200 — see note above
    }
  } else {
    console.warn("[webhook/resend/inbound] RESEND_INBOUND_WEBHOOK_SECRET not set — skipping signature check");
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload;
  } catch {
    console.error("[webhook/resend/inbound] Failed to parse JSON body");
    return NextResponse.json({ ok: true });
  }

  // Only handle inbound email events
  if (payload.type !== "email.received") {
    return NextResponse.json({ ok: true });
  }

  const { from, text, html } = payload.data ?? {};

  console.log("[webhook/resend/inbound] DEBUG payload.data keys:", Object.keys(payload.data ?? {}));
  console.log("[webhook/resend/inbound] DEBUG from:", from, "| has text:", !!text, "| has html:", !!html);

  if (!from) {
    console.warn("[webhook/resend/inbound] Missing from field in payload");
    return NextResponse.json({ ok: true });
  }

  // ── Extract signal text ────────────────────────────────────────────────────
  let rawSignal: string;
  if (text?.trim()) {
    rawSignal = stripQuotedReply(text);
  } else if (html?.trim()) {
    rawSignal = stripQuotedReply(htmlToPlainText(html));
  } else {
    console.warn("[webhook/resend/inbound] Email has no text or html body — skipping");
    return NextResponse.json({ ok: true });
  }

  if (!rawSignal.trim()) {
    console.warn("[webhook/resend/inbound] Signal is empty after stripping quoted reply — skipping");
    return NextResponse.json({ ok: true });
  }

  // Guard: cap signal length consistent with manual route validation
  rawSignal = rawSignal.slice(0, 10_000);

  // ── Parse sender ───────────────────────────────────────────────────────────
  const { email: senderEmail, name: senderName } = parseFromHeader(from);
  console.log("[webhook/resend/inbound] DEBUG senderEmail:", senderEmail);

  // ── Policy lookup ──────────────────────────────────────────────────────────
  const admin = createAdminClient();

  const { data: candidates, error: lookupError } = await admin
    .from("policies")
    .select(
      "id, user_id, client_name, policy_name, expiration_date, campaign_stage, last_contact_at, renewal_flags, renewal_paused, client_email, carrier, premium, agent_name, agent_email"
    )
    .eq("client_email", senderEmail)
    .not("campaign_stage", "in", '("confirmed","lapsed")')
    .order("expiration_date", { ascending: false });

  if (lookupError) {
    console.error("[webhook/resend/inbound] Policy lookup error:", lookupError.message);
    return NextResponse.json({ ok: true });
  }

  if (!candidates || candidates.length === 0) {
    console.info(`[webhook/resend/inbound] No active policy found for sender: ${senderEmail}`);
    return NextResponse.json({ ok: true });
  }

  // Warn when the same email address appears under multiple broker accounts
  const distinctBrokers = new Set(candidates.map((c) => c.user_id));
  if (distinctBrokers.size > 1) {
    console.warn(
      `[webhook/resend/inbound] Sender ${senderEmail} matched ${candidates.length} policies across ${distinctBrokers.size} brokers — using most-recently-expiring`
    );
  }

  const policy = candidates[0];

  // ── Fetch few-shot outcomes for this broker ────────────────────────────────
  const { data: recentOutcomes } = await admin
    .from("parser_outcomes")
    .select("*")
    .eq("user_id", policy.user_id)
    .in("broker_action", ["approved", "edited"])
    .order("created_at", { ascending: false })
    .limit(10);

  // ── Run signal pipeline ────────────────────────────────────────────────────
  try {
    await processInboundSignal({
      admin,
      userId: policy.user_id as string,
      policyId: policy.id as string,
      policy,
      rawSignal,
      senderEmail,
      senderName,
      source: "email",
      recentOutcomes: (recentOutcomes as ParserOutcome[]) ?? [],
    });
  } catch (pipelineErr) {
    // Log but do not surface to Resend — a 500 would trigger retries
    console.error(
      "[webhook/resend/inbound] Pipeline error:",
      pipelineErr instanceof Error ? pipelineErr.message : pipelineErr
    );
  }

  return NextResponse.json({ ok: true });
}
