/**
 * POST /api/renewals/[id]/confirm-email
 *
 * Sends a simple confirmation email to the client after the broker
 * has confirmed the renewal. Subject and body are broker-editable.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { writeAuditLog } from "@/lib/audit/log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subject, body } = await request.json();
  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 });
  }

  const { data: policy, error: policyErr } = await supabase
    .from("policies")
    .select("id, client_name, client_email")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (policyErr || !policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  if (!policy.client_email) return NextResponse.json({ error: "No client email on file" }, { status: 422 });

  const { data: agentProfile } = await supabase
    .from("agent_profiles")
    .select("email_from_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const baseFrom = process.env.FROM_EMAIL ?? "noreply@hollisai.com.au";
  const from = agentProfile?.email_from_name
    ? `${agentProfile.email_from_name} <${baseFrom}>`
    : baseFrom;

  const resend = getResendClient();
  const { error: sendErr } = await resend.emails.send({
    from,
    to: policy.client_email.trim(),
    subject: subject.trim(),
    text: body.trim(),
  });

  if (sendErr) return NextResponse.json({ error: "Failed to send email" }, { status: 500 });

  await writeAuditLog({
    supabase,
    policy_id: id,
    user_id: user.id,
    event_type: "email_sent",
    channel: "email",
    content_snapshot: `Confirmation email sent to ${policy.client_name} (${policy.client_email}). Subject: "${subject.trim()}"`,
    metadata: { subject: subject.trim() },
    actor_type: "agent",
  });

  return NextResponse.json({ success: true });
}
