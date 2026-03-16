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
    .select("id, agent_id, status, version, certificate_id, requester_email")
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
  const currentVersion: number = coiRequest.version ?? 0;

  // Atomic update with optimistic lock: only succeeds if version hasn't changed
  const { data: updatedRows, error: reqErr } = await supabase
    .from("coi_requests")
    .update({ status: "sent", version: currentVersion + 1 })
    .eq("id", id)
    .eq("agent_id", user.id)
    .eq("version", currentVersion) // optimistic lock guard
    .select("id");

  if (reqErr) {
    return NextResponse.json({ error: reqErr.message }, { status: 500 });
  }

  if (!updatedRows?.length) {
    return NextResponse.json(
      { error: "This request was modified by another session. Please refresh and try again." },
      { status: 409 }
    );
  }

  // Mark the linked certificate as sent
  if (coiRequest.certificate_id) {
    await supabase
      .from("certificates")
      .update({ status: "sent", sent_at: now })
      .eq("id", coiRequest.certificate_id)
      .eq("user_id", user.id);
  }

  const { data: agentProfile } = await supabase
    .from("agent_profiles")
    .select("email_from_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const baseFrom = process.env.FROM_EMAIL ?? "hugo@hollisai.com.au";
  const from = agentProfile?.email_from_name
    ? `${agentProfile.email_from_name} <${baseFrom}>`
    : baseFrom;

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
            from,
            to: recipient,
            subject: `Certificate of Insurance — ${cert.insured_name}`,
            text: `Please find your Certificate of Insurance attached.\n\nInsured: ${cert.insured_name}\nCertificate #: ${cert.certificate_number}`,
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
