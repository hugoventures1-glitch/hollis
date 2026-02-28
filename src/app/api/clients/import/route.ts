/**
 * POST /api/clients/import
 *
 * Bulk-imports clients from CSV-mapped data.
 * Deduplicates: if a client with the same name AND email already exists
 * for this user, the row is counted as a duplicate and skipped.
 *
 * Body: { clients: Array<{ name, email, phone, address, industry, notes }> }
 * Returns: { inserted, duplicates, errors: RowError[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ClientRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  notes: string;
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

  let clients: ClientRow[];
  try {
    const body = await request.json();
    clients = body.clients;
    if (!Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: "No clients provided" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];

  // Process in batches to avoid timeouts
  for (let batchStart = 0; batchStart < clients.length; batchStart += BATCH_SIZE) {
    const batch = clients.slice(batchStart, batchStart + BATCH_SIZE);

    for (let i = 0; i < batch.length; i++) {
      const rowNum = batchStart + i + 1;
      const row = batch[i];

      if (!row.name?.trim()) {
        errors.push({ row: rowNum, reason: "Missing required field: name" });
        continue;
      }

      // Deduplication check — same name (case-insensitive) AND email
      const email = row.email?.trim().toLowerCase() || null;
      const name = row.name.trim();

      let isDuplicate = false;
      if (email) {
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", name)
          .eq("email", email)
          .maybeSingle();
        isDuplicate = !!existing;
      } else {
        // No email — deduplicate by name only
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", name)
          .is("email", null)
          .maybeSingle();
        isDuplicate = !!existing;
      }

      if (isDuplicate) {
        duplicates++;
        continue;
      }

      const { error: insertErr } = await supabase.from("clients").insert({
        user_id: user.id,
        name,
        email,
        phone: row.phone?.trim() || null,
        notes: [row.address?.trim(), row.notes?.trim()].filter(Boolean).join(" | ") || null,
        industry: row.industry?.trim() || null,
        extra: { address: row.address?.trim() || undefined, import_source: "csv" },
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
