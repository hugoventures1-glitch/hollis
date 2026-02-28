import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";

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

  let subject: string | undefined;
  let body: string | undefined;
  try {
    ({ subject, body } = await request.json());
  } catch {
    // edits are optional — original draft content is fine
  }

  // Fetch the draft to confirm ownership and get policy details for logging
  const { data: draft, error: fetchErr } = await supabase
    .from("outbox_drafts")
    .select("id, subject, body, renewal_id, policies(client_name, client_email)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const finalSubject = subject?.trim() || draft.subject;
  const finalBody = body?.trim() || draft.body;

  const policyData = Array.isArray(draft.policies)
    ? draft.policies[0]
    : draft.policies;
  const clientEmail = policyData?.client_email?.trim();
  if (clientEmail) {
    const resend = getResendClient();
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "outbox@hollis.ai",
      to: clientEmail,
      subject: finalSubject,
      text: finalBody,
    });
  } else {
    console.warn(
      `[outbox/send] Draft ${id} has no client_email — skipping send, marking as sent (agent may follow up manually)`
    );
  }

  console.log(
    `[outbox/send] Agent reviewed and sent draft ${id} to ${policyData?.client_name ?? "client"} — subject: "${finalSubject}"`
  );

  // Persist any edits and mark as sent
  const { error: updateErr } = await supabase
    .from("outbox_drafts")
    .update({
      subject: finalSubject,
      body: finalBody,
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
