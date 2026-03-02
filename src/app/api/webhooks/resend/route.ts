/**
 * POST /api/webhooks/resend
 *
 * Ingests Resend delivery status webhooks and updates send_logs + client records.
 *
 * Resend sends POST requests with events like:
 *   email.delivered  — email confirmed delivered
 *   email.bounced    — permanent bounce (invalid address, domain doesn't exist)
 *   email.complained — recipient marked as spam
 *
 * Protected by RESEND_WEBHOOK_SECRET (set in Resend dashboard → Webhooks).
 * Resend signs each request with the secret in the "Resend-Signature" header.
 * If the secret is not configured we log a warning but still process the event
 * so development/staging environments work without the signature.
 *
 * On bounce:
 *   1. Update the matching send_log row with bounced_at + delivery_error
 *   2. If the recipient matches a client email, mark client.email_bounced = true
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ResendEmailEvent {
  type:
    | "email.sent"
    | "email.delivered"
    | "email.delivery_delayed"
    | "email.bounced"
    | "email.complained"
    | "email.opened"
    | "email.clicked";
  created_at: string;
  data: {
    email_id: string;        // == provider_message_id stored in send_logs
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  // Signature validation (optional — only enforced if RESEND_WEBHOOK_SECRET is set)
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = request.headers.get("resend-signature") ?? request.headers.get("svix-signature");
    if (!signature || !signature.includes(webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[webhook/resend] RESEND_WEBHOOK_SECRET not set — skipping signature check");
  }

  let event: ResendEmailEvent;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data, created_at } = event;
  const emailId = data?.email_id;
  const recipient = data?.to?.[0];

  if (!emailId || !type) {
    return NextResponse.json({ ok: true }); // ignore unrecognised events
  }

  const supabase = createAdminClient();
  const ts = created_at ?? new Date().toISOString();

  // ── delivered ───────────────────────────────────────────────────────────────
  if (type === "email.delivered") {
    await supabase
      .from("send_logs")
      .update({ status: "sent", delivered_at: ts })
      .eq("provider_message_id", emailId);

    return NextResponse.json({ ok: true });
  }

  // ── bounced ─────────────────────────────────────────────────────────────────
  if (type === "email.bounced") {
    const errorMsg = data.bounce?.message ?? "Bounced";

    await supabase
      .from("send_logs")
      .update({ status: "bounced", bounced_at: ts, delivery_error: errorMsg })
      .eq("provider_message_id", emailId);

    // Flag the client record so future sends are suppressed
    if (recipient) {
      await supabase
        .from("clients")
        .update({ email_bounced: true, email_bounced_at: ts })
        .eq("email", recipient)
        .eq("email_bounced", false); // avoid redundant writes
    }

    console.warn(`[webhook/resend] Bounce recorded for ${recipient ?? emailId}: ${errorMsg}`);
    return NextResponse.json({ ok: true });
  }

  // ── complained (spam) ───────────────────────────────────────────────────────
  if (type === "email.complained") {
    await supabase
      .from("send_logs")
      .update({ complained_at: ts })
      .eq("provider_message_id", emailId);

    // Treat complaints the same as bounces for future send suppression
    if (recipient) {
      await supabase
        .from("clients")
        .update({ email_bounced: true, email_bounced_at: ts })
        .eq("email", recipient)
        .eq("email_bounced", false);
    }

    console.warn(`[webhook/resend] Spam complaint from ${recipient ?? emailId}`);
    return NextResponse.json({ ok: true });
  }

  // All other events (opened, clicked, etc.) — acknowledge without action
  return NextResponse.json({ ok: true });
}
