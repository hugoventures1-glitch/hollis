/**
 * POST /api/webhooks/resend/inbound
 *
 * Receives Resend inbound email webhooks (Svix-signed), matches the sender
 * to a policy via client_email lookup, and feeds the body into the existing
 * signal classification pipeline.
 *
 * Protected by RESEND_INBOUND_WEBHOOK_SECRET (set in Resend dashboard → Inbound).
 * IMPORTANT: Always returns 200 — returning 4xx causes Resend to retry indefinitely.
 *
 * Observability: every gate writes to public.webhook_events so we can diagnose
 * silent drops without depending on Vercel runtime logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook, WebhookVerificationError } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { processInboundSignal } from "@/lib/agent/process-signal";
import { logWebhookEvent } from "@/lib/webhooks/log-event";
import { validateDocumentForChase } from "@/lib/doc-chase/validate";
import type { ParserOutcome } from "@/types/agent";

const ENDPOINT = "resend_inbound";

// ── Resend inbound email payload (metadata only — body fetched separately) ─────
interface ResendInboundPayload {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    from: string;
    to: string[];
    subject: string;
  };
}

interface ResendInboundAttachment {
  filename: string;
  content_type: string;
  size: number;
  url: string;
}

interface ResendReceivedEmail {
  id: string;
  from: string;
  to: string | string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: ResendInboundAttachment[] | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseFromHeader(from: string): { email: string; name: string | null } {
  const angleMatch = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^"|"$/g, "");
    return {
      email: angleMatch[2].trim().toLowerCase(),
      name: rawName.length > 0 ? rawName : null,
    };
  }
  return { email: from.trim().toLowerCase(), name: null };
}

const QUOTE_MARKERS: RegExp[] = [
  /\n\nOn [^\n]+\n?[^\n]*wrote:/i,
  /\n\n-{3,}/,
  /\n_{3,}/,
  /^>+\s/m,
  /\n\nFrom:\s/i,
  /\n\nSent:\s/i,
];

function stripQuotedReply(text: string): string {
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

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch inbound email body from Resend, with one retry on 404 to absorb
 * the race where email.received fires before the email is indexed.
 */
async function fetchInboundEmail(
  emailId: string,
  apiKey: string
): Promise<{ ok: true; data: ResendReceivedEmail } | { ok: false; status: number }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      return { ok: true, data: (await res.json()) as ResendReceivedEmail };
    }
    if (res.status !== 404 || attempt === 2) {
      return { ok: false, status: res.status };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, status: 0 };
}

