import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SplashScreen } from "./SplashScreen";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profileRes = await supabase
    .from("agent_profiles")
    .select("first_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const firstName = profileRes.data?.first_name ?? null;

  const hour = new Date().getUTCHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <SplashScreen greeting={greeting} firstName={firstName} today={today} />
  );
}
