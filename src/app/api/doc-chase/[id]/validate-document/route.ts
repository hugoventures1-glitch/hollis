/**
 * POST /api/doc-chase/[id]/validate-document
 *
 * Accepts a multipart/form-data upload with a single "file" field.
 * Uploads the file to Supabase Storage (doc-chase-attachments bucket),
 * validates it with Claude, and updates the chase record.
 *
 * On pass  → sets status = "received" (DB trigger closes sequence + messages)
 * On other → leaves status unchanged; writes validation result for broker review
 *
 * Supported file types: PDF, JPEG, PNG, GIF, WEBP (max 10 MB)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDocumentForChase } from "@/lib/doc-chase/validate";
import { writeAuditLog } from "@/lib/audit/log";

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership + status
  const { data: chase } = await supabase
    .from("doc_chase_requests")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (chase.status === "received" || chase.status === "cancelled") {
    return NextResponse.json({ error: "Chase is already resolved" }, { status: 400 });
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const mimeType = file.type;
  if (!ALLOWED_TYPES[mimeType]) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: PDF, JPEG, PNG, GIF, WEBP` },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large — maximum 10 MB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");

  // Upload to Supabase Storage
  const admin = createAdminClient();
  const ext = ALLOWED_TYPES[mimeType];
  const uuid = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 100);
  const storagePath = `${user.id}/${id}/${uuid}-${safeName || `document${ext}`}`;

  const { error: uploadError } = await admin.storage
    .from("doc-chase-attachments")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error("[doc-chase/validate-document] Storage upload failed:", uploadError.message);
    return NextResponse.json({ error: "File upload failed" }, { status: 500 });
  }

  // Validate with Claude
  const result = await validateDocumentForChase(
    base64,
    mimeType,
    chase.document_type,
    chase.notes
  );

  const nowIso = new Date().toISOString();
  const isPass = result.verdict === "pass";

  // Write validation fields + optionally close the chase
  const updatePayload: Record<string, unknown> = {
    received_attachment_path: storagePath,
    received_attachment_filename: file.name,
    received_attachment_content_type: mimeType,
    validation_status: result.verdict,
    validation_summary: result.summary,
    validation_issues: result.issues.length > 0 ? result.issues : null,
    validation_confidence: result.confidence,
    validated_at: nowIso,
  };

  if (isPass) {
    updatePayload.status = "received";
    // received_at is set by the DB trigger (mark_document_received)
  }

  await supabase
    .from("doc_chase_requests")
    .update(updatePayload)
    .eq("id", id);

  // Audit log — only when linked to a policy
  if (isPass && chase.policy_id) {
    await writeAuditLog({
      supabase,
      policy_id: chase.policy_id,
      user_id: user.id,
      event_type: "doc_received",
      channel: "web",
      recipient: chase.client_email,
      content_snapshot: `Document received (manual upload): ${chase.document_type} — ${result.summary}`,
      metadata: {
        doc_chase_request_id: id,
        document_type: chase.document_type,
        attachment_filename: file.name,
        validation_verdict: result.verdict,
        validation_confidence: result.confidence,
      },
      actor_type: "agent",
    });
  }

  return NextResponse.json({
    verdict: result.verdict,
    summary: result.summary,
    issues: result.issues,
    confidence: result.confidence,
  });
}
