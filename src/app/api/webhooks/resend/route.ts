/**
 * POST /api/webhooks/resend
 *
 * Ingests Resend delivery status webhooks (Svix-signed) and updates send_logs +
 * client records for delivered/bounced/complained/opened events.
 *
 * Protected by RESEND_WEBHOOK_SECRET. Always returns 200 — Resend retries
 * indefinitely on any 4xx response.
 */
import { NextRequest, NextResponse } from "next/server";
import { Webhook, WebhookVerificationError } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { logWebhookEvent } from "@/lib/webhooks/log-event";

const ENDPOINT = "resend_delivery";

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
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const svixId = request.headers.get("svix-id");
  const svixTs = request.headers.get("svix-timestamp");
  const svixSig = request.headers.get("svix-signature");

  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "received",
    detail: {
      body_length: rawBody.length,
      headers_present: {
        "svix-id": Boolean(svixId),
        "svix-timestamp": Boolean(svixTs),
        "svix-signature": Boolean(svixSig),
      },
    },
  });

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (webhookSecret) {
    try {
      new Webhook(webhookSecret).verify(rawBody, {
        "svix-id": svixId ?? "",
        "svix-timestamp": svixTs ?? "",
        "svix-signature": svixSig ?? "",
      });
    } catch (err) {
      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "sig_fail",
        http_status: 200,
        detail: {
          error:
            err instanceof WebhookVerificationError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err),
        },
      });
      return NextResponse.json({ ok: true });
    }
    await logWebhookEvent({ endpoint: ENDPOINT, gate: "sig_ok" });
  } else {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "sig_ok",
      detail: { note: "RESEND_WEBHOOK_SECRET not set — verification skipped" },
    });
  }

  let event: ResendEmailEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      detail: { error: "json_parse_failed" },
    });
    return NextResponse.json({ ok: true });
  }

  const { type, data, created_at } = event;
  const emailId = data?.email_id;
  const recipient = data?.to?.[0];

  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "parsed",
    email_id: emailId ?? null,
    detail: { type, has_recipient: Boolean(recipient) },
  });

  if (!emailId || !type) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "unknown_event_type",
      email_id: emailId ?? null,
      detail: { type, missing_email_id: !emailId },
    });
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();
  const ts = created_at ?? new Date().toISOString();

  if (type === "email.delivered") {
    await supabase
      .from("send_logs")
      .update({ status: "sent", delivered_at: ts })
      .eq("provider_message_id", emailId);
    return NextResponse.json({ ok: true });
  }

  if (type === "email.bounced") {
    const errorMsg = data.bounce?.message ?? "Bounced";

    await supabase
      .from("send_logs")
      .update({ status: "bounced", bounced_at: ts, delivery_error: errorMsg })
      .eq("provider_message_id", emailId);

    if (recipient) {
      await supabase
        .from("clients")
        .update({ email_bounced: true, email_bounced_at: ts })
        .eq("email", recipient)
        .eq("email_bounced", false);
    }

    console.warn(`[webhook/resend] Bounce recorded for ${recipient ?? emailId}: ${errorMsg}`);
    return NextResponse.json({ ok: true });
  }

  if (type === "email.complained") {
    await supabase
      .from("send_logs")
      .update({ complained_at: ts })
      .eq("provider_message_id", emailId);

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

  if (type === "email.opened") {
    const { data: logRow } = await supabase
      .from("send_logs")
      .select("policy_id, user_id")
      .eq("provider_message_id", emailId)
      .maybeSingle();

    if (logRow?.policy_id && logRow?.user_id) {
      await writeAuditLog({
        supabase,
        policy_id: logRow.policy_id,
        user_id: logRow.user_id,
        event_type: "signal_received",
        channel: "email",
        recipient: recipient ?? null,
        content_snapshot: null,
        metadata: { trigger: "email_opened", email_id: emailId },
        actor_type: "system",
      });
    }

    return NextResponse.json({ ok: true });
  }

  // All other events (sent, delivery_delayed, clicked, etc.) — acknowledge.
  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "unknown_event_type",
    email_id: emailId,
    detail: { type },
  });
  return NextResponse.json({ ok: true });
}
