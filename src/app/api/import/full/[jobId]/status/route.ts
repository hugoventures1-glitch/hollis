/**
 * GET /api/import/full/[jobId]/status
 *
 * Returns the current status of an async import job.
 * If the job is still pending (payload stored but not yet processed),
 * this route will begin processing it inline — effectively acting as a
 * lightweight background processor triggered by the first client poll.
 *
 * Response shape:
 * {
 *   status:         "pending" | "processing" | "complete" | "failed",
 *   total_rows:     number,
 *   processed_rows: number,
 *   result_json?:   FullResult | null,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ jobId: string }> };

// ── Row interfaces (duplicated here for self-contained server logic) ──

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
  holder_email: string;
  expiration_date: string;
  certificate_number: string;
  coverage_type: string;
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

interface JobPayload {
  clients: ClientRow[];
  policies: PolicyRow[];
  certificates: CertRow[];
}

const BATCH_SIZE = 50;

// ── Processing helpers (mirrored from /route.ts) ─────────────

async function processClients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clients: ClientRow[],
  onProgress: (n: number) => Promise<void>
): Promise<{ result: EntityResult; errors: RowError[] }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];
  let processed = 0;

  for (let batchStart = 0; batchStart < clients.length; batchStart += BATCH_SIZE) {
    const batch = clients.slice(batchStart, batchStart + BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const rowNum = batchStart + i + 1;
      const row = batch[i];
      if (!row.name?.trim()) {
        errors.push({ row: rowNum, reason: "client: missing required field: name" });
        processed++;
        continue;
      }
      const name = row.name.trim();
      const email = row.email?.trim().toLowerCase() || null;

      let isDuplicate = false;
      if (email) {
        const { data: existing } = await supabase
          .from("clients").select("id")
          .eq("user_id", userId).ilike("name", name).eq("email", email).maybeSingle();
        isDuplicate = !!existing;
      } else {
        const { data: existing } = await supabase
          .from("clients").select("id")
          .eq("user_id", userId).ilike("name", name).is("email", null).maybeSingle();
        isDuplicate = !!existing;
      }

      if (isDuplicate) { duplicates++; processed++; await onProgress(processed); continue; }

      const { error: insertErr } = await supabase.from("clients").insert({
        user_id: userId, name, email,
        phone: row.phone?.trim() || null,
        notes: [row.address?.trim(), row.notes?.trim()].filter(Boolean).join(" | ") || null,
        industry: row.industry?.trim() || null,
        extra: { address: row.address?.trim() || undefined, import_source: "csv_full_async" },
      });
      if (insertErr) {
        errors.push({ row: rowNum, reason: `client: ${insertErr.message}` });
      } else {
        inserted++;
      }
      processed++;
      await onProgress(processed);
    }
  }
  return { result: { inserted, duplicates }, errors };
}

async function processPolicies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  policies: PolicyRow[],
  offset: number,
  onProgress: (n: number) => Promise<void>
): Promise<{ result: EntityResult; errors: RowError[] }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];
  let processed = 0;

  for (let batchStart = 0; batchStart < policies.length; batchStart += BATCH_SIZE) {
    const batch = policies.slice(batchStart, batchStart + BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const rowNum = offset + batchStart + i + 1;
      const row = batch[i];

      if (!row.client_name?.trim() && !row.policy_name?.trim()) {
        errors.push({ row: rowNum, reason: "policy: missing client_name or policy_name" });
        processed++; await onProgress(processed + offset); continue;
      }
      const expDate = row.expiration_date?.trim();
      if (expDate && !/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
        errors.push({ row: rowNum, reason: `policy: invalid date format: "${expDate}"` });
        processed++; await onProgress(processed + offset); continue;
      }
      const clientName = row.client_name?.trim() || null;
      const policyName = row.policy_name?.trim() || (clientName ? `${clientName} Policy` : "Imported Policy");

      let clientId: string | null = null;
      if (clientName) {
        const { data: clientRow } = await supabase
          .from("clients").select("id")
          .eq("user_id", userId).ilike("name", clientName).maybeSingle();
        clientId = clientRow?.id ?? null;
      }

      if (clientId) {
        const { data: existing } = await supabase
          .from("policies").select("id")
          .eq("user_id", userId).eq("client_id", clientId).ilike("name", policyName).maybeSingle();
        if (existing) {
          duplicates++; processed++; await onProgress(processed + offset); continue;
        }
      }

      const { error: insertErr } = await supabase.from("policies").insert({
        user_id: userId, client_id: clientId, name: policyName,
        expiration_date: expDate || null, carrier: row.carrier?.trim() || null,
        premium: row.premium ?? null, status: "active", notes: null,
      });
      if (insertErr) {
        errors.push({ row: rowNum, reason: `policy: ${insertErr.message}` });
      } else {
        inserted++;
      }
      processed++; await onProgress(processed + offset);
    }
  }
  return { result: { inserted, duplicates }, errors };
}

async function processCertificates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  certificates: CertRow[],
  offset: number,
  onProgress: (n: number) => Promise<void>
): Promise<{ result: EntityResult; errors: RowError[] }> {
  let inserted = 0;
  let duplicates = 0;
  const errors: RowError[] = [];
  let processed = 0;

  for (let batchStart = 0; batchStart < certificates.length; batchStart += BATCH_SIZE) {
    const batch = certificates.slice(batchStart, batchStart + BATCH_SIZE);
    for (let i = 0; i < batch.length; i++) {
      const rowNum = offset + batchStart + i + 1;
      const row = batch[i];

      const missing = [];
      if (!row.insured_name?.trim()) missing.push("insured_name");
      if (!row.holder_name?.trim()) missing.push("holder_name");
      if (!row.expiration_date?.trim()) missing.push("expiration_date");
      if (missing.length > 0) {
        errors.push({ row: rowNum, reason: `certificate: missing required fields: ${missing.join(", ")}` });
        processed++; await onProgress(processed + offset); continue;
      }

      if (row.certificate_number?.trim()) {
        const { data: existing } = await supabase
          .from("certificates").select("id")
          .eq("user_id", userId).eq("certificate_number", row.certificate_number.trim()).maybeSingle();
        if (existing) {
          duplicates++; processed++; await onProgress(processed + offset); continue;
        }
      }

      const expDate = row.expiration_date?.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
        errors.push({ row: rowNum, reason: `certificate: invalid date format: "${expDate}"` });
        processed++; await onProgress(processed + offset); continue;
      }

      const { error: insertErr } = await supabase.from("certificates").insert({
        user_id: userId,
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
        errors.push({ row: rowNum, reason: `certificate: ${insertErr.message}` });
      } else {
        inserted++;
      }
      processed++; await onProgress(processed + offset);
    }
  }
  return { result: { inserted, duplicates }, errors };
}

// ── GET handler ───────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the job
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // If already done or failed, return immediately
  if (job.status === "complete" || job.status === "failed") {
    return NextResponse.json({
      status: job.status,
      total_rows: job.total_rows,
      processed_rows: job.processed_rows,
      result_json: job.result_json,
    });
  }

  // If still pending: begin processing (first-poll trigger)
  if (job.status === "pending") {
    // Mark as processing immediately to avoid concurrent executions
    await supabase
      .from("import_jobs")
      .update({ status: "processing" })
      .eq("id", jobId)
      .eq("status", "pending"); // optimistic: only update if still pending

    const payload = job.result_json as JobPayload | null;
    if (!payload) {
      await supabase.from("import_jobs").update({ status: "failed" }).eq("id", jobId);
      return NextResponse.json({ status: "failed", total_rows: 0, processed_rows: 0, result_json: null });
    }

    const { clients = [], policies = [], certificates = [] } = payload;
    const totalRows = clients.length + policies.length + certificates.length;
    let cumulativeProcessed = 0;

    // Progress updater — debounced to every 25 rows to reduce DB writes
    let lastWrite = 0;
    const onProgress = async (n: number) => {
      cumulativeProcessed = n;
      if (n - lastWrite >= 25 || n >= totalRows) {
        lastWrite = n;
        await supabase
          .from("import_jobs")
          .update({ processed_rows: n })
          .eq("id", jobId);
      }
    };

    try {
      const allErrors: RowError[] = [];

      const clientResult = clients.length > 0
        ? await processClients(supabase, user.id, clients, onProgress)
        : { result: { inserted: 0, duplicates: 0 }, errors: [] };
      allErrors.push(...clientResult.errors);

      const policyResult = policies.length > 0
        ? await processPolicies(supabase, user.id, policies, clients.length, onProgress)
        : { result: { inserted: 0, duplicates: 0 }, errors: [] };
      allErrors.push(...policyResult.errors);

      const certResult = certificates.length > 0
        ? await processCertificates(supabase, user.id, certificates, clients.length + policies.length, onProgress)
        : { result: { inserted: 0, duplicates: 0 }, errors: [] };
      allErrors.push(...certResult.errors);

      const fullResult: FullResult = {
        clients: clientResult.result,
        policies: policyResult.result,
        certificates: certResult.result,
        errors: allErrors,
      };

      await supabase.from("import_jobs").update({
        status: "complete",
        processed_rows: totalRows,
        result_json: fullResult,
      }).eq("id", jobId);

      return NextResponse.json({
        status: "complete",
        total_rows: totalRows,
        processed_rows: totalRows,
        result_json: fullResult,
      });
    } catch (err) {
      await supabase.from("import_jobs").update({
        status: "failed",
        processed_rows: cumulativeProcessed,
      }).eq("id", jobId);
      console.error("[import/full/status] processing error:", err);
      return NextResponse.json({ status: "failed", total_rows: totalRows, processed_rows: cumulativeProcessed, result_json: null });
    }
  }

  // "processing" — another request is already handling it; return current progress
  return NextResponse.json({
    status: job.status,
    total_rows: job.total_rows,
    processed_rows: job.processed_rows,
    result_json: null,
  });
}
