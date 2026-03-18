import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings/SettingsShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Hollis" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }> | { tab?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load profile (may be null on first visit)
  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Load plan name from agencies (best-effort)
  const { data: agency } = await supabase
    .from("agencies")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const planName = agency?.plan ?? "Free Plan";
  const params = await Promise.resolve(searchParams);

  return (
    <SettingsShell
      profile={profile ?? {}}
      userEmail={user.email ?? ""}
      planName={planName}
      initialTab={params?.tab}
    />
  );
}
