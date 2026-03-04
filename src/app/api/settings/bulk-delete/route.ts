import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dev-only: Delete all user data except account + agent_profile.
 * Use admin client to bypass RLS where needed.
 * Order respects foreign keys and cascades.
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
    // 1. Policies → cascades campaign_touchpoints, send_logs
    await admin.from("policies").delete().eq("user_id", uid);

    // 2. Doc chase requests → cascades sequences, messages
    await admin.from("doc_chase_requests").delete().eq("user_id", uid);

    // 3. Certificates → cascades holder_followup_sequences, holder_followup_messages
    await admin.from("certificates").delete().eq("user_id", uid);

    // 4. COI requests (agent_id) → cascades certificate_events
    await admin.from("coi_requests").delete().eq("agent_id", uid);

    // 5. Certificate holders
    await admin.from("certificate_holders").delete().eq("user_id", uid);

    // 6. Policy checks → cascades policy_check_documents, policy_check_flags
    await admin.from("policy_checks").delete().eq("user_id", uid);

    // 7. Client coverage profiles (before clients)
    await admin.from("client_coverage_profiles").delete().eq("user_id", uid);

    // 8. Clients
    await admin.from("clients").delete().eq("user_id", uid);

    // 9. Email templates
    await admin.from("email_templates").delete().eq("user_id", uid);

    // 10. Outbox drafts
    await admin.from("outbox_drafts").delete().eq("user_id", uid);

    // 11. Import jobs
    await admin.from("import_jobs").delete().eq("user_id", uid);

    // 12. Holder request history
    await admin.from("holder_request_history").delete().eq("user_id", uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
