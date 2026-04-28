/**
 * GET    /api/clients/[id] — single client with profile
 * PATCH  /api/clients/[id] — update client fields (cascades to policies)
 * DELETE /api/clients/[id] — delete client
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("clients")
    .select("*, client_coverage_profiles(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const allowed = [
    "name", "email", "phone", "business_type", "industry",
    "num_employees", "annual_revenue", "owns_vehicles",
    "num_locations", "primary_state", "notes",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const f of allowed) {
    if (f in body) updates[f] = body[f];
  }

  // doc_chase_cadence: merged into the extra JSONB column
  if ("doc_chase_cadence" in body) {
    const cadence = body.doc_chase_cadence;
    if (
      !Array.isArray(cadence) ||
      cadence.length !== 4 ||
      !cadence.every((d: unknown) => typeof d === "number" && Number.isInteger(d) && d >= 0)
    ) {
      return NextResponse.json(
        { error: "doc_chase_cadence must be an array of 4 non-negative integers" },
        { status: 400 }
      );
    }
    // Fetch current extra to merge cleanly
    const { data: cur } = await supabase
      .from("clients")
      .select("extra")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    updates.extra = { ...(cur?.extra ?? {}), doc_chase_cadence: cadence };
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  // Fetch current client so we know the old name (for policy matching)
  const { data: current } = await supabase
    .from("clients")
    .select("name, email, phone")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 500 });

  // Cascade contact fields to policies that were linked by old client name
  const contactChanges: Record<string, unknown> = {};
  if ("name"  in updates) contactChanges.client_name  = updates.name;
  if ("email" in updates) contactChanges.client_email = updates.email;
  if ("phone" in updates) contactChanges.client_phone = updates.phone;

  if (Object.keys(contactChanges).length > 0) {
    const admin = createAdminClient();
    const base = admin.from("policies").update(contactChanges).eq("user_id", user.id);
    // Require BOTH email AND name to match when email is available — prevents
    // over-broad updates if multiple clients share the same email address.
    if (current.email) {
      await base.eq("client_email", current.email).eq("client_name", current.name);
    } else {
      await base.eq("client_name", current.name);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch client first so we can cascade-delete their policies (no FK exists)
  const { data: client } = await supabase
    .from("clients")
    .select("email, name")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (client) {
    const admin = createAdminClient();

    // Fetch policy IDs for this client so we can clean up approval_queue items
    const { data: policies } = await supabase
      .from("policies")
      .select("id, client_email, client_name")
      .eq("user_id", user.id);

    const policyIds = (policies ?? [])
      .filter((p: { id: string; client_email: string | null; client_name: string }) => {
        // Match by email (exact, reliable) when available; fall back to name
        if (client.email) {
          return p.client_email === client.email;
        }
        return p.client_name === client.name;
      })
      .map((p: { id: string }) => p.id);

    // Delete approval_queue items for these policies
    if (policyIds.length > 0) {
      await admin
        .from("approval_queue")
        .delete()
        .in("policy_id", policyIds)
        .eq("user_id", user.id);
    }

    // Delete policies
    const policyDelete = admin.from("policies").delete().eq("user_id", user.id);
    if (client.email) {
      await policyDelete.eq("client_email", client.email);
    } else {
      await policyDelete.eq("client_name", client.name);
    }
  }

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
