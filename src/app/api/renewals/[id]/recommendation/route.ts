/**
 * POST /api/renewals/[id]/recommendation
 *
 * Generates and sends a formal renewal recommendation pack to the client.
 * Requires at least one insurer_terms record for this policy.
 * Uses Claude Sonnet 4.6. Sends via Resend. Writes to audit log.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { generateRecommendationPack } from "@/lib/renewals/recommendation-pack";
import { writeAuditLog } from "@/lib/audit/log";
import type { Policy, InsurerTerms } from "@/types/renewals";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch policy
  const { data: policy, error: policyErr } = await supabase
    .from("policies")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (policyErr || !policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  if (!policy.client_email) return NextResponse.json({ error: "Policy has no client email" }, { status: 400 });

  // Fetch insurer terms — required
  const { data: terms, error: termsErr } = await supabase
    .from("insurer_terms")
    .select("*")
    .eq("policy_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (termsErr) return NextResponse.json({ error: termsErr.message }, { status: 500 });
  if (!terms || terms.length === 0) {
    return NextResponse.json(
      { error: "No insurer terms found for this policy. Log at least one quote first." },
      { status: 400 }
    );
  }

  // Fetch agent profile for name/email/phone
  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("first_name, last_name, phone, agency_name")
    .eq("user_id", user.id)
    .single();

  const agentName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user.email!
    : (user.email ?? "Your Broker");
  const agentEmail = user.email ?? "";
  const agentPhone = profile?.phone ?? null;

  // Generate via Claude Sonnet 4.6
  let pack;
  try {
    pack = await generateRecommendationPack(
      policy as Policy,
      terms as InsurerTerms[],
      agentName,
      agentEmail,
      agentPhone
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 });
  }

  // Send via Resend
  let providerId: string | null = null;
  try {
    const resend = getResendClient();
    const { data: sent } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "noreply@hollis.ai",
      to: policy.client_email,
      subject: pack.subject,
      text: pack.body,
    });
    providerId = sent?.id ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Email send failed: ${msg}` }, { status: 500 });
  }

  // Advance campaign stage
  await supabase
    .from("policies")
    .update({ campaign_stage: "recommendation_sent", last_contact_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  // Write audit log
  await writeAuditLog({
    supabase,
    policy_id: id,
    user_id: user.id,
    event_type: "recommendation_sent",
    channel: "email",
    recipient: policy.client_email,
    content_snapshot: `Subject: ${pack.subject}\n\n${pack.body}`,
    metadata: {
      provider_id: providerId,
      insurer_count: terms.length,
      recommended_insurer: (terms as InsurerTerms[]).find((t) => t.is_recommended)?.insurer_name ?? null,
    },
    actor_type: "agent",
  });

  return NextResponse.json({ sent: true, subject: pack.subject, recipient: policy.client_email });
}
