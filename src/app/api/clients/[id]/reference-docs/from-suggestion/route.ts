/**
 * POST /api/clients/[id]/reference-docs/from-suggestion
 *
 * Accepts an AI suggestion to add a doc chase document to the client's
 * AI reference docs. Copies the storage path reference (no file copy needed —
 * both tables point to the same object in Supabase Storage) and marks the
 * approval_queue item as approved.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify client belongs to this broker
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: {
    queue_item_id: string;
    storage_path: string;
    original_filename: string;
    suggested_label: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { queue_item_id, storage_path, original_filename, suggested_label } = body;
  if (!queue_item_id || !storage_path || !original_filename || !suggested_label) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Insert reference doc (storage_path is shared with the doc-chase-attachments bucket)
  const { data: doc, error: insertError } = await supabase
    .from("client_reference_documents")
    .insert({
      client_id: clientId,
      user_id: user.id,
      label: suggested_label,
      storage_path,
      original_filename,
      added_by: "ai",
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Mark approval_queue item as approved
  await supabase
    .from("approval_queue")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", queue_item_id)
    .eq("user_id", user.id);

  return NextResponse.json({ doc }, { status: 201 });
}
