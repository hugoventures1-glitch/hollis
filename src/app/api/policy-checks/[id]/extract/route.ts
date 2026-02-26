/**
 * POST /api/policy-checks/[id]/extract
 *
 * Downloads a PDF from Supabase Storage, sends it to Claude for structured
 * extraction, and stores the results in policy_check_documents.
 *
 * Call once per uploaded document. Extractions run sequentially from the client
 * to avoid Claude rate limits on large files.
 */
export const maxDuration = 60;  // Vercel Pro — extend timeout for large PDFs

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPolicyFromPDF } from "@/lib/policy-checker/extract";
import type { ExtractDocumentInput } from "@/types/policies";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: checkId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify check belongs to this user
  const { data: check } = await supabase
    .from("policy_checks")
    .select("id")
    .eq("id", checkId)
    .eq("user_id", user.id)
    .single();

  if (!check) return NextResponse.json({ error: "Check not found" }, { status: 404 });

  const body: ExtractDocumentInput = await request.json();
  const { storage_path, original_filename, file_size_bytes } = body;

  if (!storage_path || !original_filename) {
    return NextResponse.json({ error: "storage_path and original_filename are required" }, { status: 400 });
  }

  // Create document row in "processing" state
  const { data: docRow, error: insertError } = await supabase
    .from("policy_check_documents")
    .insert({
      policy_check_id: checkId,
      user_id: user.id,
      storage_path,
      original_filename,
      file_size_bytes: file_size_bytes ?? null,
      extraction_status: "processing",
    })
    .select("id")
    .single();

  if (insertError || !docRow) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create document record" }, { status: 500 });
  }

  try {
    // Download PDF from Supabase Storage using admin client (bypasses storage RLS edge cases)
    const adminSupabase = createAdminClient();
    const { data: fileData, error: downloadError } = await adminSupabase.storage
      .from("policy-documents")
      .download(storage_path);

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? "Failed to download PDF from storage");
    }

    // Blob → Buffer → base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Send to Claude for extraction
    const extracted = await extractPolicyFromPDF(base64);

    // Update document row with results
    await supabase
      .from("policy_check_documents")
      .update({
        extraction_status: "complete",
        extracted_data: extracted,
        extracted_named_insured: extracted.named_insured,
        extracted_policy_number: extracted.policy_number,
        extracted_carrier: extracted.carrier,
        extracted_effective_date: extracted.effective_date ?? null,
        extracted_expiry_date: extracted.expiry_date ?? null,
        extracted_coverage_lines: extracted.coverage_lines.map(l => l.coverage_type),
      })
      .eq("id", docRow.id)
      .eq("user_id", user.id);

  } catch (err) {
    console.error("[policy-checks/extract] Extraction failed:", err);

    // Mark as failed — don't fail the whole check, allow partial results
    await supabase
      .from("policy_check_documents")
      .update({
        extraction_status: "failed",
        extraction_error: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("id", docRow.id)
      .eq("user_id", user.id);

    // Still increment document count so caller gets an accurate total
    // (read-then-write — no atomic RPC available)
    const { data: currentCheck } = await supabase
      .from("policy_checks")
      .select("document_count")
      .eq("id", checkId)
      .single();

    if (currentCheck) {
      await supabase
        .from("policy_checks")
        .update({ document_count: (currentCheck.document_count ?? 0) + 1 })
        .eq("id", checkId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      document_id: docRow.id,
      extraction_status: "failed",
      error: err instanceof Error ? err.message : "Extraction failed",
    }, { status: 200 });  // 200 so wizard continues
  }

  // Increment document_count on the check
  const { data: currentCheck } = await supabase
    .from("policy_checks")
    .select("document_count")
    .eq("id", checkId)
    .single();

  if (currentCheck) {
    await supabase
      .from("policy_checks")
      .update({ document_count: (currentCheck.document_count ?? 0) + 1 })
      .eq("id", checkId)
      .eq("user_id", user.id);
  }

  // Fetch the completed document to return
  const { data: completedDoc } = await supabase
    .from("policy_check_documents")
    .select("id, extraction_status, extracted_named_insured, extracted_policy_number, extracted_carrier, extracted_coverage_lines")
    .eq("id", docRow.id)
    .single();

  return NextResponse.json(completedDoc ?? { document_id: docRow.id, extraction_status: "complete" });
}
