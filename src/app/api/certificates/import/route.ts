/**
 * POST /api/certificates/import
 *
 * Bulk-imports certificates.
 * Required: insured_name, holder_name, expiration_date
 * Deduplicates on certificate_number if present.
 *
 * Body: { certificates: Array<{ insured_name, holder_name, holder_email, expiration_date, certificate_number, coverage_type }> }
 * Returns: { inserted, duplicates, errors: RowError[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CertRow {
  insured_name: string;
  holder_name: string;
  holder_email: string;
  expiration_date: string;
  certificate_number: string;
  coverage_type: string;
}

interface RowError {
  row: number;
  reason: string;
}

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let certificates: CertRow[];
  try {
    const body = await request.json();
    certificates = body.certificates;
    if (!Array.isArray(certificates) || certificates.length === 0) {
      return NextResponse.json({ error: "No certificates provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];

  for (let batchStart = 0; batchStart < certificates.length; batchStart += BATCH_SIZE) {
    const batch = certificates.slice(batchStart, batchStart + BATCH_SIZE);

    for (let i = 0; i < batch.length; i++) {
      const rowNum = batchStart + i + 1;
      const row = batch[i];

      // Validate required fields
      const missing = [];
      if (!row.insured_name?.trim()) missing.push("insured_name");
      if (!row.holder_name?.trim()) missing.push("holder_name");
      if (!row.expiration_date?.trim()) missing.push("expiration_date");
      if (missing.length > 0) {
        errors.push({ row: rowNum, reason: `Missing required fields: ${missing.join(", ")}` });
        continue;
      }

      // Deduplicate on certificate_number
      if (row.certificate_number?.trim()) {
        const { data: existing } = await supabase
          .from("certificates")
          .select("id")
          .eq("user_id", user.id)
          .eq("certificate_number", row.certificate_number.trim())
          .maybeSingle();
        if (existing) {
          duplicates++;
          continue;
        }
      }

      // Validate expiration_date format
      const expDate = row.expiration_date?.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
        errors.push({ row: rowNum, reason: `Invalid date format for expiration_date: "${expDate}". Expected YYYY-MM-DD.` });
        continue;
      }

      const { error: insertErr } = await supabase.from("certificates").insert({
        user_id: user.id,
        insured_name: row.insured_name.trim(),
        holder_name: row.holder_name.trim(),
        holder_email: row.holder_email?.trim().toLowerCase() || null,
        expiration_date: expDate,
        certificate_number: row.certificate_number?.trim() || null,
        description: row.coverage_type?.trim() || null,
        coverage_snapshot: {},
        status: "draft",
      });

      if (insertErr) {
        errors.push({ row: rowNum, reason: insertErr.message });
        continue;
      }

      inserted++;
    }
  }

  return NextResponse.json({ inserted, duplicates, errors });
}
