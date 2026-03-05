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
  holder_email?: string;
  holder_address?: string;
  expiration_date: string;
  effective_date?: string;
  certificate_number?: string;
  coverage_type?: string;
  policy_number?: string;
  line_of_business?: string;
  additional_insured?: string;
  requested_by?: string;
  requested_date?: string;
  insured_email?: string;
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

      const descParts = [row.coverage_type?.trim(), row.line_of_business?.trim()].filter(Boolean);
      const description = descParts.length > 0 ? descParts.join(" · ") : null;

      const coverageSnapshot: Record<string, unknown> = {};
      if (row.policy_number?.trim()) coverageSnapshot.policy_number = row.policy_number.trim();
      if (row.requested_by?.trim()) coverageSnapshot.requested_by = row.requested_by.trim();
      if (row.requested_date?.trim()) coverageSnapshot.requested_date = row.requested_date.trim();
      if (row.insured_email?.trim()) coverageSnapshot.insured_email = row.insured_email.trim().toLowerCase();

      const { error: insertErr } = await supabase.from("certificates").insert({
        user_id: user.id,
        insured_name: row.insured_name.trim(),
        holder_name: row.holder_name.trim(),
        holder_email: row.holder_email?.trim().toLowerCase() || null,
        holder_address: row.holder_address?.trim() || null,
        expiration_date: expDate,
        effective_date: row.effective_date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(row.effective_date.trim()) ? row.effective_date.trim() : null,
        certificate_number: row.certificate_number?.trim() || null,
        additional_insured_language: row.additional_insured?.trim() || null,
        description,
        coverage_snapshot: Object.keys(coverageSnapshot).length > 0 ? coverageSnapshot : {},
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
