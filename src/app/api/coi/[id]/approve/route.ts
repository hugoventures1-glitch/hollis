/**
 * POST /api/coi/[id]/approve
 * Auth required.
 *
 * One-click approval for auto-generated COIs. Sets the request status to
 * 'sent' and marks the linked certificate as sent. No email is dispatched
 * yet — that will be wired in when Resend is ready (same pattern as outbox).
 *
 * [id] here is the coi_request id.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface PageParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: PageParams) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the request to confirm ownership and get the linked certificate id
  const { data: coiRequest, error: fetchErr } = await supabase
    .from("coi_requests")
    .select("id, agent_id, status, certificate_id")
    .eq("id", id)
    .eq("agent_id", user.id)
    .single();

  if (fetchErr || !coiRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (coiRequest.status !== "ready_for_approval") {
    return NextResponse.json(
      { error: `Request is not ready for approval (current status: ${coiRequest.status})` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();

  // Mark request as sent
  const { error: reqErr } = await supabase
    .from("coi_requests")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("agent_id", user.id);

  if (reqErr) {
    return NextResponse.json({ error: reqErr.message }, { status: 500 });
  }

  // Mark the linked certificate as sent
  if (coiRequest.certificate_id) {
    await supabase
      .from("certificates")
      .update({ status: "sent", sent_at: now })
      .eq("id", coiRequest.certificate_id)
      .eq("user_id", user.id);
  }

  // ── TODO: Wire in Resend email delivery here when ready ──────────────────
  // const cert = await supabase.from("certificates").select("*").eq("id", coiRequest.certificate_id).single();
  // const pdfBuffer = await renderCOIPDF(cert.data);
  // const resend = getResendClient();
  // await resend.emails.send({
  //   from: process.env.RESEND_FROM_EMAIL ?? "certs@hollis.ai",
  //   to: cert.data.holder_email ?? coiRequest.requester_email,
  //   subject: `Certificate of Insurance — ${cert.data.insured_name}`,
  //   attachments: [{ filename: `COI-${cert.data.certificate_number}.pdf`, content: pdfBuffer }],
  // });
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    `[coi/approve] Request ${id} approved and dispatched by agent ${user.id}`
  );

  return NextResponse.json({ success: true });
}
