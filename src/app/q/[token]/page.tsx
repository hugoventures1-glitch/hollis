/**
 * /q/[token] — Public client renewal questionnaire.
 *
 * No authentication required. Uses the admin (service role) client to look up
 * the questionnaire by cryptographic token. Never exposes user_id.
 */
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuestionnaireForm } from "./QuestionnaireForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("renewal_questionnaires")
    .select("policy_id, policies(policy_name, client_name)")
    .eq("token", token)
    .maybeSingle();

  const policyName = (data?.policies as unknown as { policy_name?: string } | null)?.policy_name;
  const clientName = (data?.policies as unknown as { client_name?: string } | null)?.client_name;

  return {
    title: clientName ? `Renewal Questionnaire — ${clientName}` : "Renewal Questionnaire",
    description: policyName
      ? `Please complete this renewal questionnaire for your ${policyName}.`
      : "Please complete this renewal questionnaire from your insurance broker.",
  };
}

export default async function QuestionnairePage({ params }: PageProps) {
  const { token } = await params;

  const supabase = createAdminClient();

  const { data: questionnaire, error } = await supabase
    .from("renewal_questionnaires")
    .select(`
      id,
      status,
      expires_at,
      policy_id,
      policies (
        policy_name,
        client_name,
        carrier,
        expiration_date
      )
    `)
    .eq("token", token)
    .maybeSingle();

  if (error || !questionnaire) notFound();

  const now = new Date();
  const expired = new Date(questionnaire.expires_at) < now;
  const policy = questionnaire.policies as unknown as {
    policy_name: string;
    client_name: string;
    carrier: string;
    expiration_date: string;
  } | null;

  const expiryFormatted = policy?.expiration_date
    ? new Date(policy.expiration_date + "T00:00:00").toLocaleDateString("en-AU", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-[#0d0d12] text-[#f5f5f7]">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Logo / branding */}
        <div className="mb-10">
          <div className="text-[13px] font-semibold text-[#00d4aa] tracking-widest uppercase mb-1">
            Hollis
          </div>
          <div className="text-[11px] text-[#505057]">Insurance renewal questionnaire</div>
        </div>

        {/* Policy context */}
        {policy && (
          <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] px-5 py-4 mb-8">
            <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest mb-2">
              Policy
            </div>
            <div className="text-[17px] font-bold text-[#f5f5f7]">{policy.policy_name}</div>
            <div className="text-[13px] text-[#8a8b91] mt-0.5">{policy.carrier}</div>
            {expiryFormatted && (
              <div className="text-[12px] text-[#505057] mt-2">Renewal due: {expiryFormatted}</div>
            )}
          </div>
        )}

        {/* Responded state */}
        {questionnaire.status === "responded" && (
          <div className="rounded-xl bg-[#00d4aa]/[0.06] border border-[#00d4aa]/20 px-5 py-6 text-center">
            <div className="text-[18px] font-bold text-[#00d4aa] mb-2">Already submitted</div>
            <p className="text-[14px] text-[#8a8b91]">
              We already have your responses. Your broker will be in touch soon.
            </p>
          </div>
        )}

        {/* Expired state */}
        {questionnaire.status !== "responded" && expired && (
          <div className="rounded-xl bg-amber-950/20 border border-amber-800/30 px-5 py-6 text-center">
            <div className="text-[18px] font-bold text-amber-400 mb-2">Link expired</div>
            <p className="text-[14px] text-[#8a8b91]">
              This questionnaire link has expired. Please contact your broker for a new link.
            </p>
          </div>
        )}

        {/* Active form */}
        {questionnaire.status === "sent" && !expired && (
          <>
            <div className="mb-8">
              <h1 className="text-[26px] font-bold text-[#f5f5f7] mb-3 leading-tight">
                Help us renew your cover accurately
              </h1>
              <p className="text-[15px] text-[#8a8b91] leading-relaxed">
                Before your policy renews, please take 5 minutes to answer these questions.
                Your answers help us ensure your coverage still matches your needs and identify
                any gaps before renewal.
              </p>
            </div>

            <QuestionnaireForm token={token} />
          </>
        )}

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-[#1e1e2a]">
          <p className="text-[11px] text-[#505057] text-center leading-relaxed">
            This questionnaire was sent by your insurance broker via Hollis.
            Your responses are private and will only be shared with your broker.
          </p>
        </div>
      </div>
    </div>
  );
}
