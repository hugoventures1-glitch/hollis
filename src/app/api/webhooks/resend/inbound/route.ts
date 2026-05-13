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
import type { ParserOutcome } from "@/types/agent";
import { classifyIntent } from "@/lib/agent/intent-classifier";
import { generateDocChaseQueryResponse } from "@/lib/doc-chase/validate";
import { logAction, retainStandard } from "@/lib/logAction";

const ESCALATION_INTENTS = new Set([
  "active_claim_mentioned",
  "insurer_declined",
  "business_restructure",
  "cancel_policy",
  "legal_dispute_mentioned",
  "unverified_third_party",
  "premium_increase_major",
  // New intents (Fixes 2, 7, 1)
  "declined_churn",
  "contact_change",
  "forwarded_no_intent",
]);

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
    headers?: Record<string, string>;
  };
}

interface ResendInboundAttachment {
  filename: string;
  content_type: string;
  size: number;
  // Resend may deliver attachment bytes as base64 `content` OR as a `url` to fetch.
  // Handle both — prefer `content` to avoid an extra round-trip.
  content?: string | null;  // base64-encoded bytes
  url?: string | null;       // signed download URL
}

interface ResendReceivedEmail {
  id: string;
  from: string;
  to: string | string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: ResendInboundAttachment[] | null;
  headers?: Record<string, string>;
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

// ── Fix 1: Forward detection ───────────────────────────────────────────────────
// Detects forwarded emails before any Claude API call is made.
// A forwarded email is never a direct client reply — we must not auto-respond.

const FORWARD_SUBJECT_PREFIXES = /^(fwd|fw)\s*:/i;
const FORWARD_BODY_MARKERS = [
  "---------- forwarded message ----------",
  "begin forwarded message:",
  "---original message---",
  "----original message----",
];

function isForwardedEmail(rawSignal: string, subject: string): boolean {
  if (FORWARD_SUBJECT_PREFIXES.test(subject.trim())) return true;
  const lower = rawSignal.toLowerCase();
  return FORWARD_BODY_MARKERS.some((marker) => lower.includes(marker));
}

// ── Doc chase processing helper ────────────────────────────────────────────────
// Matches inbound emails to open doc chase requests for the sender.
// Stores the reply text and any attachment — broker reviews and marks received manually.

async function processDocChaseForSender(opts: {
  admin: ReturnType<typeof createAdminClient>;
  senderEmail: string;
  rawSignal: string;
  emailContent: ResendReceivedEmail;
  resendApiKey: string;
  email_id: string;
  messageId?: string | null;
}): Promise<void> {
  const { admin, senderEmail, rawSignal, emailContent, resendApiKey, email_id, messageId } = opts;

  const { data: activeChases } = await admin
    .from("doc_chase_requests")
    .select("id, user_id, client_name, document_type, notes, policy_id")
    .eq("client_email", senderEmail)
    .in("status", ["pending", "active"]);

  if (!activeChases || activeChases.length === 0) return;

  const replyAt = new Date().toISOString();
  const ids = activeChases.map((r: { id: string }) => r.id);

  const dcUpdate: Record<string, unknown> = {
    last_client_reply: rawSignal.slice(0, 2000) || null,
    last_client_reply_at: replyAt,
  };
  if (messageId) dcUpdate.last_client_message_id = messageId;

  await admin
    .from("doc_chase_requests")
    .update(dcUpdate)
    .in("id", ids);

  await logWebhookEvent({
    endpoint: ENDPOINT,
    gate: "doc_chase_reply",
    email_id,
    sender_email: senderEmail,
    detail: { doc_chase_request_ids: ids, reply_length: rawSignal.length },
  });

  const supportedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ]);

  const attachments = emailContent.attachments ?? [];
  const firstAttachment = attachments.find((a) => supportedMimeTypes.has(a.content_type));

  if (firstAttachment) {
    // ── Attachment path: store only — broker validates manually via inbox ──
    try {
      let attachBuffer: Buffer;

      if (firstAttachment.content) {
        // Resend delivers base64-encoded content directly — decode it
        attachBuffer = Buffer.from(firstAttachment.content, "base64");
      } else if (firstAttachment.url) {
        // Resend provides a signed URL to fetch
        const attachRes = await fetch(firstAttachment.url, {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        });
        if (!attachRes.ok) {
          await logWebhookEvent({
            endpoint: ENDPOINT,
            gate: "pipeline_error",
            email_id,
            sender_email: senderEmail,
            detail: { error: "attachment_fetch_failed", status: attachRes.status },
          });
          // Don't return — still process the text reply
          return;
        }
        attachBuffer = Buffer.from(await attachRes.arrayBuffer());
      } else {
        // No content or url — log and skip attachment
        await logWebhookEvent({
          endpoint: ENDPOINT,
          gate: "pipeline_error",
          email_id,
          sender_email: senderEmail,
          detail: { error: "attachment_no_content_or_url", filename: firstAttachment.filename },
        });
        return;
      }

      for (const chase of activeChases) {
        const uuid = crypto.randomUUID();
        const safeName = firstAttachment.filename.replace(/[^a-z0-9._-]/gi, "_").slice(0, 100);
        const storagePath = `${chase.user_id}/${chase.id}/${uuid}-${safeName}`;

        const { error: uploadErr } = await admin.storage
          .from("doc-chase-attachments")
          .upload(storagePath, attachBuffer, {
            contentType: firstAttachment.content_type,
            upsert: false,
          });

        if (uploadErr) {
          console.error("[webhook/resend/inbound] Attachment upload failed:", uploadErr.message);
        }

        const attachUpdate: Record<string, unknown> = {
          received_attachment_filename: firstAttachment.filename,
          received_attachment_content_type: firstAttachment.content_type,
        };
        if (!uploadErr) attachUpdate.received_attachment_path = storagePath;

        await admin
          .from("doc_chase_requests")
          .update(attachUpdate)
          .eq("id", chase.id);
      }

      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "doc_chase_attachment_stored",
        email_id,
        sender_email: senderEmail,
        detail: {
          filename: firstAttachment.filename,
          content_type: firstAttachment.content_type,
          chase_ids: ids,
        },
      });
    } catch (err) {
      console.error("[webhook/resend/inbound] Attachment storage failed:", err);
      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "pipeline_error",
        email_id,
        sender_email: senderEmail,
        detail: {
          error: "attachment_storage_failed",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  } else if (rawSignal) {
    // ── Text-only reply: classify intent and act ───────────────────────────
    // Use the first chase's user_id for few-shot outcomes (all chases share sender)
    const brokerUserId = activeChases[0].user_id as string;

    let classification: Awaited<ReturnType<typeof classifyIntent>> | null = null;

    try {
      // Fetch broker's recent parser_outcomes for few-shot injection
      const { data: recentOutcomes } = await admin
        .from("parser_outcomes")
        .select("*")
        .eq("user_id", brokerUserId)
        .in("broker_action", ["approved", "edited"])
        .order("created_at", { ascending: false })
        .limit(10);

      classification = await classifyIntent(rawSignal, (recentOutcomes as ParserOutcome[]) ?? []);

      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "doc_chase_classified",
        email_id,
        sender_email: senderEmail,
        detail: {
          intent: classification.intent,
          confidence: classification.confidence,
          chase_ids: ids,
        },
      });
    } catch (classifyErr) {
      console.error("[webhook/resend/inbound] Doc chase classification failed:", classifyErr);
    }

    if (!classification) return;

    const intent = classification.intent;

    if (intent === "out_of_office") {
      // Pause the chase — push all scheduled touches forward by 7 days
      for (const chase of activeChases) {
        try {
          const { data: seq } = await admin
            .from("doc_chase_sequences")
            .select("id")
            .eq("request_id", chase.id)
            .eq("sequence_status", "active")
            .maybeSingle();

          if (seq) {
            // Fetch scheduled messages and shift their dates
            const { data: scheduledMsgs } = await admin
              .from("doc_chase_messages")
              .select("id, scheduled_for")
              .eq("sequence_id", seq.id)
              .eq("status", "scheduled");

            if (scheduledMsgs && scheduledMsgs.length > 0) {
              for (const msg of scheduledMsgs) {
                const newDate = new Date(msg.scheduled_for as string);
                newDate.setDate(newDate.getDate() + 7);
                await admin
                  .from("doc_chase_messages")
                  .update({ scheduled_for: newDate.toISOString() })
                  .eq("id", msg.id);
              }
            }
          }

          await logWebhookEvent({
            endpoint: ENDPOINT,
            gate: "doc_chase_ooo_pause",
            email_id,
            sender_email: senderEmail,
            detail: { chase_id: chase.id, days_pushed: 7 },
          });
        } catch (oooErr) {
          console.error("[webhook/resend/inbound] OOO pause failed:", oooErr);
        }
      }
    } else if (intent === "soft_query") {
      // Generate a draft reply for the broker to review
      const firstChase = activeChases[0];
      try {
        const draft = await generateDocChaseQueryResponse({
          clientName: firstChase.client_name as string,
          documentType: firstChase.document_type as string,
          rawSignal,
          notes: (firstChase.notes as string | null) ?? null,
        });

        // Apply the same draft to all active chases for this sender
        await admin
          .from("doc_chase_requests")
          .update({
            draft_reply_subject: draft.subject,
            draft_reply_body: draft.body,
          })
          .in("id", ids);

        await logWebhookEvent({
          endpoint: ENDPOINT,
          gate: "doc_chase_draft_generated",
          email_id,
          sender_email: senderEmail,
          detail: { intent, confidence: classification.confidence, chase_ids: ids },
        });
      } catch (draftErr) {
        console.error("[webhook/resend/inbound] Doc chase draft generation failed:", draftErr);
      }
    } else if (ESCALATION_INTENTS.has(intent)) {
      // Store a clear escalation alert as the draft so the broker sees it in the inbox
      const alertBody = `⚠️ ESCALATION — Hollis detected a sensitive reply from this client (${intent.replace(/_/g, " ")}).\n\nClient's message:\n"${rawSignal.slice(0, 500)}"\n\nPlease review and follow up directly with the client.`;

      await admin
        .from("doc_chase_requests")
        .update({
          draft_reply_subject: `⚠️ Action required — ${activeChases[0].document_type}`,
          draft_reply_body: alertBody,
        })
        .in("id", ids);

      void logAction({
        broker_id: brokerUserId,
        policy_id: (activeChases[0].policy_id as string | null) ?? null,
        action_type: "doc_chase_escalation",
        trigger_reason: `Doc chase escalation detected: ${intent} — manual broker action required.`,
        payload: { intent, confidence: classification.confidence, raw_signal: rawSignal.slice(0, 500) },
        metadata: { doc_chase_request_ids: ids, sender_email: senderEmail },
        outcome: "flagged",
        retain_until: retainStandard(),
      });

      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "doc_chase_escalation",
        email_id,
        sender_email: senderEmail,
        detail: { intent, confidence: classification.confidence, chase_ids: ids },
      });
    }
    // For document_received without attachment and all other intents: reply text
    // is already stored in last_client_reply — no further action needed
  }
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
      attachment_count: emailContent.attachments?.length ?? 0,
      attachment_types: emailContent.attachments?.map((a) => a.content_type) ?? [],
    },
  });

  // ── Extract signal text ────────────────────────────────────────────────────
  let rawSignal: string;
  if (emailContent.text?.trim()) {
    rawSignal = stripQuotedReply(emailContent.text).slice(0, 10_000);
  } else if (emailContent.html?.trim()) {
    rawSignal = stripQuotedReply(htmlToPlainText(emailContent.html)).slice(0, 10_000);
  } else {
    rawSignal = "";
  }

  // ── Extract email thread headers ───────────────────────────────────────────
  // Resend may send headers as either a flat Record<string, string> or as an
  // array of { name: string; value: string } objects. Normalise both shapes
  // and lowercase all keys so lookups are case-insensitive.
  function normalizeHeaders(raw: unknown): Record<string, string> {
    if (!raw) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        out[k.toLowerCase()] = typeof v === "string" ? v : String(v);
      }
      return out;
    }
    if (Array.isArray(raw)) {
      const out: Record<string, string> = {};
      for (const item of raw) {
        if (item && typeof item === "object" && "name" in item && "value" in item) {
          const name = String(item.name).toLowerCase();
          out[name] = String(item.value);
        }
      }
      return out;
    }
    return {};
  }

  const inboundHeaders = normalizeHeaders(payload.data.headers ?? emailContent.headers);
  const messageId = inboundHeaders["message-id"] ?? null;
  const inReplyTo = inboundHeaders["in-reply-to"] ?? null;
  const referencesHdr = inboundHeaders["references"] ?? null;

  // ── Parse sender ───────────────────────────────────────────────────────────
  const { email: senderEmail, name: senderName } = parseFromHeader(from);

  // ── Extract policy number from subject (used to disambiguate candidates) ──
  const subject: string = emailContent.subject ?? payload.data.subject ?? "";
  const policyNumberMatch = subject.match(/\bPOL-\d{4}-\d{4}\b/i);
  const subjectPolicyNumber = policyNumberMatch ? policyNumberMatch[0].toUpperCase() : null;

  // ── Policy lookup ──────────────────────────────────────────────────────────
  const admin = createAdminClient();

  // Attachment-only email (no body text) — skip signal pipeline but still
  // process any doc-chase attachments before returning.
  if (!rawSignal) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "attachment_only_email",
      email_id,
      sender_email: senderEmail,
      detail: { attachment_count: (emailContent.attachments ?? []).length },
    });
    await processDocChaseForSender({
      admin,
      senderEmail,
      rawSignal: "",
      emailContent,
      resendApiKey,
      email_id,
      messageId,
    });
    return NextResponse.json({ ok: true });
  }

  // ── Early-exit: active doc chase for sender ────────────────────────────────
  // If the sender has open doc chase requests, their email is a document reply.
  // Process the doc chase and skip the signal pipeline entirely — otherwise
  // the classifier creates "document_received" queue items that pollute the inbox.
  {
    const { data: senderDocChases } = await admin
      .from("doc_chase_requests")
      .select("id")
      .eq("client_email", senderEmail)
      .in("status", ["pending", "active"])
      .limit(1);

    if (senderDocChases && senderDocChases.length > 0) {
      await logWebhookEvent({
        endpoint: ENDPOINT,
        gate: "doc_chase_only",
        email_id,
        sender_email: senderEmail,
        detail: { note: "Active doc chase found — skipping signal pipeline" },
      });
    await processDocChaseForSender({
      admin,
      senderEmail,
      rawSignal,
      emailContent,
      resendApiKey,
      email_id,
      messageId,
    });
    return NextResponse.json({ ok: true });
    }
  }

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
      "id, user_id, client_name, policy_name, expiration_date, campaign_stage, last_contact_at, renewal_flags, renewal_paused, client_email, carrier, premium, agent_name, agent_email"
    )
    .eq("client_email", senderEmail)
    .not("campaign_stage", "in", '("confirmed","lapsed","declined")')
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

    await processDocChaseForSender({
      admin,
      senderEmail,
      rawSignal,
      emailContent,
      resendApiKey,
      email_id,
      messageId,
    });

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
      (c) => (c.policy_name as string | null)?.toUpperCase().includes(subjectPolicyNumber)
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
    (policy.policy_name as string | null)?.toUpperCase().includes(subjectPolicyNumber) === true;

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

  // ── Fetch signal attachment (if present) ──────────────────────────────────────
  // Stored to Supabase storage inside processInboundSignal (needs signal.id first).
  // We fetch the bytes here so the webhook doesn't need to re-fetch them later.
  const signalAttachmentMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ]);
  let signalAttachment: { buffer: Buffer; filename: string; content_type: string } | null = null;
  const signalFirstAttach = (emailContent.attachments ?? []).find((a) =>
    signalAttachmentMimeTypes.has(a.content_type)
  );
  if (signalFirstAttach) {
    try {
      let buf: Buffer;
      if (signalFirstAttach.content) {
        buf = Buffer.from(signalFirstAttach.content, "base64");
      } else if (signalFirstAttach.url) {
        const r = await fetch(signalFirstAttach.url, { headers: { Authorization: `Bearer ${resendApiKey}` } });
        if (r.ok) buf = Buffer.from(await r.arrayBuffer());
        else buf = Buffer.alloc(0);
      } else {
        buf = Buffer.alloc(0);
      }
      if (buf.length > 0) {
        signalAttachment = { buffer: buf, filename: signalFirstAttach.filename, content_type: signalFirstAttach.content_type };
      }
    } catch (attachFetchErr) {
      console.error("[webhook/resend/inbound] Signal attachment fetch failed:", attachFetchErr);
    }
  }

  // ── Fix 1: Forwarded email detection — must happen BEFORE processInboundSignal ─
  // Forwards are never direct client replies. We surface them to the broker as
  // a Tier 3 task and skip the signal pipeline entirely so Hollis never auto-replies.
  if (isForwardedEmail(rawSignal, subject)) {
    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "forward_detected",
      email_id,
      sender_email: senderEmail,
      policy_id: policy.id as string,
      user_id: policy.user_id as string,
      detail: { subject },
    });

    // Write inbound_signals record for audit trail
    const { data: fwdSignal } = await admin
      .from("inbound_signals")
      .insert({
        policy_id: policy.id as string,
        user_id: policy.user_id as string,
        raw_signal: rawSignal,
        sender_email: senderEmail,
        sender_name: senderName,
        source: "email",
        email_id,
        message_id: messageId ?? null,
        in_reply_to: inReplyTo ?? null,
        references_headers: referencesHdr ?? null,
        processed: true,
        processed_at: new Date().toISOString(),
        classification_result: {
          intent: "forwarded_no_intent",
          confidence: 1.0,
          flags_detected: [],
          premium_increase_pct: null,
          reasoning: "Email detected as a forward — subject prefix or forwarded message header present. No auto-reply sent.",
        },
      })
      .select("id")
      .single();

    // Surface as Tier 3 in the approval_queue inbox
    await admin.from("approval_queue").insert({
      policy_id: policy.id as string,
      user_id: policy.user_id as string,
      signal_id: fwdSignal?.id ?? null,
      classified_intent: "forwarded_no_intent",
      confidence_score: 1.0,
      raw_signal_snippet: rawSignal.slice(0, 500),
      proposed_action: {
        description: `Forwarded email received for ${policy.client_name as string} — Hollis did not reply. Review to determine if action is needed.`,
        action_type: "escalation_review",
        payload: {
          intent: "forwarded_no_intent",
          subject,
          sender_email: senderEmail,
          raw_signal_snippet: rawSignal.slice(0, 300),
        },
      },
      status: "pending",
      tier: 3,
      in_reply_to: messageId ?? null,
      email_references: referencesHdr ?? null,
    });

    return NextResponse.json({ ok: true });
  }

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
      emailId: email_id,
      messageId,
      inReplyTo,
      referencesHeaders: referencesHdr,
      attachment: signalAttachment,
    });

    await logWebhookEvent({
      endpoint: ENDPOINT,
      gate: "pipeline_done",
      email_id,
      sender_email: senderEmail,
      policy_id: policy.id as string,
      user_id: policy.user_id as string,
    });

    // Also check for active doc chase requests — a sender can have both a
    // matching policy (signal pipeline) and an open doc chase simultaneously.
    await processDocChaseForSender({
      admin,
      senderEmail,
      rawSignal,
      emailContent,
      resendApiKey,
      email_id,
      messageId,
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
