/**
 * PATCH /api/clients/[id]/knowledge-base
 *
 * Saves the broker's freeform knowledge base text for a client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: clientId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let knowledge_base: string;
  try {
    ({ knowledge_base } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof knowledge_base !== "string") {
    return NextResponse.json({ error: "knowledge_base must be a string" }, { status: 400 });
  }

  const { error } = await supabase
    .from("clients")
    .update({ knowledge_base })
    .eq("id", clientId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