// ── Webhook handler ────────────────────────────────────────────────────────────

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

  // ── Signature verification (canonical svix package) ────────────────────────
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
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
      detail: { note: "RESEND_INBOUND_WEBHOOK_SECRET not set — verification skipped" },
    });
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody) as ResendInboundPayload;
  } catch (err) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      detail: { error: "json_parse_failed", message: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ ok: true });
  }

  const { from, email_id } = payload.data ?? {};

  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "parsed",
    email_id: email_id ?? null,
    detail: { type: payload.type, has_from: Boolean(from) },
  });

  if (payload.type !== "email.received") {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "unknown_event_type",
      email_id: email_id ?? null,
      detail: { type: payload.type },
    });
    return NextResponse.json({ ok: true });
  }

  if (!from || !email_id) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      email_id: email_id ?? null,
      detail: { error: "missing_required_fields", has_from: Boolean(from), has_email_id: Boolean(email_id) },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Fetch full email content ───────────────────────────────────────────────
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      email_id,
      detail: { error: "RESEND_API_KEY_missing" },
    });
    return NextResponse.json({ ok: true });
  }

  let emailContent: ResendReceivedEmail;
  try {
    const fetchResult = await fetchInboundEmail(email_id, resendApiKey);
    if (!fetchResult.ok) {
      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "body_fetch_failed",
        email_id,
        http_status: fetchResult.status,
      });
      return NextResponse.json({ ok: true });
    }
    emailContent = fetchResult.data;
  } catch (err) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "body_fetch_failed",
      email_id,
      detail: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ ok: true });
  }

  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "body_fetched",
    email_id,
    detail: {
      has_text: Boolean(emailContent.text?.trim()),
      has_html: Boolean(emailContent.html?.trim()),
    },
  });

  // ── Extract signal text ────────────────────────────────────────────────────
  let rawSignal: string;
  if (emailContent.text?.trim()) {
    rawSignal = stripQuotedReply(emailContent.text);
  } else if (emailContent.html?.trim()) {
    rawSignal = stripQuotedReply(htmlToPlainText(emailContent.html));
  } else {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      email_id,
      detail: { error: "empty_body_no_text_no_html" },
    });
    return NextResponse.json({ ok: true });
  }

  if (!rawSignal.trim()) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      email_id,
      detail: { error: "empty_after_strip" },
    });
    return NextResponse.json({ ok: true });
  }

  rawSignal = rawSignal.slice(0, 10_000);

  // ── Parse sender ───────────────────────────────────────────────────────────
  const { email: senderEmail, name: senderName } = parseFromHeader(from);

  // ── Extract policy number from subject (used to disambiguate candidates) ──
  const subject: string = emailContent.subject ?? payload.data.subject ?? "";
  const policyNumberMatch = subject.match(/\bPOL-\d{4}-\d{4}\b/i);
  const subjectPolicyNumber = policyNumberMatch ? policyNumberMatch[0].toUpperCase() : null;

  // ── Policy lookup ──────────────────────────────────────────────────────────
  const admin = createAdminClient();

  // Resolve broker from signal token in the `to` field (e.g. signal+abc123@hollisai.com.au)
  let brokerUserId: string | null = null;
  const toAddresses: string[] = payload.data.to ?? [];
  for (const addr of toAddresses) {
    // Match broker token from {token}@ildaexi.resend.app
    const m = addr.match(/^([a-z0-9]+)@ildaexi\.resend\.app$/i);
    if (m) {
      const { data: agentProfile } = await admin
        .from("agent_profiles")
        .select("user_id")
        .eq("signal_token", m[1])
        .single();
      if (agentProfile?.user_id) brokerUserId = agentProfile.user_id as string;
      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "broker_token_lookup",
        email_id,
        detail: { token: m[1], resolved: Boolean(brokerUserId) },
      });
      break;
    }
  }

  let policyQuery = admin
    .from("policies")
    .select(
      "id, user_id, client_name, policy_name, policy_number, expiration_date, campaign_stage, last_contact_at, renewal_flags, renewal_paused, client_email, carrier, premium, agent_name, agent_email"
    )
    .eq("client_email", senderEmail)
    .not("campaign_stage", "in", '("confirmed","lapsed")')
    .order("expiration_date", { ascending: false });

  if (brokerUserId) {
    policyQuery = policyQuery.eq("user_id", brokerUserId);
  }

  const { data: candidates, error: lookupError } = await policyQuery;

  if (lookupError) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      email_id,
      sender_email: senderEmail,
      detail: { error: "policy_lookup_failed", message: lookupError.message },
    });
    return NextResponse.json({ ok: true });
  }

  if (!candidates || candidates.length === 0) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "no_policy_match",
      email_id,
      sender_email: senderEmail,
    });

    // Check for active standalone doc-chase requests for this sender.
    // Surface the reply text on the request row so the broker can review
    // and manually mark as received — we don't auto-close without policy context.
    const { data: activeChases } = await admin
      .from("doc_chase_requests")
      .select("id")
      .eq("client_email", senderEmail)
      .in("status", ["pending", "active"]);

    if (activeChases && activeChases.length > 0) {
      const replyAt = new Date().toISOString();
      const ids = activeChases.map((r: { id: string }) => r.id);
      await admin
        .from("doc_chase_requests")
        .update({ last_client_reply: rawSignal.slice(0, 2000), last_client_reply_at: replyAt })
        .in("id", ids);

      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "doc_chase_reply",
        email_id,
        sender_email: senderEmail,
        detail: { doc_chase_request_ids: ids, reply_length: rawSignal.length },
      });

      // ── Attachment processing ─────────────────────────────────────────────
      // If the reply includes file attachments, validate the first supported one
      // against each active chase and auto-close any that pass.
      const supportedMimeTypes = new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ]);

      const attachments = emailContent.attachments ?? [];
      const firstAttachment = attachments.find((a) => supportedMimeTypes.has(a.content_type));

      if (firstAttachment && resendApiKey) {
        try {
          // Download attachment bytes from Resend
          const attachRes = await fetch(firstAttachment.url, {
            headers: { Authorization: `Bearer ${resendApiKey}` },
          });

          if (attachRes.ok) {
            const attachBuffer = Buffer.from(await attachRes.arrayBuffer());
            const base64 = attachBuffer.toString("base64");

            // Fetch full chase rows to get document_type + notes
            const { data: chaseRows } = await admin
              .from("doc_chase_requests")
              .select("id, document_type, notes, policy_id, user_id, client_email")
              .in("id", ids);

            for (const chase of chaseRows ?? []) {
              const result = await validateDocumentForChase(
                base64,
                firstAttachment.content_type,
                chase.document_type,
                chase.notes
              );

              const nowIso = new Date().toISOString();
              const isPass = result.verdict === "pass";

              const uuid = crypto.randomUUID();
              const safeName = firstAttachment.filename.replace(/[^a-z0-9._-]/gi, "_").slice(0, 100);
              const storagePath = `${chase.user_id}/${chase.id}/${uuid}-${safeName}`;

              // Upload to storage
              const { error: uploadErr } = await admin.storage
                .from("doc-chase-attachments")
                .upload(storagePath, attachBuffer, {
                  contentType: firstAttachment.content_type,
                  upsert: false,
                });

              if (uploadErr) {
                console.error("[webhook/resend/inbound] Attachment storage upload failed:", uploadErr.message);
              }

              const updatePayload: Record<string, unknown> = {
                received_attachment_path: uploadErr ? null : storagePath,
                received_attachment_filename: firstAttachment.filename,
                received_attachment_content_type: firstAttachment.content_type,
                validation_status: result.verdict,
                validation_summary: result.summary,
                validation_issues: result.issues.length > 0 ? result.issues : null,
                validation_confidence: result.confidence,
                validated_at: nowIso,
              };

              if (isPass) {
                updatePayload.status = "received";
              }

              await admin
                .from("doc_chase_requests")
                .update(updatePayload)
                .eq("id", chase.id);
            }

            await logWebhookEvent({
              endpoint: ENDPOINT,
              gate: "doc_chase_attachment_validated",
              email_id,
              sender_email: senderEmail,
              detail: {
                filename: firstAttachment.filename,
                content_type: firstAttachment.content_type,
                chase_ids: ids,
              },
            });
          }
        } catch (attachErr) {
          console.error("[webhook/resend/inbound] Attachment validation failed:", attachErr);
          await logWebhookEvent({
            endpoint: ENDPOINT,
            gate: "pipeline_error",
            email_id,
            sender_email: senderEmail,
            detail: {
              error: "attachment_validation_failed",
              message: attachErr instanceof Error ? attachErr.message : String(attachErr),
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  const distinctBrokers = new Set(candidates.map((c) => c.user_id));
  if (distinctBrokers.size > 1) {
    console.warn(
      `[webhook/resend/inbound] Sender ${senderEmail} matched ${candidates.length} policies across ${distinctBrokers.size} brokers — using most-recently-expiring`
    );
  }

  // Prefer exact policy number match from the email subject to avoid
  // misattribution when multiple active policies share the same client_email.
  let policy = candidates[0];
  if (subjectPolicyNumber && candidates.length > 1) {
    const exactMatch = candidates.find(
      (c) => (c.policy_number as string | null)?.toUpperCase() === subjectPolicyNumber
    );
    if (exactMatch) policy = exactMatch;
  }

  // ── Fetch few-shot outcomes for this broker ────────────────────────────────
  const { data: recentOutcomes } = await admin
    .from("parser_outcomes")
    .select("*")
    .eq("user_id", policy.user_id)
    .in("broker_action", ["approved", "edited"])
    .order("created_at", { ascending: false })
    .limit(10);

  // ── Run signal pipeline ────────────────────────────────────────────────────
  const matchedBySubject =
    subjectPolicyNumber != null &&
    (policy.policy_number as string | null)?.toUpperCase() === subjectPolicyNumber;

  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "pipeline_started",
    email_id,
    sender_email: senderEmail,
    policy_id: policy.id as string,
    user_id: policy.user_id as string,
    detail: {
      match_strategy: matchedBySubject ? "subject_policy_number" : "email_fallback",
      candidates_count: candidates.length,
    },
  });

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

    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_done",
      email_id,
      sender_email: senderEmail,
      policy_id: policy.id as string,
      user_id: policy.user_id as string,
    });
  } catch (pipelineErr) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_error",
      email_id,
      sender_email: senderEmail,
      policy_id: policy.id as string,
      user_id: policy.user_id as string,
      detail: {
        error: pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
