import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SidebarNav from "./sidebar-nav";
import { ToastProvider } from "@/components/actions/ToastProvider";
import AssistantPanelWrapper from "@/components/assistant/AssistantPanelWrapper";
import { UnifiedPanelProvider } from "@/contexts/UnifiedPanelContext";
import { ProfileCompletionBanner } from "@/components/onboarding/ProfileCompletionBanner";
import FeedbackButton from "@/components/feedback/FeedbackButton";
import { TourProvider } from "@/components/tour/TourProvider";
import { NavProgressBar } from "@/components/nav/NavProgressBar";


export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { count: parserCount }] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("first_name, last_name, agency_name, automation_paused, tutorial_completed")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("parser_outcomes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("broker_action", ["approved", "edited"]),
  ]);

  const profileIncomplete =
    !profile?.first_name?.trim() || !profile?.last_name?.trim();

  const autonomousActive = !(profile?.automation_paused ?? false) && (parserCount ?? 0) >= 20;

  return (
    <ToastProvider>
      <UnifiedPanelProvider>
        <TourProvider tutorialCompleted={profile?.tutorial_completed !== false}>
        <div className="flex h-screen overflow-hidden">
          <SidebarNav
            profile={{
              firstName:  profile?.first_name  ?? null,
              lastName:   profile?.last_name   ?? null,
              agencyName: profile?.agency_name ?? null,
              email:      user.email           ?? null,
            }}
            autonomousActive={autonomousActive}
          />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <NavProgressBar />
            {profileIncomplete && <ProfileCompletionBanner />}
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </div>
        <AssistantPanelWrapper />
        <FeedbackButton />
        </TourProvider>
      </UnifiedPanelProvider>
    </ToastProvider>
  );
}
