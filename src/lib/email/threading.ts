/**
 * Email threading utilities for RFC 5322 (In-Reply-To / References)
 * and Outlook proprietary headers (Thread-Index / Thread-Topic).
 *
 * Pure functions — no I/O, no side effects.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThreadingContext {
  /** The SMTP Message-ID of the inbound email we are replying to. */
  messageId: string | null | undefined;
  /** The inbound email's own References header chain (may be null for first replies). */
  referencesHeaders: string | null | undefined;
  /** Outlook Thread-Index from the inbound email (absent for non-Outlook clients). */
  threadIndex: string | null | undefined;
  /** Outlook Thread-Topic from the inbound email (absent for non-Outlook clients). */
  threadTopic: string | null | undefined;
  /** The subject line (used to derive Thread-Topic when threadTopic is absent). */
  subject: string | null | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the bare subject with all reply/forward prefixes removed. */
function bareSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  return subject.replace(/^((Re|RE|Fwd|FW):\s*)+/g, "").trimStart();
}

// ─── normalizeReplySubject ────────────────────────────────────────────────────

/**
 * Strips all leading Re:/RE:/Fwd:/FW: prefixes (including stacked ones)
 * and returns "Re: <bare subject>".
 */
export function normalizeReplySubject(subject: string | null | undefined): string {
  if (!subject) return "Re: Your email";
  const bare = bareSubject(subject);
  return `Re: ${bare || subject}`;
}

// ─── computeChildThreadIndex ──────────────────────────────────────────────────

/**
 * Derives an Outlook Thread-Index child value from the parent's base64 blob.
 *
 * Outlook threading algorithm:
 *   1. Decode the parent Thread-Index from base64.
 *   2. Compute a Windows FILETIME for "now"
 *      (100-nanosecond intervals since 1601-01-01 00:00:00 UTC).
 *   3. Append the first 5 bytes of the FILETIME as little-endian to parent bytes.
 *   4. Re-encode as base64.
 *
 * Returns null if parentBase64 is falsy or malformed — caller omits the header.
 */
export function computeChildThreadIndex(parentBase64: string | null | undefined): string | null {
  if (!parentBase64) return null;

  let parentBytes: Buffer;
  try {
    parentBytes = Buffer.from(parentBase64, "base64");
  } catch {
    return null;
  }

  // Windows FILETIME = 100-ns intervals since 1601-01-01
  // JS Date.now() is ms since 1970-01-01; offset = 11644473600 seconds = 11644473600000 ms
  const OFFSET_MS = BigInt(11644473600000);
  const nowFiletime = (BigInt(Date.now()) + OFFSET_MS) * BigInt(10000);

  // Write as 8-byte little-endian, take first 5 bytes
  const filetimeBytes = Buffer.alloc(8);
  filetimeBytes.writeBigUInt64LE(nowFiletime);
  const suffix = filetimeBytes.subarray(0, 5);

  return Buffer.concat([parentBytes, suffix]).toString("base64");
}

// ─── buildReplyHeaders ────────────────────────────────────────────────────────

/**
 * Builds the headers Record to pass to Resend's emails.send({ headers: ... }).
 *
 * RFC 5322 threading:
 *   In-Reply-To: <message-id of the email we are replying to>
 *   References:  <references chain> <message-id we are replying to>
 *
 * Outlook threading (only when inbound email had Thread-Index):
 *   Thread-Index: <child blob derived from parent>
 *   Thread-Topic: <bare subject without Re:/Fwd: prefixes>
 *
 * Returns {} when messageId is null/undefined — safe to pass to Resend (adds no headers).
 */
export function buildReplyHeaders(ctx: ThreadingContext): Record<string, string> {
  const headers: Record<string, string> = {};

  // ── RFC 5322 ──────────────────────────────────────────────────────────────
  if (!ctx.messageId) return headers;

  headers["In-Reply-To"] = ctx.messageId;

  const existingRefs = ctx.referencesHeaders?.trim() ?? "";
  headers["References"] = existingRefs
    ? `${existingRefs} ${ctx.messageId}`
    : ctx.messageId;

  // ── Outlook ───────────────────────────────────────────────────────────────
  // Only emit when the inbound email had a Thread-Index (i.e. came from Outlook).
  const childIndex = computeChildThreadIndex(ctx.threadIndex);
  if (childIndex) {
    headers["Thread-Index"] = childIndex;

    const topic = ctx.threadTopic ?? bareSubject(ctx.subject);
    if (topic) {
      headers["Thread-Topic"] = topic;
    }
  }

  return headers;
}
