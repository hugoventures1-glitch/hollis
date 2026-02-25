/**
 * GET  /api/coi/[id]   — certificate detail
 * PATCH /api/coi/[id]  — send COI (status → sent + email) or update status
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { renderCOIPDF } from "@/lib/coi/pdf";
import type { Certificate } from "@/types/coi";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // ── Send flow ─────────────────────────────────────────────
  if (body.action === "send") {
    const recipientEmail: string = body.email;
    if (!recipientEmail) {
      return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
    }

    // Fetch certificate
    const { data: certData, error: certErr } = await supabase
      .from("certificates")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (certErr || !certData) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }

    const cert = certData as Certificate;

    // Generate PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderCOIPDF(cert);
    } catch (err) {
      console.error("[coi/send] PDF generation failed:", err);
      return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
    }

    // Send via Resend
    const resend = getResendClient();
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "certs@hollis.ai",
        to: recipientEmail,
        subject: `Certificate of Insurance — ${cert.insured_name} (${cert.certificate_number})`,
        text: [
          `Hi,`,
          ``,
          `Please find attached the Certificate of Liability Insurance for ${cert.insured_name}.`,
          ``,
          `Certificate Number: ${cert.certificate_number}`,
          `Insured: ${cert.insured_name}`,
          `Certificate Holder: ${cert.holder_name}`,
          cert.expiration_date ? `Coverage Expires: ${cert.expiration_date}` : "",
          ``,
          `This certificate is issued as a matter of information only and confers no rights upon the certificate holder.`,
        ]
          .filter(l => l !== null)
          .join("\n"),
        attachments: [
          {
            filename: `COI-${cert.certificate_number}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    } catch (err) {
      console.error("[coi/send] Resend failed:", err);
      return NextResponse.json({ error: "Email delivery failed" }, { status: 500 });
    }

    // Update certificate + linked request
    const { data: updated } = await supabase
      .from("certificates")
      .update({ status: "sent", sent_to_email: recipientEmail, sent_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (cert.request_id) {
      await supabase
        .from("coi_requests")
        .update({ status: "sent" })
        .eq("id", cert.request_id)
        .eq("agent_id", user.id);
    }

    return NextResponse.json(updated);
  }

  // ── Generic field update ──────────────────────────────────
  const allowed = ["status", "description", "additional_insured_language"];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) {
    if (f in body) updates[f] = body[f];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("certificates")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
