import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/settings/bulk-delete
 *
 * Wipes all operational data for the authenticated user.
 * Preserves: auth account, agent_profiles (name, agency, standing orders).
 * Order respects foreign key constraints / cascades.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const uid = user.id;

  try {
    // ── Renewals ──────────────────────────────────────────────────────────────
    // policies → cascades campaign_touchpoints, send_logs, renewal_audit_log
    await admin.from("policies").delete().eq("user_id", uid);

    // Renewal support tables (not cascaded from policies)
    await admin.from("renewal_questionnaires").delete().eq("user_id", uid);
    await admin.from("insurer_terms").delete().eq("user_id", uid);
    await admin.from("inbound_signals").delete().eq("user_id", uid);
    await admin.from("approval_queue").delete().eq("user_id", uid);
    await admin.from("parser_outcomes").delete().eq("user_id", uid);

    // Email templates
    await admin.from("email_templates").delete().eq("user_id", uid);

    // Outbox drafts
    await admin.from("outbox_drafts").delete().eq("user_id", uid);

    // Import jobs
    await admin.from("import_jobs").delete().eq("user_id", uid);

    // ── Doc chase ─────────────────────────────────────────────────────────────
    // doc_chase_requests → cascades doc_chase_sequences, doc_chase_messages
    await admin.from("doc_chase_requests").delete().eq("user_id", uid);

    // ── COI / Certificates ───────────────────────────────────────────────────
    // certificates → cascades holder_followup_sequences, holder_followup_messages
    await admin.from("certificates").delete().eq("user_id", uid);
    // coi_requests (agent_id) → cascades certificate_events
    await admin.from("coi_requests").delete().eq("agent_id", uid);
    await admin.from("certificate_holders").delete().eq("user_id", uid);
    await admin.from("holder_request_history").delete().eq("user_id", uid);

    // ── Policy checks ────────────────────────────────────────────────────────
    // policy_checks → cascades policy_check_documents, policy_check_flags
    await admin.from("policy_checks").delete().eq("user_id", uid);

    // ── Clients ──────────────────────────────────────────────────────────────
    await admin.from("client_coverage_profiles").delete().eq("user_id", uid);
    await admin.from("clients").delete().eq("user_id", uid);

    // ── Activity log ─────────────────────────────────────────────────────────
    await admin.from("hollis_actions").delete().eq("broker_id", uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
