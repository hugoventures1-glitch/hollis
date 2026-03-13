"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useHollisStore, HOLLIS_STALE_MS } from "@/stores/hollisStore";
import {
  LayoutDashboard,
  Activity,
  RefreshCcw,
  Users,
  Award,
  ClipboardCheck,
  FileText,
  Settings,
} from "lucide-react";

interface RailIconProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  pathname: string;
}

function RailIcon({ href, icon: Icon, label, badge, pathname }: RailIconProps) {
  const active =
    href === "/overview"
      ? pathname === "/overview"
      : href === "/certificates"
      ? pathname === "/certificates" || pathname.startsWith("/certificates/")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      title={label}
      className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
      style={{
        color:      active ? "#FAFAFA" : "#484848",
        background: active ? "#1C1C1C" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "#888888";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "#484848";
      }}
    >
      <Icon size={17} strokeWidth={1.6} />
      {!!badge && badge > 0 && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{ background: "#FF4444" }}
        />
      )}
    </Link>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const counts   = useSidebarCounts();

  const [initials,   setInitials]   = useState<string>("H");
  const [agencyName, setAgencyName] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      Promise.all([
        supabase
          .from("agent_profiles")
          .select("agency_name, first_name, last_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("agencies")
          .select("name")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]).then(([profileRes, agencyRes]) => {
        const name =
          profileRes.data?.agency_name ?? agencyRes.data?.name ?? null;
        setAgencyName(name);

        const first = profileRes.data?.first_name?.[0] ?? "";
        const last  = profileRes.data?.last_name?.[0]  ?? "";
        setInitials((first + last).toUpperCase() || "H");
      });
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleNavHover = () => {
    const { lastFetched, fetchAll } = useHollisStore.getState();
    if (!lastFetched || Date.now() - lastFetched > HOLLIS_STALE_MS) {
      fetchAll();
    }
  };

  return (
    <aside
      style={{ width: 56 }}
      className="flex flex-col shrink-0"
      onMouseEnter={handleNavHover}
    >
      {/* Wordmark */}
      <div
        className="flex items-center justify-center h-14 shrink-0"
        style={{ borderBottom: "1px solid #181818" }}
      >
        <Link href="/overview">
          <span
            style={{
              fontFamily:    "var(--font-playfair)",
              fontWeight:    900,
              fontSize:      16,
              color:         "#FAFAFA",
              letterSpacing: "-0.02em",
              lineHeight:    1,
            }}
          >
            h
          </span>
        </Link>
      </div>

      {/* Icon nav rail */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto">
        <RailIcon href="/overview"     icon={LayoutDashboard} label="Overview"     pathname={pathname} />
        <RailIcon href="/activity"     icon={Activity}        label="Activity"     pathname={pathname} />
        <RailIcon href="/renewals"     icon={RefreshCcw}      label="Renewals"     pathname={pathname} badge={counts.renewals} />
        <RailIcon href="/clients"      icon={Users}           label="Clients"      pathname={pathname} />
        <RailIcon href="/certificates" icon={Award}           label="Certificates" pathname={pathname} badge={counts.coi} />
        <RailIcon href="/review"       icon={ClipboardCheck}  label="Review"       pathname={pathname} badge={counts.review} />
        <RailIcon href="/documents"    icon={FileText}        label="Documents"    pathname={pathname} badge={counts.docChase} />
        <RailIcon href="/settings"     icon={Settings}        label="Settings"     pathname={pathname} />
      </nav>

      {/* User avatar / sign-out */}
      <div
        className="flex items-center justify-center h-14 shrink-0"
        style={{ borderTop: "1px solid #181818" }}
      >
        <button
          onClick={handleSignOut}
          title={agencyName ? `${agencyName} — Sign out` : "Sign out"}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors"
          style={{ background: "#1C1C1C", color: "#666666" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#2A2A2A";
            (e.currentTarget as HTMLElement).style.color      = "#999999";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#1C1C1C";
            (e.currentTarget as HTMLElement).style.color      = "#666666";
          }}
        >
          {initials}
        </button>
      </div>
    </aside>
  );
}
