import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SidebarNav from "./sidebar-nav";
import { ToastProvider } from "@/components/actions/ToastProvider";
import AssistantPanelWrapper from "@/components/assistant/AssistantPanelWrapper";
import { UnifiedPanelProvider } from "@/contexts/UnifiedPanelContext";

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

  return (
    <ToastProvider>
      <UnifiedPanelProvider>
        <div className="flex h-screen overflow-hidden">
          <SidebarNav />
          <main className="flex-1 overflow-hidden">{children}</main>
          <AssistantPanelWrapper />
        </div>
      </UnifiedPanelProvider>
    </ToastProvider>
  );
}
