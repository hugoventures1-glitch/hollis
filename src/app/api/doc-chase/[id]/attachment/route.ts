/**
 * GET /api/doc-chase/[id]/attachment
 *
 * Returns a short-lived signed URL (5 minutes) for the attachment stored in
 * Supabase Storage for this doc-chase request.  The calling user must own the
 * request (RLS-compatible check via service-role scoped to user_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership + pull attachment path
  const { data: chase, error } = await supabase
    .from("doc_chase_requests")
    .select("id, user_id, received_attachment_path, received_attachment_content_type, received_attachment_filename")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !chase) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!chase.received_attachment_path) {
    return NextResponse.json({ error: "No attachment on this request" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("doc-chase-attachments")
    .createSignedUrl(chase.received_attachment_path, 300); // 5 minutes

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    filename: chase.received_attachment_filename,
    contentType: chase.received_attachment_content_type,
  });
}
