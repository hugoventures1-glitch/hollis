import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SidebarNav from "./sidebar-nav";
import { ToastProvider } from "@/components/actions/ToastProvider";
import { CommandBar } from "@/components/assistant/CommandBar";
import { UnifiedPanelProvider } from "@/contexts/UnifiedPanelContext";
import { ProfileCompletionBanner } from "@/components/onboarding/ProfileCompletionBanner";

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

  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("first_name, last_name, agency_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const profileIncomplete =
    !profile?.first_name?.trim() || !profile?.last_name?.trim();

  return (
    <ToastProvider>
      <UnifiedPanelProvider>
        <div className="flex h-screen overflow-hidden">
          <SidebarNav />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {profileIncomplete && <ProfileCompletionBanner />}
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </div>
        <CommandBar />
      </UnifiedPanelProvider>
    </ToastProvider>
  );
}
