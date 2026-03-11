/**
 * POST /api/renewals/[id]/submission
 *
 * Generates and sends an insurer submission document.
 * Pulls from: policy record, client profile, questionnaire responses,
 * policy audit flags, prior insurer terms, agent profile.
 * Uses Claude Sonnet 4.6. Sends to each insurer email via Resend.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/resend/client";
import { generateInsuranceSubmission } from "@/lib/renewals/submission";
import { writeAuditLog } from "@/lib/audit/log";
import type { Policy } from "@/types/renewals";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { insurer_emails } = body as { insurer_emails: string[] };

  if (!insurer_emails || insurer_emails.length === 0) {
    return NextResponse.json({ error: "insurer_emails is required" }, { status: 400 });
  }

  // Fetch policy
  const { data: policy, error: policyErr } = await supabase
    .from("policies")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (policyErr || !policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  // Fetch client profile (match by name — best available link)
  const { data: clientData } = await supabase
    .from("clients")
    .select("name, business_type, industry, num_employees, annual_revenue, owns_vehicles, num_locations, primary_state, notes")
    .eq("user_id", user.id)
    .ilike("name", `%${policy.client_name}%`)
    .maybeSingle();

  // Fetch most recent questionnaire responses
  const { data: questionnaires } = await supabase
    .from("renewal_questionnaires")
    .select("responses")
    .eq("policy_id", id)
    .eq("user_id", user.id)
    .eq("status", "responded")
    .order("responded_at", { ascending: false })
    .limit(1);
  const questionnaireResponses = questionnaires?.[0]?.responses ?? null;

  // Fetch policy audit flags (critical and warning only)
  const { data: latestCheck } = await supabase
    .from("policy_checks")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let auditFlags: Array<{ severity: string; title: string; what_found: string; why_it_matters?: string | null }> = [];
  if (latestCheck) {
    const { data: flags } = await supabase
      .from("policy_check_flags")
      .select("severity, title, what_found, why_it_matters")
      .eq("policy_check_id", latestCheck.id)
      .in("severity", ["critical", "warning"])
      .order("severity");
    auditFlags = flags ?? [];
  }

  // Fetch prior insurer terms
  const { data: priorTerms } = await supabase
    .from("insurer_terms")
    .select("insurer_name, quoted_premium, payment_terms, new_exclusions, changed_conditions")
    .eq("policy_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch agent profile
  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("first_name, last_name, phone, agency_name, agency_afsl")
    .eq("user_id", user.id)
    .single();

  const agentName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user.email!
    : (user.email ?? "Your Broker");
  const agentPhone = profile?.phone ?? null;
  const agencyName = profile?.agency_name ?? null;
  const agencyAfsl = profile?.agency_afsl ?? null;

  // Generate via Claude Sonnet 4.6
  let submission;
  try {
    submission = await generateInsuranceSubmission({
      policy: policy as Policy,
      client: clientData,
      questionnaireResponses: questionnaireResponses as Record<string, string> | null,
      auditFlags,
      priorTerms: priorTerms ?? [],
      agentName,
      agentEmail: user.email ?? "",
      agentPhone,
      agencyName,
      agencyAfsl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 });
  }

  // Send to each insurer email
  const resend = getResendClient();
  const sentTo: string[] = [];
  const sendErrors: string[] = [];

  for (const email of insurer_emails) {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) continue;
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@hollis.ai",
        to: trimmedEmail,
        subject: submission.subject,
        text: submission.body,
      });
      sentTo.push(trimmedEmail);
    } catch (err) {
      sendErrors.push(`${trimmedEmail}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (sentTo.length === 0) {
    return NextResponse.json(
      { error: "All email sends failed", details: sendErrors },
      { status: 500 }
    );
  }

  // Advance stage
  await supabase
    .from("policies")
    .update({ campaign_stage: "submission_sent", last_contact_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  // Write audit log
  await writeAuditLog({
    supabase,
    policy_id: id,
    user_id: user.id,
    event_type: "submission_sent",
    channel: "email",
    recipient: sentTo.join(", "),
    content_snapshot: `Subject: ${submission.subject}\n\n${submission.body}`,
    metadata: {
      sent_to: sentTo,
      send_errors: sendErrors.length > 0 ? sendErrors : undefined,
      insurer_count: sentTo.length,
    },
    actor_type: "agent",
  });

  return NextResponse.json({
    sent_to: sentTo,
    subject: submission.subject,
    errors: sendErrors.length > 0 ? sendErrors : undefined,
  });
}
