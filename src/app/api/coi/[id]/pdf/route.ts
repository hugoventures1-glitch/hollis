/**
 * GET /api/coi/[id]/pdf
 * Auth required. Streams the ACORD 25 PDF for a given certificate.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderCOIPDF } from "@/lib/coi/pdf";
import type { Certificate } from "@/types/coi";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: certData, error } = await supabase
    .from("certificates")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !certData) {
    return new NextResponse("Certificate not found", { status: 404 });
  }

  const cert = certData as Certificate;

  try {
    const pdfBuffer = await renderCOIPDF(cert);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="COI-${cert.certificate_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[coi/pdf] Render failed:", err);
    return new NextResponse("PDF generation failed", { status: 500 });
  }
}
