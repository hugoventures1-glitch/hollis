/**
 * GET /api/policy-checks/[id]/report
 *
 * Generates and streams the printable E&O documentation PDF
 * for a completed policy check.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPolicyCheckReportPDF } from "@/lib/policy-checker/report";
import type { PolicyCheckWithDetails } from "@/types/policies";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data, error } = await supabase
    .from("policy_checks")
    .select(`
      *,
      clients(id, name, business_type, industry),
      policy_check_documents(*),
      policy_check_flags(*)
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return new NextResponse("Check not found", { status: 404 });
  }

  // Sort for consistent report ordering
  const check = data as unknown as PolicyCheckWithDetails;
  check.policy_check_documents?.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  check.policy_check_flags?.sort((a, b) => a.sort_order - b.sort_order);

  try {
    const pdfBuffer = await renderPolicyCheckReportPDF(check);
    const clientName = check.clients?.name
      ? check.clients.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : "policy-check";
    const filename = `hollis-report-${clientName}-${id.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[policy-checks/report] PDF render failed:", err);
    return new NextResponse("PDF generation failed", { status: 500 });
  }
}
