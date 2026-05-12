/**
 * GET /api/agent/review/[id]/attachment
 *
 * Returns a short-lived signed URL (5 minutes) for the attachment stored in
 * Supabase Storage for a decision inbox item. The attachment path is stored
 * in approval_queue.proposed_action.payload.attachment_path.
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

  // Verify ownership and fetch proposed_action
  const { data: item, error } = await supabase
    .from("approval_queue")
    .select("id, user_id, proposed_action")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = (item.proposed_action as { payload?: Record<string, unknown> } | null)?.payload ?? {};
  const attachmentPath = typeof payload.attachment_path === "string" ? payload.attachment_path : null;

  if (!attachmentPath) {
    return NextResponse.json({ error: "No attachment on this item" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from("doc-chase-attachments")
    .createSignedUrl(attachmentPath, 300); // 5 minutes

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    filename: typeof payload.attachment_filename === "string" ? payload.attachment_filename : null,
    contentType: typeof payload.attachment_content_type === "string" ? payload.attachment_content_type : null,
  });
}
