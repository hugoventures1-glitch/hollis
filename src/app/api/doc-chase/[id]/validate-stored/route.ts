/**
 * POST /api/doc-chase/[id]/validate-stored
 *
 * Validates an already-stored attachment for a doc chase request.
 * Used by the inbox "Validate" button — no file upload needed, the
 * attachment is already in Supabase Storage.
 *
 * On pass  → sets status = "received" (DB trigger closes sequence + messages)
 * On other → writes validation result + generates a draft reply for broker review
 *
 * Returns: { verdict, summary, issues, confidence, draft_subject?, draft_body? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDocumentForChase, generateDocChaseDraftReply } from "@/lib/doc-chase/validate";
import { writeAuditLog } from "@/lib/audit/log";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership + fetch chase details
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
  if (!chase.received_attachment_path) {
    return NextResponse.json({ error: "No attachment to validate" }, { status: 400 });
  }

  const mimeType: string = chase.received_attachment_content_type ?? "application/octet-stream";

  // Download the stored attachment via admin client (bypasses Storage RLS)
  const admin = createAdminClient();
  const { data: fileData, error: downloadError } = await admin.storage
    .from("doc-chase-attachments")
    .download(chase.received_attachment_path);

  if (downloadError || !fileData) {
    console.error("[doc-chase/validate-stored] Download failed:", downloadError?.message);
    return NextResponse.json({ error: "Could not read stored attachment" }, { status: 500 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const base64 = buffer.toString("base64");

  // Validate with Claude
  const result = await validateDocumentForChase(
    base64,
    mimeType,
    chase.document_type,
    chase.notes ?? null
  );

  const nowIso = new Date().toISOString();
  const isPass = result.verdict === "pass";

  const updatePayload: Record<string, unknown> = {
    validation_status: result.verdict,
    validation_summary: result.summary,
    validation_issues: result.issues.length > 0 ? result.issues : null,
    validation_confidence: result.confidence,
    validated_at: nowIso,
  };

  let draftSubject: string | null = null;
  let draftBody: string | null = null;

  if (isPass) {
    updatePayload.status = "received";
  } else if (result.verdict === "partial" || result.verdict === "fail") {
    // Generate a draft reply explaining the issues
    const draft = await generateDocChaseDraftReply({
      clientName: chase.client_name,
      documentType: chase.document_type,
      validationSummary: result.summary,
      validationIssues: result.issues,
      notes: chase.notes ?? null,
    });
    draftSubject = draft.subject;
    draftBody = draft.body;
    updatePayload.draft_reply_subject = draftSubject;
    updatePayload.draft_reply_body = draftBody;
  }

  await supabase
    .from("doc_chase_requests")
    .update(updatePayload)
    .eq("id", id);

  // Audit log when linked to a policy and document passes
  if (isPass && chase.policy_id) {
    await writeAuditLog({
      supabase,
      policy_id: chase.policy_id,
      user_id: user.id,
      event_type: "doc_received",
      channel: "web",
      recipient: chase.client_email,
      content_snapshot: `Document validated (from inbox): ${chase.document_type} — ${result.summary}`,
      metadata: {
        doc_chase_request_id: id,
        document_type: chase.document_type,
        validation_verdict: result.verdict,
        validation_confidence: result.confidence,
        source: "validate_stored",
      },
      actor_type: "agent",
    });

    // Create a Suggestion in the approval queue so the broker can add
    // this document to the client's AI reference docs with one click.
    if (chase.received_attachment_path) {
      // Find the client record to get client_id
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .or(
          chase.client_email
            ? `email.eq.${chase.client_email},name.ilike.%${chase.client_name}%`
            : `name.ilike.%${chase.client_name}%`
        )
        .limit(1)
        .maybeSingle();

      if (clientRow) {
        await supabase.from("approval_queue").insert({
          policy_id: chase.policy_id,
          user_id: user.id,
          signal_id: null,
          classified_intent: "ai_suggestion",
          confidence_score: 1.0,
          raw_signal_snippet: `${chase.document_type} received from ${chase.client_name} — validated successfully.`,
          proposed_action: {
            action_type: "update_reference_documents",
            description: `New ${chase.document_type} received from ${chase.client_name} — add it to their AI reference documents?`,
            payload: {
              doc_chase_id: id,
              client_id: clientRow.id,
              storage_path: chase.received_attachment_path,
              original_filename: chase.received_attachment_filename ?? chase.document_type,
              suggested_label: chase.document_type,
            },
          },
          status: "pending",
        });
      }
    }
  }

  return NextResponse.json({
    verdict: result.verdict,
    summary: result.summary,
    issues: result.issues,
    confidence: result.confidence,
    ...(draftSubject ? { draft_subject: draftSubject } : {}),
    ...(draftBody ? { draft_body: draftBody } : {}),
  });
}
