/**
 * GET  /api/clients/[id]/reference-docs  — list active reference docs for a client
 * POST /api/clients/[id]/reference-docs  — upload a new reference doc
 * DELETE /api/clients/[id]/reference-docs?docId=  — soft-delete a doc
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("client_reference_documents")
    .select("id, label, original_filename, file_size_bytes, mime_type, added_by, created_at")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ docs: data });
}

// ── POST ──────────────────────────────────────────────────────────────────────

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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const label = (formData.get("label") as string | null)?.trim();

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });

  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF and image files are accepted" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const storagePath = `${user.id}/ref/${clientId}/${safeName}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("policy-documents")
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  const { data: doc, error: insertError } = await supabase
    .from("client_reference_documents")
    .insert({
      client_id: clientId,
      user_id: user.id,
      label,
      storage_path: storagePath,
      original_filename: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      added_by: "broker",
    })
    .select("id, label, original_filename, file_size_bytes, mime_type, added_by, created_at")
    .single();

  if (insertError) {
    // Clean up orphaned storage object
    await admin.storage.from("policy-documents").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ doc }, { status: 201 });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docId = new URL(req.url).searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

  const { error } = await supabase
    .from("client_reference_documents")
    .update({ is_active: false })
    .eq("id", docId)
    .eq("client_id", clientId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
