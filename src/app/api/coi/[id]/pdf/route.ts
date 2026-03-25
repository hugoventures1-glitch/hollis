/**
 * GET /api/coi/[id]/pdf
 * Certificate PDF generation — coming soon.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ error: "Certificate generation is coming soon." }, { status: 503 });
}
