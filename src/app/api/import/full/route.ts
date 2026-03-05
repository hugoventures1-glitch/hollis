/**
 * POST /api/import/full
 *
 * Bulk-imports a full book of business: clients, policies, and certificates
 * from a single CSV export that has been column-mapped by the client.
 *
 * For ≤500 total rows → synchronous: processes inline and returns results.
 * For >500 total rows → async: creates an import_jobs record, returns { jobId }
 *   immediately; a background task (or the first /status poll) will process it.
 *
 * Body: {
 *   clients:      Array<ClientRow>,
 *   policies:     Array<PolicyRow>,
 *   certificates: Array<CertRow>,
 *   async:        boolean,         // true when caller wants async
 * }
 *
 * Sync returns: {
 *   clients:      { inserted, duplicates },
 *   policies:     { inserted, duplicates },
 *   certificates: { inserted, duplicates },
 *   errors:       RowError[],
 * }
 *
 * Async returns: { jobId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── Row interfaces ────────────────────────────────────────────

interface ClientRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  notes: string;
}

interface PolicyRow {
  client_name: string;
  policy_name: string;
  expiration_date: string;
  carrier: string;
  premium?: number;
  client_email: string;
}

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

interface EntityResult {
  inserted: number;
  duplicates: number;
}

interface FullResult {
  clients: EntityResult;
  policies: EntityResult;
  certificates: EntityResult;
  errors: RowError[];
}

const BATCH_SIZE = 50;

// ── Client processing ─────────────────────────────────────────

async function processClients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clients: ClientRow[]
): Promise<{ result: EntityResult; errors: RowError[]; nameEmailMap: Map<string, string> }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];
  // Track inserted clients: normalised_name → id (for policy linking)
  const nameEmailMap = new Map<string, string>();

  for (let batchStart = 0; batchStart < clients.length; batchStart += BATCH_SIZE) {
    const batch = clients.slice(batchStart, batchStart + BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const rowNum = batchStart + i + 1;
      const row = batch[i];
      if (!row.name?.trim()) {
        errors.push({ row: rowNum, reason: "client: missing required field: name" });
        continue;
      }
      const name = row.name.trim();
      const email = row.email?.trim().toLowerCase() || null;

      // Deduplication
      let isDuplicate = false;
      if (email) {
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", name)
          .eq("email", email)
          .maybeSingle();
        isDuplicate = !!existing;
      } else {
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", name)
          .is("email", null)
          .maybeSingle();
        isDuplicate = !!existing;
      }

      if (isDuplicate) {
        duplicates++;
        // Still track for policy linking
        nameEmailMap.set(name.toLowerCase(), email ?? "");
        continue;
      }

      const { data: inserted_row, error: insertErr } = await supabase
        .from("clients")
        .insert({
          user_id: userId,
          name,
          email,
          phone: row.phone?.trim() || null,
          notes: [row.address?.trim(), row.notes?.trim()].filter(Boolean).join(" | ") || null,
          industry: row.industry?.trim() || null,
          extra: { address: row.address?.trim() || undefined, import_source: "csv_full" },
        })
        .select("id")
        .single();

      if (insertErr || !inserted_row) {
        errors.push({ row: rowNum, reason: `client: ${insertErr?.message ?? "insert failed"}` });
        continue;
      }

      inserted++;
      nameEmailMap.set(name.toLowerCase(), email ?? "");
    }
  }

  return { result: { inserted, duplicates }, errors, nameEmailMap };
}

// ── Policy processing ─────────────────────────────────────────

async function processPolicies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  policies: PolicyRow[]
): Promise<{ result: EntityResult; errors: RowError[] }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];

  for (let batchStart = 0; batchStart < policies.length; batchStart += BATCH_SIZE) {
    const batch = policies.slice(batchStart, batchStart + BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const rowNum = batchStart + i + 1;
      const row = batch[i];

      // Require either client_name or policy_name
      if (!row.client_name?.trim() && !row.policy_name?.trim()) {
        errors.push({ row: rowNum, reason: "policy: missing client_name or policy_name" });
        continue;
      }

      // Validate expiration_date
      const expDate = row.expiration_date?.trim();
      if (expDate && !/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
        errors.push({ row: rowNum, reason: `policy: invalid date format: "${expDate}"` });
        continue;
      }

      const clientName = row.client_name?.trim() || null;
      const policyName = row.policy_name?.trim() || (clientName ? `${clientName} Policy` : "Imported Policy");

      // Try to link to client by name
      let clientId: string | null = null;
      if (clientName) {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", clientName)
          .maybeSingle();
        clientId = clientRow?.id ?? null;
      }

      // Deduplicate: same policy_name + client_id
      if (clientId) {
        const { data: existing } = await supabase
          .from("policies")
          .select("id")
          .eq("user_id", userId)
          .eq("client_id", clientId)
          .ilike("name", policyName)
          .maybeSingle();
        if (existing) {
          duplicates++;
          continue;
        }
      }

      const premium = row.premium ?? null;

      const { error: insertErr } = await supabase.from("policies").insert({
        user_id: userId,
        client_id: clientId,
        name: policyName,
        expiration_date: expDate || null,
        carrier: row.carrier?.trim() || null,
        premium: premium !== null ? premium : null,
        status: "active",
        notes: null,
      });

      if (insertErr) {
        errors.push({ row: rowNum, reason: `policy: ${insertErr.message}` });
        continue;
      }

      inserted++;
    }
  }

  return { result: { inserted, duplicates }, errors };
}

// ── Certificate processing ────────────────────────────────────

async function processCertificates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  certificates: CertRow[]
): Promise<{ result: EntityResult; errors: RowError[] }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];

  for (let batchStart = 0; batchStart < certificates.length; batchStart += BATCH_SIZE) {
    const batch = certificates.slice(batchStart, batchStart + BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const rowNum = batchStart + i + 1;
      const row = batch[i];

      const missing = [];
      if (!row.insured_name?.trim()) missing.push("insured_name");
      if (!row.holder_name?.trim()) missing.push("holder_name");
      if (!row.expiration_date?.trim()) missing.push("expiration_date");
      if (missing.length > 0) {
        errors.push({ row: rowNum, reason: `certificate: missing required fields: ${missing.join(", ")}` });
        continue;
      }

      // Deduplicate on certificate_number
      if (row.certificate_number?.trim()) {
        const { data: existing } = await supabase
          .from("certificates")
          .select("id")
          .eq("user_id", userId)
          .eq("certificate_number", row.certificate_number.trim())
          .maybeSingle();
        if (existing) {
          duplicates++;
          continue;
        }
      }

      // Validate date
      const expDate = row.expiration_date?.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
        errors.push({ row: rowNum, reason: `certificate: invalid date format: "${expDate}"` });
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
        user_id: userId,
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
        errors.push({ row: rowNum, reason: `certificate: ${insertErr.message}` });
        continue;
      }

      inserted++;
    }
  }

  return { result: { inserted, duplicates }, errors };
}

// ── Main route handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let clients: ClientRow[] = [];
  let policies: PolicyRow[] = [];
  let certificates: CertRow[] = [];
  let isAsync = false;

  try {
    const body = await request.json();
    clients = Array.isArray(body.clients) ? body.clients : [];
    policies = Array.isArray(body.policies) ? body.policies : [];
    certificates = Array.isArray(body.certificates) ? body.certificates : [];
    isAsync = !!body.async;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const totalRows = clients.length + policies.length + certificates.length;

  if (totalRows === 0) {
    return NextResponse.json({ error: "No data provided" }, { status: 400 });
  }

  // ── Async path: create job record and return immediately ──────
  if (isAsync) {
    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({
        user_id: user.id,
        status: "pending",
        total_rows: totalRows,
        processed_rows: 0,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Failed to create import job" }, { status: 500 });
    }

    // Kick off processing in the background (fire and forget via separate fetch is
    // not available in edge runtime; instead the /status route will check if
    // status=pending and trigger processing on first poll).
    // We store the payload in result_json so the status route can process it.
    await supabase
      .from("import_jobs")
      .update({
        status: "pending",
        result_json: { clients, policies, certificates },
      })
      .eq("id", job.id);

    return NextResponse.json({ jobId: job.id });
  }

  // ── Sync path ────────────────────────────────────────────────

  const allErrors: RowError[] = [];

  // 1. Clients first
  const clientResult = clients.length > 0
    ? await processClients(supabase, user.id, clients)
    : { result: { inserted: 0, duplicates: 0 }, errors: [], nameEmailMap: new Map() };
  allErrors.push(...clientResult.errors);

  // 2. Policies (may link to newly inserted clients)
  const policyResult = policies.length > 0
    ? await processPolicies(supabase, user.id, policies)
    : { result: { inserted: 0, duplicates: 0 }, errors: [] };
  allErrors.push(...policyResult.errors);

  // 3. Certificates
  const certResult = certificates.length > 0
    ? await processCertificates(supabase, user.id, certificates)
    : { result: { inserted: 0, duplicates: 0 }, errors: [] };
  allErrors.push(...certResult.errors);

  const fullResult: FullResult = {
    clients: clientResult.result,
    policies: policyResult.result,
    certificates: certResult.result,
    errors: allErrors,
  };

  return NextResponse.json(fullResult);
}
