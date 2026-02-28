/**
 * POST /api/coi/[id]/approve
 * Auth required.
 *
 * One-click approval for auto-generated COIs. Sets the request status to
 * 'sent' and marks the linked certificate as sent. Sends COI PDF via Resend.
 *
 * [id] here is the coi_request id.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { renderCOIPDF } from "@/lib/coi/pdf";
import type { Certificate } from "@/types/coi";

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
    .select("id, agent_id, status, certificate_id, requester_email")
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

  try {
    if (coiRequest.certificate_id) {
      const { data: certData, error: certErr } = await supabase
        .from("certificates")
        .select("*")
        .eq("id", coiRequest.certificate_id)
        .eq("user_id", user.id)
        .single();

      if (!certErr && certData) {
        const cert = certData as Certificate;
        const pdfBuffer = await renderCOIPDF(cert);
        const recipient =
          cert.holder_email?.trim() || coiRequest.requester_email?.trim();

        if (recipient) {
          const resend = getResendClient();
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "certs@hollis.ai",
            to: recipient,
            subject: `Certificate of Insurance — ${cert.insured_name}`,
            attachments: [
              {
                filename: `COI-${cert.certificate_number}.pdf`,
                content: pdfBuffer,
              },
            ],
          });
        } else {
          console.warn(
            `[coi/approve] Request ${id}: holder_email and requester_email both null — COI approved, email skipped`
          );
        }
      }
    }
  } catch (err) {
    console.error("[coi/approve] Email delivery failed (approval unchanged):", err);
  }

  console.log(
    `[coi/approve] Request ${id} approved and dispatched by agent ${user.id}`
  );

  return NextResponse.json({ success: true });
}
